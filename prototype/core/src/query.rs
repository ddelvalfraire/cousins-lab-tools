//! DuckDB over a session's Parquet files. Nothing is copied into a database file.
//!
//! Every capture becomes two views, `"cap:<capture>"` for samples and `"ev:<capture>"` for
//! events. Alias columns from the instrument profile (m44 for ch3, for example) are added to
//! the samples view. Session markers are the view `markers`. A directory without a finished
//! part gets no view, so a capture that recorded nothing has none.

use std::collections::BTreeSet;
use std::fmt;
use std::io;
use std::path::Path;

use chrono::{DateTime, Utc};
use duckdb::{Config, Connection};
use serde::Serialize;

use crate::contract::{Clock, ClockKind};
use crate::pycompat::{float_repr, str_repr};
use crate::session::{Manifest, SessionError, iso, iso_time_opt, segments};
use crate::templates::TemplateError;

#[derive(Debug)]
pub enum AnalysisError {
    Db(duckdb::Error),
    Session(SessionError),
    Template(TemplateError),
    /// No saved alignment has this id.
    AlignmentNotFound(String),
    /// A request that names something the session does not have.
    Invalid(String),
}

impl fmt::Display for AnalysisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnalysisError::Db(e) => write!(f, "{e}"),
            AnalysisError::Session(e) => write!(f, "{e}"),
            AnalysisError::Template(e) => write!(f, "{e}"),
            AnalysisError::AlignmentNotFound(id) => write!(f, "Not found: {}", str_repr(id)),
            AnalysisError::Invalid(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AnalysisError {}

impl From<duckdb::Error> for AnalysisError {
    fn from(e: duckdb::Error) -> Self {
        AnalysisError::Db(e)
    }
}

impl From<SessionError> for AnalysisError {
    fn from(e: SessionError) -> Self {
        AnalysisError::Session(e)
    }
}

impl From<io::Error> for AnalysisError {
    fn from(e: io::Error) -> Self {
        AnalysisError::Session(e.into())
    }
}

impl From<serde_json::Error> for AnalysisError {
    fn from(e: serde_json::Error) -> Self {
        AnalysisError::Session(e.into())
    }
}

impl From<TemplateError> for AnalysisError {
    fn from(e: TemplateError) -> Self {
        AnalysisError::Template(e)
    }
}

/// SQL for a clock's value in seconds: epoch seconds for wall clocks, scaled counts otherwise.
pub fn clock_seconds_sql(clock: &Clock) -> String {
    let column = ident(&clock.column);
    match clock.kind {
        ClockKind::HostUtc | ClockKind::SourceLocal => format!("epoch_us({column}) / 1e6"),
        ClockKind::DeviceRelative | ClockKind::Elapsed => {
            format!("{column} * {}", float_repr(clock.seconds_per_unit))
        }
    }
}

pub fn sql_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// An in-memory DuckDB connection with the session's views, and the names of those views.
pub struct SessionDb {
    con: Connection,
    views: BTreeSet<String>,
}

impl SessionDb {
    /// Views over every finished part, then the connection is locked to the session folder:
    /// no file outside it can be read or written, no extension can be installed or loaded,
    /// and no setting can be changed back. The bundled DuckDB has no ICU, and DuckDB would
    /// otherwise download it the first time a query needs time zones.
    pub fn open(session_dir: &Path, manifest: &Manifest) -> Result<Self, AnalysisError> {
        let config = Config::default().enable_autoload_extension(false)?;
        let mut db = SessionDb {
            con: Connection::open_in_memory_with_flags(config)?,
            views: BTreeSet::new(),
        };
        for (cid, capture) in &manifest.captures {
            let cdir = session_dir.join("captures").join(cid);
            let aliases: String = capture
                .aliases
                .iter()
                .map(|(alias, column)| format!(", {} AS {}", ident(column), ident(alias)))
                .collect();
            if let Some(parts) = parts_glob(&cdir.join("samples"))? {
                let sql = format!("SELECT *{aliases} FROM read_parquet({parts})");
                db.create_view(&format!("cap:{cid}"), &sql)?;
            }
            if let Some(parts) = parts_glob(&cdir.join("events"))? {
                db.create_view(
                    &format!("ev:{cid}"),
                    &format!("SELECT * FROM read_parquet({parts})"),
                )?;
            }
        }
        if let Some(parts) = parts_glob(&session_dir.join("markers"))? {
            db.create_view("markers", &format!("SELECT * FROM read_parquet({parts})"))?;
        }
        // allowed_directories can only be set while external access is still on.
        db.con.execute_batch(&format!(
            "SET allowed_directories = [{}]; \
             SET enable_external_access = false; \
             SET lock_configuration = true;",
            sql_string(&session_dir.to_string_lossy())
        ))?;
        Ok(db)
    }

    pub fn connection(&self) -> &Connection {
        &self.con
    }

    pub fn has_view(&self, name: &str) -> bool {
        self.views.contains(name)
    }

    /// View names in sorted order.
    pub fn views(&self) -> impl Iterator<Item = &str> {
        self.views.iter().map(String::as_str)
    }

    pub fn create_view(&mut self, name: &str, select: &str) -> Result<(), AnalysisError> {
        self.con
            .execute_batch(&format!("CREATE VIEW {} AS {select}", ident(name)))?;
        self.views.insert(name.to_string());
        Ok(())
    }
}

/// The quoted `part-*.parquet` glob of a directory, when it holds at least one finished part.
fn parts_glob(dir: &Path) -> Result<Option<String>, SessionError> {
    Ok((!segments(dir)?.is_empty())
        .then(|| sql_string(&dir.join("part-*.parquet").to_string_lossy())))
}

/// A capture event or operator marker with its stored times.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SessionEvent {
    /// The capture id, or `operator` for markers.
    pub source: String,
    pub kind: String,
    pub label: String,
    #[serde(with = "iso_time_opt")]
    pub t_host_utc: Option<DateTime<Utc>>,
    pub clock: Option<String>,
    pub t_native: Option<f64>,
    pub value: Option<f64>,
    /// Seconds on the run clock; None for imports, which have no run start.
    pub x_run_s: Option<f64>,
}

/// Every capture event and operator marker, in run-clock order with run-less events last.
pub fn session_events(
    session_dir: &Path,
    manifest: &Manifest,
) -> Result<Vec<SessionEvent>, AnalysisError> {
    let db = SessionDb::open(session_dir, manifest)?;
    let start = manifest.run.as_ref().and_then(|run| run.group_start_utc);
    let x_run = match start {
        Some(start) => format!(
            "epoch_us(t_host_utc) / 1e6 - epoch_us({}::TIMESTAMPTZ) / 1e6",
            sql_string(&iso(start))
        ),
        None => "NULL::DOUBLE".into(),
    };
    let sources = manifest
        .captures
        .keys()
        .map(|cid| (cid.as_str(), format!("ev:{cid}")))
        .chain([("operator", "markers".to_string())]);
    let mut events = Vec::new();
    for (source, view) in sources {
        if !db.has_view(&view) {
            continue;
        }
        let mut stmt = db.connection().prepare(&format!(
            "SELECT kind, label, t_host_utc, clock, t_native, value, {x_run} AS x_run_s \
             FROM {} ORDER BY seq",
            ident(&view)
        ))?;
        let rows = stmt.query_map([], |r| {
            Ok(SessionEvent {
                source: source.to_string(),
                kind: r.get(0)?,
                label: r.get(1)?,
                t_host_utc: r.get(2)?,
                clock: r.get(3)?,
                t_native: r.get(4)?,
                value: r.get(5)?,
                x_run_s: r.get(6)?,
            })
        })?;
        for row in rows {
            events.push(row?);
        }
    }
    events.sort_by(|a, b| match (a.x_run_s, b.x_run_s) {
        (Some(a), Some(b)) => a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal),
        (a, b) => a.is_none().cmp(&b.is_none()),
    });
    Ok(events)
}
