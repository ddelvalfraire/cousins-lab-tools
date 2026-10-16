//! The instrument contract every adapter implements.
//!
//! An adapter describes what it records (columns, clocks, capabilities), reports whether it
//! is ready, and runs a blocking acquisition loop that pushes rows and events into a sink
//! until asked to stop. Rows carry every timestamp the source provides; nothing is rewritten.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputKind {
    Hardware,
    Simulated,
    Replay,
    Import,
}

impl InputKind {
    pub fn label(self) -> &'static str {
        match self {
            InputKind::Hardware => "Hardware",
            InputKind::Simulated => "Simulated input",
            InputKind::Replay => "Replay of a recording",
            InputKind::Import => "Imported file",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnType {
    Int64,
    Float64,
    String,
    TimestampUtc,
    TimestampLocal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClockKind {
    HostUtc,
    SourceLocal,
    DeviceRelative,
    Elapsed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Column {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: ColumnType,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub description: String,
}

impl Column {
    pub fn new(name: &str, ty: ColumnType, unit: &str, description: &str) -> Self {
        Column {
            name: name.into(),
            ty,
            unit: unit.into(),
            description: description.into(),
        }
    }
}

/// A time column and what it means. `seconds_per_unit` converts the stored value to seconds.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Clock {
    pub column: String,
    pub kind: ClockKind,
    pub seconds_per_unit: f64,
    pub description: String,
}

impl Clock {
    pub fn new(column: &str, kind: ClockKind, seconds_per_unit: f64, description: &str) -> Self {
        Clock {
            column: column.into(),
            kind,
            seconds_per_unit,
            description: description.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InstrumentInfo {
    pub adapter: String,
    pub model: String,
    pub input_kind: InputKind,
    pub capabilities: BTreeSet<String>,
    pub columns: Vec<Column>,
    pub clocks: Vec<Clock>,
    #[serde(default)]
    pub aliases: BTreeMap<String, String>,
}

impl InstrumentInfo {
    /// The column a name refers to, following aliases such as `m44` to `ch3`.
    pub fn column(&self, name: &str) -> Option<&Column> {
        let name = self.aliases.get(name).map_or(name, String::as_str);
        self.columns.iter().find(|c| c.name == name)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Readiness {
    pub ok: bool,
    pub detail: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub kind: String,
    pub label: String,
    pub t_host_utc: Option<DateTime<Utc>>,
    #[serde(default)]
    pub clock: Option<String>,
    /// Seconds on `clock`.
    #[serde(default)]
    pub t_native: Option<f64>,
    #[serde(default)]
    pub value: Option<f64>,
    #[serde(default)]
    pub payload: Map<String, Value>,
}

/// One stored value. A row holds one cell per column, in the order `describe()` lists them.
#[derive(Clone, Debug, PartialEq)]
pub enum Cell {
    Null,
    Int(i64),
    Float(f64),
    Str(String),
    TimeUtc(DateTime<Utc>),
    TimeLocal(NaiveDateTime),
}

pub type Row = Vec<Cell>;

pub trait Sink {
    fn rows(&mut self, rows: Vec<Row>);
    fn event(&mut self, event: Event);
}

/// Why an acquisition loop gave up, kept as `<kind>: <message>` in the session manifest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstrumentError {
    pub kind: String,
    pub message: String,
}

impl InstrumentError {
    pub fn new(kind: &str, message: impl Into<String>) -> Self {
        InstrumentError {
            kind: kind.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for InstrumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind, self.message)
    }
}

impl std::error::Error for InstrumentError {}

/// A stop request shared between the run controller and an acquisition loop.
#[derive(Clone, Default)]
pub struct StopSignal(Arc<(Mutex<bool>, Condvar)>);

impl StopSignal {
    pub fn set(&self) {
        let (flag, wake) = &*self.0;
        *flag.lock().unwrap() = true;
        wake.notify_all();
    }

    pub fn is_set(&self) -> bool {
        *self.0.0.lock().unwrap()
    }

    /// Sleep for up to `timeout`, returning early with `true` once stop is requested.
    pub fn wait(&self, timeout: Duration) -> bool {
        let (flag, wake) = &*self.0;
        let guard = flag.lock().unwrap();
        let (guard, _) = wake
            .wait_timeout_while(guard, timeout, |stopped| !*stopped)
            .unwrap();
        *guard
    }
}

pub trait Instrument: Send {
    fn describe(&self) -> InstrumentInfo;
    fn check_ready(&self) -> Readiness;
    /// Acquire until `stop` is set or the source ends. Return an error to report a failure.
    fn run(&mut self, sink: &mut dyn Sink, stop: &StopSignal) -> Result<(), InstrumentError>;
    /// Drive the device to a safe state immediately. Passive sources do nothing.
    fn cancel(&self);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::thread;
    use std::time::Instant;

    #[test]
    fn columns_and_clocks_serialize_like_the_python_engine() {
        let column = Column::new(
            "t_device_ms",
            ColumnType::Int64,
            "ms",
            "Ambit T counter, from the device",
        );
        assert_eq!(
            serde_json::to_string(&column).unwrap(),
            r#"{"name":"t_device_ms","type":"int64","unit":"ms","description":"Ambit T counter, from the device"}"#
        );
        let clock: Clock = serde_json::from_value(json!({
            "column": "t_source_local", "kind": "source_local", "seconds_per_unit": 1.0,
            "description": "EZView frame timestamp; which PC clock writes it is unverified"
        }))
        .unwrap();
        assert_eq!(clock.kind, ClockKind::SourceLocal);
        let local: Column =
            serde_json::from_value(json!({"name": "t", "type": "timestamp_local"})).unwrap();
        assert_eq!(
            (local.ty, local.unit.as_str()),
            (ColumnType::TimestampLocal, "")
        );
    }

    #[test]
    fn input_kinds_keep_their_python_names_and_labels() {
        assert_eq!(
            serde_json::to_value(InputKind::Simulated).unwrap(),
            json!("simulated")
        );
        assert_eq!(InputKind::Replay.label(), "Replay of a recording");
        assert!(serde_json::from_value::<InputKind>(json!("hardwar")).is_err());
    }

    #[test]
    fn column_lookup_follows_aliases() {
        let info = InstrumentInfo {
            adapter: "ezview_spool".into(),
            model: "MS".into(),
            input_kind: InputKind::Simulated,
            capabilities: BTreeSet::new(),
            columns: vec![Column::new("ch3", ColumnType::Float64, "", "")],
            clocks: vec![],
            aliases: BTreeMap::from([("m44".into(), "ch3".into())]),
        };
        assert_eq!(info.column("m44").unwrap().name, "ch3");
        assert_eq!(info.column("ch3").unwrap().name, "ch3");
        assert!(info.column("m45").is_none());
    }

    #[test]
    fn instrument_errors_read_as_kind_and_message() {
        let error = InstrumentError::new("ConnectionError", "device unplugged");
        assert_eq!(error.to_string(), "ConnectionError: device unplugged");
    }

    #[test]
    fn stop_wakes_a_waiting_loop_early() {
        let stop = StopSignal::default();
        assert!(!stop.wait(Duration::from_millis(1)));
        let waiter = stop.clone();
        let started = Instant::now();
        let handle = thread::spawn(move || waiter.wait(Duration::from_secs(10)));
        thread::sleep(Duration::from_millis(20));
        stop.set();
        assert!(handle.join().unwrap());
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(stop.is_set());
    }
}
