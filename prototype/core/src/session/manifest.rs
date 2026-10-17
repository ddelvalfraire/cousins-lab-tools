//! `session.json`: what a session recorded, how, and how far it got.
//!
//! Keys and their order follow what the Python engine writes, so manifests the Python engine
//! wrote still load and diff cleanly. Python's `analysis.trial_params` is dropped: nothing ever filled it in, and
//! trial parameters live in alignment records.

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::ser::{SerializeMap, Serializer};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{iso, iso_time, iso_time_opt};
use crate::contract::{Clock, Column, InputKind, Readiness};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    Run,
    Import,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Preparing,
    Running,
    Stopping,
    Completed,
    CompletedWithFailures,
    Cancelled,
    NotReady,
    Imported,
    Interrupted,
}

impl SessionStatus {
    /// A finished session is never touched by recovery.
    pub fn is_finished(self) -> bool {
        use SessionStatus::*;
        match self {
            Preparing | Running | Stopping => false,
            Completed | CompletedWithFailures | Cancelled | NotReady | Imported | Interrupted => {
                true
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureStatus {
    Ready,
    NotReady,
    Waiting,
    Starting,
    Running,
    Completed,
    SourceEnded,
    Failed,
    NotStarted,
    Interrupted,
    Imported,
}

impl CaptureStatus {
    /// A finished capture keeps its status through recovery.
    pub fn is_finished(self) -> bool {
        use CaptureStatus::*;
        match self {
            Ready | Waiting | Starting | Running => false,
            NotReady | Completed | SourceEnded | Failed | NotStarted | Interrupted | Imported => {
                true
            }
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnFailure {
    ContinueOthers,
    StopGroup,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Host {
    pub hostname: String,
    /// Local offset from UTC when the session was created, as `%z`, for example `-0700`.
    pub utc_offset: String,
}

impl Host {
    pub fn current() -> Self {
        Host {
            hostname: gethostname::gethostname().to_string_lossy().into_owned(),
            utc_offset: chrono::Local::now().format("%z").to_string(),
        }
    }
}

/// A file a capture came from. Imports also record its hash and size.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Source {
    pub path: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
}

/// One capture of a session, live or imported. Fields only one kind writes are `Option`, and
/// an absent one is left out of the JSON, so each kind has exactly the keys Python writes.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Capture {
    pub role: String,
    pub label: String,
    /// The instrument profile a live capture ran with.
    pub instrument: Option<Value>,
    pub adapter: Option<String>,
    pub model: Option<String>,
    pub input_kind: InputKind,
    pub input_note: String,
    pub sources: Vec<Source>,
    pub capabilities: Option<Vec<String>>,
    pub columns: Vec<Column>,
    pub clocks: Vec<Clock>,
    pub aliases: IndexMap<String, String>,
    pub requested_delay_s: Option<f64>,
    pub host_delay_s: Option<f64>,
    pub on_failure: Option<OnFailure>,
    pub readiness: Option<Readiness>,
    pub status: CaptureStatus,
    pub rows: u64,
    pub protocol_plan: Option<Value>,
    pub ignored_columns: Option<Vec<String>>,
    pub timing: Option<Value>,
    #[serde(default, with = "iso_time_opt")]
    pub requested_start_utc: Option<DateTime<Utc>>,
    #[serde(default, with = "iso_time_opt")]
    pub start_command_utc: Option<DateTime<Utc>>,
    #[serde(default, with = "iso_time_opt")]
    pub first_sample_utc: Option<DateTime<Utc>>,
    #[serde(default, with = "iso_time_opt")]
    pub last_sample_utc: Option<DateTime<Utc>>,
    pub error: Option<String>,
    #[serde(default, with = "iso_time_opt")]
    pub stopped_utc: Option<DateTime<Utc>>,
}

struct Iso<'a>(&'a DateTime<Utc>);

impl Serialize for Iso<'_> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&iso(*self.0))
    }
}

fn some<M: SerializeMap, T: Serialize>(
    map: &mut M,
    key: &str,
    value: &Option<T>,
) -> Result<(), M::Error> {
    match value {
        Some(value) => map.serialize_entry(key, value),
        None => Ok(()),
    }
}

fn some_time<M: SerializeMap>(
    map: &mut M,
    key: &str,
    value: &Option<DateTime<Utc>>,
) -> Result<(), M::Error> {
    some(map, key, &value.as_ref().map(Iso))
}

/// Python-written manifests order live and imported capture keys differently: live captures
/// add times as the run goes, imports add rows and columns last.
impl Serialize for Capture {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut map = s.serialize_map(None)?;
        map.serialize_entry("role", &self.role)?;
        map.serialize_entry("label", &self.label)?;
        if self.input_kind == InputKind::Import {
            map.serialize_entry("input_kind", &self.input_kind)?;
            map.serialize_entry("input_note", &self.input_note)?;
            map.serialize_entry("sources", &self.sources)?;
            map.serialize_entry("status", &self.status)?;
            // The Ambit importer writes these three together, including a null plan.
            if self.ignored_columns.is_some() {
                map.serialize_entry("ignored_columns", &self.ignored_columns)?;
                map.serialize_entry("timing", &self.timing)?;
                map.serialize_entry("protocol_plan", &self.protocol_plan)?;
            }
            map.serialize_entry("rows", &self.rows)?;
            map.serialize_entry("columns", &self.columns)?;
            map.serialize_entry("clocks", &self.clocks)?;
            map.serialize_entry("aliases", &self.aliases)?;
        } else {
            some(&mut map, "instrument", &self.instrument)?;
            some(&mut map, "adapter", &self.adapter)?;
            some(&mut map, "model", &self.model)?;
            map.serialize_entry("input_kind", &self.input_kind)?;
            map.serialize_entry("input_note", &self.input_note)?;
            map.serialize_entry("sources", &self.sources)?;
            some(&mut map, "capabilities", &self.capabilities)?;
            map.serialize_entry("columns", &self.columns)?;
            map.serialize_entry("clocks", &self.clocks)?;
            map.serialize_entry("aliases", &self.aliases)?;
            some(&mut map, "requested_delay_s", &self.requested_delay_s)?;
            some(&mut map, "host_delay_s", &self.host_delay_s)?;
            some(&mut map, "on_failure", &self.on_failure)?;
            some(&mut map, "readiness", &self.readiness)?;
            map.serialize_entry("status", &self.status)?;
            map.serialize_entry("rows", &self.rows)?;
            map.serialize_entry("protocol_plan", &self.protocol_plan)?;
            some_time(&mut map, "requested_start_utc", &self.requested_start_utc)?;
            some_time(&mut map, "start_command_utc", &self.start_command_utc)?;
            some_time(&mut map, "first_sample_utc", &self.first_sample_utc)?;
            some_time(&mut map, "last_sample_utc", &self.last_sample_utc)?;
            some(&mut map, "error", &self.error)?;
            some_time(&mut map, "stopped_utc", &self.stopped_utc)?;
            some(&mut map, "timing", &self.timing)?;
        }
        map.end()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RunInfo {
    pub speed: f64,
    pub note: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "iso_time_opt"
    )]
    pub group_start_utc: Option<DateTime<Utc>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "iso_time_opt"
    )]
    pub stopped_utc: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub kind: SessionKind,
    pub status: SessionStatus,
    #[serde(with = "iso_time")]
    pub created_utc: DateTime<Utc>,
    pub host: Host,
    /// The template snapshot the session was created from.
    pub template: Value,
    pub captures: IndexMap<String, Capture>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run: Option<RunInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stopped_by: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(path).unwrap()
    }

    /// The Python manifest minus `analysis`, re-serialized with its key order intact.
    fn python_without_analysis(text: &str) -> String {
        let mut python: Value = serde_json::from_str(text).unwrap();
        python.as_object_mut().unwrap().shift_remove("analysis");
        serde_json::to_string_pretty(&python).unwrap()
    }

    #[test]
    fn python_manifests_round_trip_with_their_keys_in_order() {
        for name in [
            "python-run-session.json",
            "python-failed-run-session.json",
            "python-import-session.json",
        ] {
            let text = fixture(name);
            let manifest: Manifest = serde_json::from_str(&text).unwrap();
            assert_eq!(
                serde_json::to_string_pretty(&manifest).unwrap(),
                python_without_analysis(&text),
                "{name}"
            );
        }
    }

    #[test]
    fn python_manifests_parse_into_typed_fields() {
        let run: Manifest =
            serde_json::from_str(&fixture("python-failed-run-session.json")).unwrap();
        assert_eq!(run.status, SessionStatus::CompletedWithFailures);
        let light = &run.captures["light"];
        assert_eq!(light.status, CaptureStatus::Failed);
        assert_eq!(light.on_failure, Some(OnFailure::StopGroup));
        assert_eq!(
            light.error.as_deref(),
            Some("ConnectionError: device unplugged")
        );
        assert_eq!(
            run.stopped_by.as_deref(),
            Some("light failed and its policy is stop_group")
        );

        let import: Manifest =
            serde_json::from_str(&fixture("python-import-session.json")).unwrap();
        assert_eq!(import.kind, SessionKind::Import);
        let ids: Vec<&str> = import.captures.keys().map(String::as_str).collect();
        assert_eq!(ids, ["ms-workbook", "light-150-pl1"]);
        assert_eq!(
            import.captures["ms-workbook"].sources[0].bytes,
            Some(2365886)
        );
        assert_eq!(iso(import.created_utc), "2026-10-17T00:04:58.831359+00:00");
    }

    #[test]
    fn statuses_keep_python_names() {
        assert_eq!(
            serde_json::to_value(SessionStatus::CompletedWithFailures).unwrap(),
            "completed_with_failures"
        );
        assert_eq!(
            serde_json::to_value(CaptureStatus::SourceEnded).unwrap(),
            "source_ended"
        );
        assert!(serde_json::from_value::<CaptureStatus>("finished".into()).is_err());
    }

    #[test]
    fn source_ended_and_not_started_captures_count_as_finished() {
        assert!(CaptureStatus::SourceEnded.is_finished());
        assert!(CaptureStatus::NotStarted.is_finished());
        assert!(!CaptureStatus::Waiting.is_finished());
        assert!(!SessionStatus::Stopping.is_finished());
        assert!(SessionStatus::NotReady.is_finished());
    }

    #[test]
    fn host_offset_is_signed_hours_and_minutes() {
        let host = Host::current();
        assert!(!host.hostname.is_empty());
        let offset = host.utc_offset.as_bytes();
        assert_eq!(offset.len(), 5, "{}", host.utc_offset);
        assert!(matches!(offset[0], b'+' | b'-'));
        assert!(offset[1..].iter().all(u8::is_ascii_digit));
    }
}
