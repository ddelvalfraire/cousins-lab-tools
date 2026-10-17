//! Explicit, reproducible alignment of captures onto a shared time axis.
//!
//! An alignment never edits stored data. For every member capture it names the clock used,
//! the zero on that clock, how the zero was chosen, and an uncertainty. The aligned time is
//! `x_s = clock_seconds - zero`. Three references are supported:
//!
//! - clock: actual clock time. Only captures that recorded host clock time can take part.
//! - elapsed: each capture from its own start. Starts are not assumed to be the same moment.
//! - event: each capture relative to a named experimental event, found by detection, an
//!   operator marker, transfer over a shared host clock, or a value the researcher enters.
//!
//! A capture with no way to place it is listed as unaligned with the reason, never guessed.

use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use chrono::{DateTime, TimeDelta, Utc};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::contract::{Clock, ClockKind};
use crate::expr::Params;
use crate::pycompat::{float_repr, round};
use crate::query::{AnalysisError, SessionDb, clock_seconds_sql, ident, sql_string};
use crate::session::{Capture, Manifest, iso_time_opt, utc_now};
use crate::templates::{Template, from_snapshot};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reference {
    Clock,
    Elapsed,
    Event,
}

impl Reference {
    pub fn name(self) -> &'static str {
        match self {
            Reference::Clock => "clock",
            Reference::Elapsed => "elapsed",
            Reference::Event => "event",
        }
    }
}

/// A zero the researcher entered for one capture of one trial.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ManualZero {
    /// The clock column the zero is measured on.
    pub clock: String,
    pub zero: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
}

/// Trial id to capture id to entered zero.
pub type Manual = IndexMap<String, IndexMap<String, ManualZero>>;
/// Trial id to parameter overrides.
pub type TrialParams = IndexMap<String, IndexMap<String, f64>>;

/// What a proposal was asked for; kept in the record so it can be proposed again.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Inputs {
    pub reference: Reference,
    #[serde(default)]
    pub manual: Manual,
    #[serde(default)]
    pub trial_params: TrialParams,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Member {
    pub clock: Clock,
    /// Seconds on `clock`; epoch seconds for wall clocks.
    pub zero: f64,
    pub method: String,
    pub capture: String,
    pub role: String,
    pub label: String,
    pub uncertainty_s: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Trial {
    pub id: String,
    pub label: String,
    pub members: Vec<Member>,
    /// Template parameters with this trial's overrides, inlined into its derived values.
    pub params: IndexMap<String, f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Unaligned {
    pub trial: String,
    pub capture: String,
    /// True when entering the event time on one of `clocks` would place the capture.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub needs_event_time: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clocks: Option<String>,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TemplateRef {
    pub id: String,
    pub revision: i64,
}

/// A proposal, or once saved an alignment record with its id and creation time.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Alignment {
    pub reference: Reference,
    pub event: Option<String>,
    pub event_label: Option<String>,
    pub event_note: Option<String>,
    /// Event alignment keeps only rows with `x_s` in this range.
    pub window_s: Option<[f64; 2]>,
    #[serde(with = "iso_time_opt")]
    pub clock_origin_utc: Option<DateTime<Utc>>,
    pub trials: Vec<Trial>,
    pub unaligned: Vec<Unaligned>,
    pub uncertainty_note: String,
    pub template: TemplateRef,
    pub inputs: Inputs,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "iso_time_opt"
    )]
    pub created_utc: Option<DateTime<Utc>>,
}

static ATTEMPTS: AtomicU64 = AtomicU64::new(0);
const ELAPSED_PREFERENCE: [ClockKind; 4] = [
    ClockKind::DeviceRelative,
    ClockKind::Elapsed,
    ClockKind::SourceLocal,
    ClockKind::HostUtc,
];

const UNCERTAINTY_NOTE: &str = "One sample interval on the member's clock. Receipt latency and clock drift are not characterized.";

fn kind_name(kind: ClockKind) -> &'static str {
    match kind {
        ClockKind::HostUtc => "host_utc",
        ClockKind::SourceLocal => "source_local",
        ClockKind::DeviceRelative => "device_relative",
        ClockKind::Elapsed => "elapsed",
    }
}

fn clock_of(capture: &Capture, kind: ClockKind) -> Option<&Clock> {
    capture.clocks.iter().find(|c| c.kind == kind)
}

fn clock_named<'a>(
    cid: &str,
    capture: &'a Capture,
    column: &str,
) -> Result<&'a Clock, AnalysisError> {
    capture
        .clocks
        .iter()
        .find(|c| c.column == column)
        .ok_or_else(|| AnalysisError::Invalid(format!("Capture {cid} has no clock {column}")))
}

/// Median gap between distinct times. Frames decoded in one spool poll share a receipt time.
fn sample_interval_s(
    db: &SessionDb,
    cid: &str,
    clock: &Clock,
) -> Result<Option<f64>, AnalysisError> {
    let view = format!("cap:{cid}");
    if !db.has_view(&view) {
        return Ok(None);
    }
    let sec = clock_seconds_sql(clock);
    let value: Option<f64> = db.connection().query_row(
        &format!(
            "SELECT median(d) FILTER (WHERE d > 0) FROM \
             (SELECT {sec} - lag({sec}) OVER (ORDER BY seq) AS d FROM {})",
            ident(&view)
        ),
        [],
        |r| r.get(0),
    )?;
    Ok(value.map(|v| round(v, 6)))
}

fn first_value(db: &SessionDb, cid: &str, clock: &Clock) -> Result<Option<f64>, AnalysisError> {
    let view = format!("cap:{cid}");
    if !db.has_view(&view) {
        return Ok(None);
    }
    let sql = format!(
        "SELECT min({}) FROM {}",
        clock_seconds_sql(clock),
        ident(&view)
    );
    Ok(db.connection().query_row(&sql, [], |r| r.get(0))?)
}

struct Detected {
    label: String,
    clock: Option<String>,
    t_native: Option<f64>,
    t_host_utc: Option<DateTime<Utc>>,
}

/// The first event of `kind` on the capture, with value `number` when one is given.
fn detected_event(
    db: &SessionDb,
    cid: &str,
    kind: &str,
    number: Option<f64>,
) -> Result<Option<Detected>, AnalysisError> {
    let view = format!("ev:{cid}");
    if !db.has_view(&view) {
        return Ok(None);
    }
    let mut stmt = db.connection().prepare(&format!(
        "SELECT label, clock, t_native, t_host_utc, value FROM {} WHERE kind = ? ORDER BY seq",
        ident(&view)
    ))?;
    let mut rows = stmt.query([kind])?;
    while let Some(row) = rows.next()? {
        let value: Option<f64> = row.get(4)?;
        if number.is_none_or(|n| value == Some(n)) {
            return Ok(Some(Detected {
                label: row.get(0)?,
                clock: row.get(1)?,
                t_native: row.get(2)?,
                t_host_utc: row.get(3)?,
            }));
        }
    }
    Ok(None)
}

fn marker_epoch(db: &SessionDb, event_id: &str) -> Result<Option<f64>, AnalysisError> {
    if !db.has_view("markers") {
        return Ok(None);
    }
    let mut stmt = db.connection().prepare(
        "SELECT epoch_us(t_host_utc) / 1e6 FROM markers WHERE kind = ? ORDER BY seq LIMIT 1",
    )?;
    let mut rows = stmt.query([event_id])?;
    Ok(match rows.next()? {
        Some(row) => row.get(0)?,
        None => None,
    })
}

/// `t.timestamp()` for an aware datetime: whole microseconds divided by 1e6.
fn epoch_s(t: DateTime<Utc>) -> f64 {
    t.timestamp_micros() as f64 / 1e6
}

/// `datetime.fromtimestamp(seconds, timezone.utc)`, which rounds the fraction half to even.
fn from_epoch_s(seconds: f64) -> Option<DateTime<Utc>> {
    let whole = seconds.trunc();
    let micros = ((seconds - whole) * 1e6).round_ties_even();
    DateTime::from_timestamp(whole as i64, 0).map(|t| t + TimeDelta::microseconds(micros as i64))
}

struct TrialPlan<'a> {
    id: &'a str,
    label: &'a str,
    captures: Vec<&'a str>,
}

/// With a trial role, each capture of that role leads a trial and every other capture is
/// shared into all of them. Otherwise there is one trial of everything.
fn trials_of<'a>(
    manifest: &'a Manifest,
    template: &Template,
    reference: Reference,
) -> Vec<TrialPlan<'a>> {
    let all = || {
        vec![TrialPlan {
            id: "all",
            label: "All captures",
            captures: manifest.captures.keys().map(String::as_str).collect(),
        }]
    };
    let trial_role = template.data()["alignment"]["trial_role"].as_str();
    let is_lead = |c: &Capture| trial_role == Some(c.role.as_str());
    if reference == Reference::Clock || !manifest.captures.values().any(is_lead) {
        return all();
    }
    let shared: Vec<&str> = manifest
        .captures
        .iter()
        .filter(|(_, c)| !is_lead(c))
        .map(|(cid, _)| cid.as_str())
        .collect();
    manifest
        .captures
        .iter()
        .filter(|(_, c)| is_lead(c))
        .map(|(cid, c)| TrialPlan {
            id: cid,
            label: &c.label,
            captures: shared.iter().copied().chain([cid.as_str()]).collect(),
        })
        .collect()
}

/// Template parameters in template order.
fn template_params(template: &Template) -> IndexMap<String, f64> {
    template.data()["parameters"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(k, p)| Some((k.clone(), p.get("value")?.as_f64()?)))
        .collect()
}

fn window(spec: &Value) -> Option<[f64; 2]> {
    match spec.get("window_s")?.as_array()?.as_slice() {
        [lo, hi] => Some([lo.as_f64()?, hi.as_f64()?]),
        _ => None,
    }
}

/// Where one capture of one trial lands, or why it cannot.
enum Placement<'a> {
    Member {
        clock: &'a Clock,
        zero: f64,
        method: String,
    },
    Unaligned(String),
    /// Entering when the event happened on one of `clocks` would place the capture.
    NeedsEventTime {
        clocks: String,
        reason: String,
    },
}

fn member(clock: &Clock, zero: f64, method: impl Into<String>) -> Placement<'_> {
    Placement::Member {
        clock,
        zero,
        method: method.into(),
    }
}

fn place_on_clock(capture: &Capture, origin: Option<f64>) -> Placement<'_> {
    match (clock_of(capture, ClockKind::HostUtc), origin) {
        (Some(host), Some(origin)) => member(
            host,
            origin,
            "Host clock; zero is the earliest first sample in the session",
        ),
        _ => {
            let kinds: Vec<&str> = capture.clocks.iter().map(|c| kind_name(c.kind)).collect();
            Placement::Unaligned(format!(
                "Records no clock time, only: {}. Use elapsed or event alignment.",
                kinds.join(", ")
            ))
        }
    }
}

fn place_elapsed<'a>(
    db: &SessionDb,
    cid: &str,
    capture: &'a Capture,
) -> Result<Placement<'a>, AnalysisError> {
    let clock = ELAPSED_PREFERENCE
        .iter()
        .find_map(|&kind| clock_of(capture, kind))
        .ok_or_else(|| AnalysisError::Invalid(format!("Capture {cid} declares no clock")))?;
    Ok(match clock.kind {
        ClockKind::DeviceRelative | ClockKind::Elapsed => member(
            clock,
            0.0,
            format!("Origin of {} (the instrument's own start)", clock.column),
        ),
        _ => match first_value(db, cid, clock)? {
            Some(first) => member(clock, first, format!("First sample on {}", clock.column)),
            None => Placement::Unaligned(format!("No {} values recorded", clock.column)),
        },
    })
}

/// What event alignment knows before placing any capture.
struct EventContext<'a> {
    id: Option<&'a str>,
    label: Option<&'a str>,
    /// Epoch seconds of the first operator marker of the event.
    marker: Option<f64>,
    manual: &'a Manual,
}

impl EventContext<'_> {
    /// Entered zero, then operator marker, then the detection's receipt time over the host
    /// clock, then the detection on the detecting capture's own clock.
    fn place<'c>(
        &self,
        trial: &str,
        cid: &str,
        captures: &'c IndexMap<String, Capture>,
        detection: Option<(&str, &Detected)>,
    ) -> Result<Placement<'c>, AnalysisError> {
        let capture = &captures[cid];
        let host = clock_of(capture, ClockKind::HostUtc);
        if let Some(entered) = self.manual.get(trial).and_then(|m| m.get(cid)) {
            let method = entered.method.as_deref().unwrap_or("Entered by researcher");
            return Ok(member(
                clock_named(cid, capture, &entered.clock)?,
                entered.zero,
                method,
            ));
        }
        if let (Some(host), Some(marker)) = (host, self.marker) {
            let method = format!(
                "Operator marker '{}' on the host clock",
                self.id.unwrap_or_default()
            );
            return Ok(member(host, marker, method));
        }
        if let Some((detector, detected)) = detection {
            if let (Some(host), Some(receipt)) = (host, detected.t_host_utc) {
                let how = if detector == cid {
                    "Detected".to_string()
                } else {
                    format!(
                        "Transferred over the host clock from {}:",
                        captures[detector].label
                    )
                };
                let method = format!("{how} {} (receipt time)", detected.label);
                return Ok(member(host, epoch_s(receipt), method));
            }
            if let (true, Some(t_native)) = (detector == cid, detected.t_native) {
                let column = detected.clock.as_deref().unwrap_or_default();
                let clock = clock_named(cid, capture, column)?;
                let method = format!("Detected: {} on {column}", detected.label);
                return Ok(member(clock, t_native, method));
            }
        }
        let columns: Vec<&str> = capture.clocks.iter().map(|c| c.column.as_str()).collect();
        let clocks = columns.join(", ");
        let event = self.label.or(self.id).unwrap_or("None");
        Ok(Placement::NeedsEventTime {
            reason: format!(
                "No shared clock with the other captures. Enter when '{event}' happened on {clocks}."
            ),
            clocks,
        })
    }
}

/// A proposed alignment of every capture in the session; nothing is saved.
pub fn propose(
    session_dir: &Path,
    manifest: &Manifest,
    inputs: Inputs,
) -> Result<Alignment, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let reference = inputs.reference;
    let spec = &template.data()["alignment"];
    let event_id = match reference {
        Reference::Event => spec["event"].as_str(),
        _ => None,
    };
    let event_spec = &template.data()["events"][event_id.unwrap_or_default()];
    let detect = &event_spec["detect"];
    let db = SessionDb::open(session_dir, manifest)?;
    let captures = &manifest.captures;

    let mut clock_origin = None;
    if reference == Reference::Clock {
        for (cid, capture) in captures {
            if let Some(host) = clock_of(capture, ClockKind::HostUtc)
                && let Some(first) = first_value(&db, cid, host)?
            {
                clock_origin = Some(clock_origin.map_or(first, |o: f64| o.min(first)));
            }
        }
    }
    let event = EventContext {
        id: event_id,
        label: event_spec["label"].as_str(),
        marker: match event_id {
            Some(id) => marker_epoch(&db, id)?,
            None => None,
        },
        manual: &inputs.manual,
    };

    let mut trials = Vec::new();
    let mut unaligned = Vec::new();
    for trial in trials_of(manifest, &template, reference) {
        let detector = trial
            .captures
            .iter()
            .copied()
            .find(|cid| Some(captures[*cid].role.as_str()) == detect["role"].as_str());
        let detected = match (detector, detect["kind"].as_str()) {
            (Some(cid), Some(kind)) => detected_event(&db, cid, kind, detect["number"].as_f64())?,
            _ => None,
        };
        let detection = detector.zip(detected.as_ref());
        let mut members = Vec::new();
        for &cid in &trial.captures {
            let capture = &captures[cid];
            let placement = if capture.rows == 0 {
                Placement::Unaligned("No samples recorded".into())
            } else {
                match reference {
                    Reference::Clock => place_on_clock(capture, clock_origin),
                    Reference::Elapsed => place_elapsed(&db, cid, capture)?,
                    Reference::Event => event.place(trial.id, cid, captures, detection)?,
                }
            };
            let unplaced = |needs_event_time, clocks, reason| Unaligned {
                trial: trial.id.into(),
                capture: cid.into(),
                needs_event_time,
                clocks,
                reason,
            };
            match placement {
                Placement::Member {
                    clock,
                    zero,
                    method,
                } => members.push(Member {
                    clock: clock.clone(),
                    zero,
                    method,
                    capture: cid.into(),
                    role: capture.role.clone(),
                    label: capture.label.clone(),
                    uncertainty_s: sample_interval_s(&db, cid, clock)?,
                }),
                Placement::Unaligned(reason) => unaligned.push(unplaced(false, None, reason)),
                Placement::NeedsEventTime { clocks, reason } => {
                    unaligned.push(unplaced(true, Some(clocks), reason))
                }
            }
        }
        let mut params = template_params(&template);
        if let Some(overrides) = inputs.trial_params.get(trial.id) {
            params.extend(overrides.iter().map(|(k, v)| (k.clone(), *v)));
        }
        trials.push(Trial {
            id: trial.id.into(),
            label: trial.label.into(),
            members,
            params,
        });
    }

    Ok(Alignment {
        reference,
        event: event_id.map(String::from),
        event_label: event.label.map(String::from),
        event_note: event_spec["note"].as_str().map(String::from),
        window_s: (reference == Reference::Event)
            .then(|| window(spec))
            .flatten(),
        clock_origin_utc: clock_origin.filter(|&o| o != 0.0).and_then(from_epoch_s),
        trials,
        unaligned,
        uncertainty_note: UNCERTAINTY_NOTE.into(),
        template: TemplateRef {
            id: template.id().into(),
            revision: template.revision(),
        },
        inputs,
        id: None,
        created_utc: None,
    })
}

/// One `SELECT` per member, joined by `UNION ALL BY NAME`: the stored columns as they are,
/// plus `x_s`, its uncertainty, and the member role's derived values with trial parameters.
pub fn aligned_sql(manifest: &Manifest, alignment: &Alignment) -> Result<String, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let id = sql_string(alignment.id.as_deref().unwrap_or("proposal"));
    let mut parts = Vec::new();
    for trial in &alignment.trials {
        let params: Params = trial.params.iter().map(|(k, v)| (k.clone(), *v)).collect();
        for m in &trial.members {
            let x = format!("({}) - {}", clock_seconds_sql(&m.clock), float_repr(m.zero));
            let derived: String = template
                .derived()
                .iter()
                .filter(|d| d.role == m.role)
                .map(|d| format!(", {} AS {}", d.expr.sql(&params), ident(&d.name)))
                .collect();
            let filter = match alignment.window_s {
                Some([lo, hi]) => format!(
                    " WHERE {x} BETWEEN {} AND {}",
                    float_repr(lo),
                    float_repr(hi)
                ),
                None => String::new(),
            };
            let uncertainty = match m.uncertainty_s {
                Some(u) => format!("{}::DOUBLE", float_repr(u)),
                None => "NULL::DOUBLE".into(),
            };
            parts.push(format!(
                "SELECT {id} AS alignment_id, {} AS trial, {} AS capture, {} AS role, {x} AS x_s, \
                 {uncertainty} AS x_uncertainty_s{derived}, * FROM {}{filter}",
                sql_string(&trial.id),
                sql_string(&m.capture),
                sql_string(&m.role),
                ident(&format!("cap:{}", m.capture)),
            ));
        }
    }
    if parts.is_empty() {
        return Ok(
            "SELECT NULL AS trial, NULL AS capture, NULL AS role, NULL::DOUBLE AS x_s WHERE false"
                .into(),
        );
    }
    Ok(parts.join(" UNION ALL BY NAME "))
}

pub const MAX_POINTS_PER_SERIES: usize = 4000;

/// Keeps each bucket's min and max so short events such as flashes stay visible.
pub fn decimate(points: Vec<[f64; 2]>, limit: usize) -> Vec<[f64; 2]> {
    if points.len() <= limit {
        return points;
    }
    let buckets = limit / 2;
    let size = points.len() as f64 / buckets as f64;
    let mut out = Vec::with_capacity(limit);
    for b in 0..buckets {
        let bucket = &points[(b as f64 * size) as usize..((b + 1) as f64 * size) as usize];
        let (mut lo, mut hi) = (0, 0);
        for (i, p) in bucket.iter().enumerate() {
            if p[1] < bucket[lo][1] {
                lo = i;
            }
            if p[1] > bucket[hi][1] {
                hi = i;
            }
        }
        match bucket {
            [] => {}
            _ if lo == hi => out.push(bucket[lo]),
            _ => {
                let mut pair = [bucket[lo], bucket[hi]];
                pair.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
                out.extend(pair);
            }
        }
    }
    out
}

/// One capture's points of one value, in one trial.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Series {
    pub trial: String,
    pub capture: String,
    pub role: String,
    pub value: String,
    pub name: String,
    pub points: Vec<[f64; 2]>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Marker {
    pub trial: String,
    pub label: String,
    pub x: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Chart {
    pub id: String,
    pub title: String,
    pub unit: String,
    pub series: Vec<Series>,
    pub markers: Vec<Marker>,
}

/// The session's views plus `aligned`, with its column names and each member's label.
struct AlignedView {
    db: SessionDb,
    columns: BTreeSet<String>,
    labels: HashMap<String, String>,
}

impl AlignedView {
    fn open(
        session_dir: &Path,
        manifest: &Manifest,
        alignment: &Alignment,
    ) -> Result<Self, AnalysisError> {
        let mut db = SessionDb::open(session_dir, manifest)?;
        db.create_view("aligned", &aligned_sql(manifest, alignment)?)?;
        let columns = db
            .connection()
            .prepare("SELECT column_name FROM (DESCRIBE aligned)")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let labels = alignment
            .trials
            .iter()
            .flat_map(|t| &t.members)
            .map(|m| (m.capture.clone(), m.label.clone()))
            .collect();
        Ok(AlignedView {
            db,
            columns,
            labels,
        })
    }

    fn series(&self, role: &str, value: &str) -> Result<Vec<Series>, AnalysisError> {
        let column = ident(value);
        let mut stmt = self.db.connection().prepare(&format!(
            "SELECT trial, capture, x_s, {column}::DOUBLE FROM aligned \
             WHERE role = ? AND {column} IS NOT NULL AND x_s IS NOT NULL ORDER BY trial, capture, x_s"
        ))?;
        let mut rows = stmt.query([role])?;
        let mut grouped: Vec<(String, String, Vec<[f64; 2]>)> = Vec::new();
        while let Some(row) = rows.next()? {
            let (trial, capture): (String, String) = (row.get(0)?, row.get(1)?);
            let point = [row.get(2)?, row.get(3)?];
            match grouped.last_mut() {
                Some((t, c, points)) if *t == trial && *c == capture => points.push(point),
                _ => grouped.push((trial, capture, vec![point])),
            }
        }
        Ok(grouped
            .into_iter()
            .map(|(trial, capture, points)| {
                let label = self.labels.get(&capture).unwrap_or(&capture);
                Series {
                    name: format!("{label} · {value}"),
                    trial,
                    capture,
                    role: role.into(),
                    value: value.into(),
                    points: decimate(points, MAX_POINTS_PER_SERIES),
                }
            })
            .collect())
    }

    /// Events of `kind` on the members of `role`, on each member's aligned axis.
    fn markers(
        &self,
        alignment: &Alignment,
        role: &str,
        kind: &str,
    ) -> Result<Vec<Marker>, AnalysisError> {
        let mut markers = Vec::new();
        for trial in &alignment.trials {
            for m in trial.members.iter().filter(|m| m.role == role) {
                let view = format!("ev:{}", m.capture);
                if !self.db.has_view(&view) {
                    continue;
                }
                let sec = match m.clock.kind {
                    ClockKind::HostUtc => "epoch_us(t_host_utc) / 1e6",
                    _ => "t_native",
                };
                let mut stmt = self.db.connection().prepare(&format!(
                    "SELECT label, {sec} - ? FROM {} WHERE kind = ? ORDER BY seq",
                    ident(&view)
                ))?;
                let mut rows = stmt.query(duckdb::params![m.zero, kind])?;
                while let Some(row) = rows.next()? {
                    if let Some(x) = row.get::<_, Option<f64>>(1)? {
                        markers.push(Marker {
                            trial: trial.id.clone(),
                            label: row.get(0)?,
                            x,
                        });
                    }
                }
            }
        }
        Ok(markers)
    }
}

/// Aligned series for each value a visible metric shows, so replay can read a metric at any x.
pub fn metric_series(
    session_dir: &Path,
    manifest: &Manifest,
    alignment: &Alignment,
) -> Result<BTreeMap<String, Vec<Series>>, AnalysisError> {
    let view = AlignedView::open(session_dir, manifest, alignment)?;
    from_snapshot(manifest.template.clone())?
        .metric_bindings()
        .into_iter()
        .filter(|(value, _)| view.columns.contains(value))
        .map(|(value, role)| Ok((value.clone(), view.series(&role, &value)?)))
        .collect()
}

/// Every template chart with an enabled role, its series on the aligned axis and its markers.
pub fn chart_data(
    session_dir: &Path,
    manifest: &Manifest,
    alignment: &Alignment,
) -> Result<Vec<Chart>, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let view = AlignedView::open(session_dir, manifest, alignment)?;
    let text = |v: &Value| v.as_str().unwrap_or_default().to_string();
    template
        .charts()
        .iter()
        .map(|chart| {
            let mut series = Vec::new();
            for s in chart["series"].as_array().into_iter().flatten() {
                let value = text(&s["value"]);
                if view.columns.contains(&value) {
                    series.extend(view.series(&text(&s["role"]), &value)?);
                }
            }
            let markers = match (
                chart["markers"]["role"].as_str(),
                chart["markers"]["kind"].as_str(),
            ) {
                (Some(role), Some(kind)) => view.markers(alignment, role, kind)?,
                _ => Vec::new(),
            };
            Ok(Chart {
                id: text(&chart["id"]),
                title: text(&chart["title"]),
                unit: text(&chart["unit"]),
                series,
                markers,
            })
        })
        .collect()
}

fn alignments_dir(session_dir: &Path) -> std::path::PathBuf {
    session_dir.join("alignments")
}

/// Saves the proposal as `aln-YYYYMMDD-HHMMSS-<reference>`, or with `-2`, `-3` and so on
/// when one with the same reference was saved in the same second.
pub fn save_alignment(
    session_dir: &Path,
    alignment: Alignment,
) -> Result<Alignment, AnalysisError> {
    save_alignment_at(session_dir, alignment, utc_now())
}

fn save_alignment_at(
    session_dir: &Path,
    alignment: Alignment,
    created: DateTime<Utc>,
) -> Result<Alignment, AnalysisError> {
    let dir = alignments_dir(session_dir);
    fs::create_dir_all(&dir)?;
    let base = format!(
        "aln-{}-{}",
        created.format("%Y%m%d-%H%M%S"),
        alignment.reference.name()
    );
    let mut record = Alignment {
        created_utc: Some(created),
        ..alignment
    };
    for n in 1.. {
        let id = if n == 1 {
            base.clone()
        } else {
            format!("{base}-{n}")
        };
        record.id = Some(id.clone());
        // Linking a finished file into place never shows a reader half a record, and fails
        // rather than overwrite one saved in the same second. Each attempt writes its own
        // partial file, so concurrent saves never remove each other's.
        let attempt = ATTEMPTS.fetch_add(1, AtomicOrdering::Relaxed);
        let partial = dir.join(format!(".{id}.{}-{attempt}.partial", std::process::id()));
        fs::write(&partial, serde_json::to_string_pretty(&record)?)?;
        let linked = fs::hard_link(&partial, dir.join(format!("{id}.json")));
        fs::remove_file(&partial)?;
        match linked {
            Ok(()) => break,
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Ok(record)
}

/// A saved alignment. An id that names no saved record, or is not a plain file name, is
/// [`AnalysisError::AlignmentNotFound`].
pub fn load_alignment(session_dir: &Path, alignment_id: &str) -> Result<Alignment, AnalysisError> {
    let not_found = || AnalysisError::AlignmentNotFound(alignment_id.into());
    let plain = !alignment_id.is_empty()
        && alignment_id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_');
    if !plain {
        return Err(not_found());
    }
    match fs::read_to_string(alignments_dir(session_dir).join(format!("{alignment_id}.json"))) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Err(not_found()),
        Err(e) => Err(e.into()),
    }
}

/// Every saved alignment, in id order.
pub fn list_alignments(session_dir: &Path) -> Result<Vec<Alignment>, AnalysisError> {
    let dir = alignments_dir(session_dir);
    let mut paths = match fs::read_dir(&dir) {
        Ok(entries) => entries
            .map(|e| e.map(|e| e.path()))
            .collect::<Result<Vec<_>, _>>()?,
        Err(e) if e.kind() == ErrorKind::NotFound => Vec::new(),
        Err(e) => return Err(e.into()),
    };
    paths.retain(|p| p.extension().is_some_and(|e| e == "json"));
    paths.sort();
    paths
        .iter()
        .map(|p| Ok(serde_json::from_str(&fs::read_to_string(p)?)?))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn second() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap()
    }

    fn proposal() -> Alignment {
        Alignment {
            reference: Reference::Elapsed,
            event: None,
            event_label: None,
            event_note: None,
            window_s: None,
            clock_origin_utc: None,
            trials: Vec::new(),
            unaligned: Vec::new(),
            uncertainty_note: String::new(),
            template: TemplateRef {
                id: "t".into(),
                revision: 1,
            },
            inputs: Inputs {
                reference: Reference::Elapsed,
                manual: Manual::new(),
                trial_params: TrialParams::new(),
            },
            id: None,
            created_utc: None,
        }
    }

    #[test]
    fn epoch_seconds_round_trip_at_microsecond_resolution() {
        let t = second() + TimeDelta::microseconds(316_483);
        assert_eq!(epoch_s(t), 1792188592.316483);
        assert_eq!(from_epoch_s(epoch_s(t)), Some(t));
    }

    #[test]
    fn alignments_saved_in_one_second_get_numbered_ids_instead_of_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let saved: Vec<Alignment> = (0..3)
            .map(|_| save_alignment_at(dir.path(), proposal(), second()).unwrap())
            .collect();
        let ids: Vec<&str> = saved.iter().map(|a| a.id.as_deref().unwrap()).collect();
        assert_eq!(
            ids,
            [
                "aln-20261016-220952-elapsed",
                "aln-20261016-220952-elapsed-2",
                "aln-20261016-220952-elapsed-3"
            ]
        );
        for record in &saved {
            assert_eq!(
                &load_alignment(dir.path(), record.id.as_deref().unwrap()).unwrap(),
                record
            );
        }
        let mut listed = list_alignments(dir.path()).unwrap();
        listed.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(listed, saved);
        let files = fs::read_dir(dir.path().join("alignments")).unwrap().count();
        assert_eq!(files, 3, "no partial files are left behind");
    }

    #[test]
    fn concurrent_saves_in_one_second_each_get_their_own_id() {
        let dir = tempfile::tempdir().unwrap();
        for round in 0..20 {
            let session = dir.path().join(round.to_string());
            let start = std::sync::Barrier::new(8);
            let mut ids: Vec<String> = std::thread::scope(|scope| {
                let saves: Vec<_> = (0..8)
                    .map(|_| {
                        scope.spawn(|| {
                            start.wait();
                            save_alignment_at(&session, proposal(), second())
                                .unwrap()
                                .id
                                .unwrap()
                        })
                    })
                    .collect();
                saves.into_iter().map(|s| s.join().unwrap()).collect()
            });
            ids.sort();
            ids.dedup();
            assert_eq!(ids.len(), 8, "round {round}: {ids:?}");
            assert_eq!(list_alignments(&session).unwrap().len(), 8);
        }
    }

    #[test]
    fn an_unknown_or_path_like_alignment_id_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        save_alignment_at(dir.path(), proposal(), second()).unwrap();
        fs::write(dir.path().join("secret.json"), "{}").unwrap();
        for id in [
            "aln-missing",
            "../secret",
            "",
            "aln-20261016-220952-elapsed.json",
        ] {
            let error = load_alignment(dir.path(), id).unwrap_err();
            assert!(
                matches!(&error, AnalysisError::AlignmentNotFound(missing) if missing == id),
                "{id}"
            );
        }
        assert_eq!(
            load_alignment(dir.path(), "aln-missing")
                .unwrap_err()
                .to_string(),
            "Not found: 'aln-missing'"
        );
        assert_eq!(list_alignments(&dir.path().join("no-session")).unwrap(), []);
    }
    #[test]
    fn decimation_keeps_each_buckets_extremes_as_python_does() {
        let points: Vec<[f64; 2]> = (0..1003i64)
            .map(|i| [i as f64 * 0.5, ((i * 7919) % 101) as f64 - 50.0])
            .collect();
        let expected = [
            [0.0, -50.0],
            [16.0, 50.0],
            [101.0, -50.0],
            [117.0, 50.0],
            [202.0, -50.0],
            [218.0, 50.0],
            [303.0, -50.0],
            [319.0, 50.0],
            [404.0, -50.0],
            [420.0, 50.0],
        ];
        assert_eq!(decimate(points.clone(), 10), expected);
        assert_eq!(decimate(points[..10].to_vec(), 10), points[..10]);
        let flat = vec![[0.0, 1.0], [1.0, 1.0], [2.0, 1.0]];
        assert_eq!(
            decimate(flat, 2),
            [[0.0, 1.0]],
            "a flat bucket keeps one point"
        );
    }
}
