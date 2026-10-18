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

use chrono::{DateTime, NaiveDateTime, Utc};
use duckdb::arrow::datatypes::DataType;
use duckdb::{Config, Connection, ToSql};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::alignment::{Alignment, create_aligned_view};
use crate::calc::{Program, Sample};
use crate::contract::{Clock, ClockKind};
use crate::expr::Params;
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
    /// No analysis record has this id.
    RecordNotFound(String),
    /// A request that names something the session does not have.
    Invalid(String),
    /// A researcher's SQL failed, as `<Kind>Exception: <message>`.
    Query(String),
}

impl fmt::Display for AnalysisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnalysisError::Db(e) => write!(f, "{e}"),
            AnalysisError::Session(e) => write!(f, "{e}"),
            AnalysisError::Template(e) => write!(f, "{e}"),
            AnalysisError::AlignmentNotFound(id) => write!(f, "Not found: {}", str_repr(id)),
            AnalysisError::RecordNotFound(id) => write!(f, "No record {id}"),
            AnalysisError::Invalid(message) | AnalysisError::Query(message) => {
                write!(f, "{message}")
            }
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

/// One stored row's derived values, as a program computed them.
#[derive(Clone, Debug, PartialEq)]
pub struct ComputedRow {
    pub seq: i64,
    /// In the program's output order; None where the value has no number.
    pub values: Vec<Option<f64>>,
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

    /// Runs `program` over every stored row of `capture` in `seq` order, with `params`. A
    /// column that is not numeric reads as None, as it does live.
    pub fn evaluate(
        &self,
        program: &Program,
        params: &Params,
        capture: &str,
    ) -> Result<Vec<ComputedRow>, AnalysisError> {
        let t_s = match program.clock() {
            Some(clock) => format!(
                "TRY_CAST({} AS DOUBLE) * {}",
                ident(&clock.column),
                float_repr(clock.seconds_per_unit)
            ),
            None => "NULL::DOUBLE".into(),
        };
        let columns: String = program
            .columns()
            .iter()
            .map(|c| format!(", TRY_CAST({} AS DOUBLE)", ident(c)))
            .collect();
        let mut stmt = self.con.prepare(&format!(
            "SELECT seq, {t_s}{columns} FROM {} ORDER BY seq",
            ident(&format!("cap:{capture}"))
        ))?;
        let mut rows = stmt.query([])?;
        let mut eval = program.evaluator(params);
        let mut out = Vec::new();
        let mut cells = vec![None; program.columns().len()];
        while let Some(row) = rows.next()? {
            for (i, cell) in cells.iter_mut().enumerate() {
                *cell = row.get::<_, Option<f64>>(i + 2)?;
            }
            out.push(ComputedRow {
                seq: row.get(0)?,
                values: eval.push(Sample {
                    t_s: row.get(1)?,
                    columns: &cells,
                }),
            });
        }
        Ok(out)
    }

    /// An in-memory table `name` with `seq BIGINT` and one DOUBLE per value, filled from
    /// `rows`. It reads and writes no file, so the locked configuration allows it.
    pub fn attach_computed(
        &mut self,
        name: &str,
        values: &[&str],
        rows: impl IntoIterator<Item = ComputedRow>,
    ) -> Result<(), AnalysisError> {
        let columns: String = values
            .iter()
            .map(|v| format!(", {} DOUBLE", ident(v)))
            .collect();
        self.con.execute_batch(&format!(
            "CREATE TEMP TABLE {} (seq BIGINT{columns})",
            ident(name)
        ))?;
        let mut appender = self.con.appender_to_catalog_and_db(name, "temp", "main")?;
        for row in rows {
            let mut cells: Vec<&dyn ToSql> = Vec::with_capacity(row.values.len() + 1);
            cells.push(&row.seq);
            cells.extend(row.values.iter().map(|v| v as &dyn ToSql));
            appender.append_row(cells.as_slice())?;
        }
        appender.flush()?;
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

pub const MAX_QUERY_ROWS: usize = 500;

/// What a researcher's query returned: at most [`MAX_QUERY_ROWS`] rows.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct QueryResult {
    pub views: Vec<String>,
    pub rows: Vec<Map<String, Value>>,
    pub truncated: bool,
}

/// Runs one researcher's SELECT over the session's views, and `aligned` when an alignment is
/// given. The text goes to DuckDB's `query()` as a string literal, which parses it as exactly
/// one SELECT, so it cannot end the wrapper and run a second statement such as `COPY`.
pub fn run_query(
    session_dir: &Path,
    manifest: &Manifest,
    alignment: Option<&Alignment>,
    sql: &str,
) -> Result<QueryResult, AnalysisError> {
    let mut db = SessionDb::open(session_dir, manifest)?;
    if let Some(alignment) = alignment {
        create_aligned_view(&mut db, manifest, alignment)?;
    }
    let views = db.views().map(String::from).collect();
    let text = sql.trim_end().trim_end_matches(';');
    let wrapped = format!(
        "SELECT * FROM query({}) LIMIT {}",
        sql_string(text),
        MAX_QUERY_ROWS + 1
    );
    let user_error = |e: duckdb::Error| AnalysisError::Query(python_error(&e.to_string()));
    let mut stmt = db.connection().prepare(&wrapped).map_err(user_error)?;
    let mut rows = stmt.query([]).map_err(user_error)?;
    let stmt = rows.as_ref().expect("a query has its statement");
    let names = stmt.column_names();
    let zoned: Vec<bool> = (0..names.len())
        .map(|i| matches!(stmt.column_type(i), DataType::Timestamp(_, Some(_))))
        .collect();
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(user_error)? {
        let mut object = Map::new();
        for (i, name) in names.iter().enumerate() {
            let cell = row.get_ref(i).map_err(user_error)?.to_owned();
            object.insert(name.clone(), json_value(cell, zoned[i]));
        }
        out.push(object);
    }
    let truncated = out.len() > MAX_QUERY_ROWS;
    out.truncate(MAX_QUERY_ROWS);
    Ok(QueryResult {
        views,
        rows: out,
        truncated,
    })
}

/// `<Kind>Exception: <message>`, the way the Python DuckDB client names its errors, from
/// DuckDB's `<Kind> Error: <message>`.
fn python_error(message: &str) -> String {
    let Some((kind, _)) = message.split_once(" Error: ") else {
        return format!("Error: {message}");
    };
    let name: String = kind
        .split(' ')
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map_or(String::new(), |c| c.to_uppercase().chain(chars).collect())
        })
        .collect();
    format!("{name}Exception: {message}")
}

/// A cell as Python's `json.dumps(default=str)` wrote it: numbers stay numbers, decimals and
/// times become `str()` text. NaN and infinities, which Python wrote as bare `NaN`, are null.
fn json_value(cell: duckdb::types::Value, zoned: bool) -> Value {
    use duckdb::types::Value as Db;
    match cell {
        Db::Null => Value::Null,
        Db::Boolean(b) => b.into(),
        Db::TinyInt(n) => n.into(),
        Db::SmallInt(n) => n.into(),
        Db::Int(n) => n.into(),
        Db::BigInt(n) => n.into(),
        Db::UTinyInt(n) => n.into(),
        Db::USmallInt(n) => n.into(),
        Db::UInt(n) => n.into(),
        Db::UBigInt(n) => n.into(),
        Db::HugeInt(n) => i64::try_from(n).map_or_else(|_| n.to_string().into(), Value::from),
        Db::UHugeInt(n) => u64::try_from(n).map_or_else(|_| n.to_string().into(), Value::from),
        Db::Float(f) => serde_json::Number::from_f64(f.into()).map_or(Value::Null, Value::Number),
        Db::Double(f) => serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number),
        Db::Decimal(d) => d.to_string().into(),
        Db::Text(s) => s.into(),
        Db::Enum(s) => s.into(),
        Db::Timestamp(unit, t) => {
            let micros = unit.to_micros(t);
            let time = DateTime::from_timestamp_micros(micros).map(|t| t.naive_utc());
            time.map_or(Value::Null, |t| {
                let text = python_str(t);
                if zoned { format!("{text}+00:00") } else { text }.into()
            })
        }
        Db::List(items) | Db::Array(items) => {
            Value::Array(items.into_iter().map(|v| json_value(v, zoned)).collect())
        }
        other => format!("{other:?}").into(),
    }
}

/// `str(datetime)`: microseconds only when there are some.
fn python_str(t: NaiveDateTime) -> String {
    if t.and_utc().timestamp_subsec_micros() == 0 {
        t.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        t.format("%Y-%m-%d %H:%M:%S%.6f").to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::{SessionKind, SessionStore};
    use serde_json::json;

    /// The lock in `open` must not stop the review path from computing into the connection:
    /// a computed table reads and writes no file, which is what the lock forbids.
    #[test]
    fn a_computed_table_is_attached_and_queried_after_the_configuration_lock() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let manifest = store
            .create("empty", SessionKind::Import, json!({}))
            .unwrap();
        let mut db = SessionDb::open(&store.path(&manifest.id), &manifest).unwrap();
        let outside = db
            .connection()
            .execute_batch("SELECT * FROM read_csv('/etc/hostname')");
        assert!(outside.is_err(), "the lock on external access is in place");

        db.attach_computed(
            "calc:t1:c1",
            &["ubar_co2", "rate"],
            [(0, vec![Some(1.5), None]), (7, vec![None, Some(-2.0)])]
                .map(|(seq, values)| ComputedRow { seq, values }),
        )
        .unwrap();
        let mut stmt = db
            .connection()
            .prepare("SELECT seq, \"ubar_co2\", rate FROM \"calc:t1:c1\" ORDER BY seq")
            .unwrap();
        let rows: Vec<(i64, Option<f64>, Option<f64>)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows, [(0, Some(1.5), None), (7, None, Some(-2.0))]);
        assert!(
            !db.has_view("calc:t1:c1"),
            "computed tables are not researcher views"
        );
    }
}
