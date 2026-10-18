//! The session's analysis log: one immutable JSON file per operator action,
//! `sessions/<id>/analysis/rec-NNNNNN.json`. The number is the log's total order. A file is
//! linked into place whole and never replaced, so two writers never share a target.

use std::fmt;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use indexmap::IndexMap;

use crate::alignment::TemplateRef;
use crate::expr::Params;
use crate::query::AnalysisError;
use crate::session::iso_time;

use super::reading::{Range, ReadingValue};

static ATTEMPTS: AtomicU64 = AtomicU64::new(0);

/// `rec-000042`: the record's place in the log.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RecordId(String);

impl RecordId {
    pub fn new(seq: u64) -> RecordId {
        RecordId(format!("rec-{seq:06}"))
    }

    /// The id a request names, if it has the form of one.
    pub fn parse(text: &str) -> Option<RecordId> {
        let digits = text.strip_prefix("rec-")?;
        (digits.len() >= 6 && digits.bytes().all(|b| b.is_ascii_digit()))
            .then(|| RecordId(text.to_string()))
    }

    pub fn seq(&self) -> u64 {
        self.0[4..].parse().unwrap_or(0)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RecordId {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// What the operator did. Values the engine computed are stored with the action, so the log
/// replays to the same state whatever changes later.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    /// Statistics over a range of a capture's stored rows, for one step.
    Reading {
        step: String,
        capture: String,
        /// On the capture's source clock.
        range_s: Range,
        /// That clock's column.
        clock: String,
        values: IndexMap<String, ReadingValue>,
        /// The parameters derived values were computed with.
        params: Params,
    },
    /// A results table row: the draft's readings and results as they were, with the
    /// parameters the results used. Later calibrations do not change it.
    AddRow {
        measurement: String,
        labels: IndexMap<String, String>,
        /// The reading and typed records the row took; they leave the draft for good.
        readings: Vec<RecordId>,
        results: IndexMap<String, Option<f64>>,
        params: Params,
    },
    /// Values the operator typed for one step instead of reading a range, by reading name.
    /// Like a reading, the latest record of a step fills it.
    Typed {
        step: String,
        values: IndexMap<String, f64>,
    },
    /// A typed parameter value; None clears an earlier entry.
    Entry {
        parameter: String,
        value: Option<f64>,
    },
    /// Hides the named records from the fold. Nothing is deleted.
    Retract { records: Vec<RecordId> },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Record {
    pub id: RecordId,
    #[serde(with = "iso_time")]
    pub created_utc: DateTime<Utc>,
    pub template: TemplateRef,
    /// A retried request carries the same id and folds once.
    pub request_id: Option<String>,
    #[serde(flatten)]
    pub action: Action,
}

fn analysis_dir(session_dir: &Path) -> PathBuf {
    session_dir.join("analysis")
}

fn record_file(dir: &Path, id: &RecordId) -> PathBuf {
    dir.join(format!("{id}.json"))
}

/// Every record of the session in log order; empty when nothing has been recorded.
pub fn load_records(session_dir: &Path) -> Result<Vec<Record>, AnalysisError> {
    let dir = analysis_dir(session_dir);
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut records = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let named = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix(".json"))
            .and_then(RecordId::parse);
        if named.is_some() {
            let record: Record = serde_json::from_str(&fs::read_to_string(&path)?)?;
            records.push(record);
        }
    }
    records.sort_by_key(|r| r.id.seq());
    Ok(records)
}

/// Saves `action` as the next record of the log and returns it.
pub fn append(
    session_dir: &Path,
    template: TemplateRef,
    request_id: Option<String>,
    action: Action,
    created_utc: DateTime<Utc>,
) -> Result<Record, AnalysisError> {
    let dir = analysis_dir(session_dir);
    fs::create_dir_all(&dir)?;
    let next = load_records(session_dir)?
        .last()
        .map_or(1, |r| r.id.seq() + 1);
    let record = Record {
        id: RecordId::new(next),
        created_utc,
        template,
        request_id,
        action,
    };
    link_from(&dir, record)
}

/// Links `record` into place under its id, or under the next free number when another
/// writer took that one first. An existing file is never replaced.
fn link_from(dir: &Path, mut record: Record) -> Result<Record, AnalysisError> {
    loop {
        let attempt = ATTEMPTS.fetch_add(1, Ordering::Relaxed);
        let partial = dir.join(format!(
            ".{}.{}-{attempt}.partial",
            record.id,
            std::process::id()
        ));
        fs::write(&partial, serde_json::to_string_pretty(&record)?)?;
        let linked = fs::hard_link(&partial, record_file(dir, &record.id));
        fs::remove_file(&partial)?;
        match linked {
            Ok(()) => return Ok(record),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => {
                record.id = RecordId::new(record.id.seq() + 1);
            }
            Err(e) => return Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::thread;

    use super::*;
    use crate::session::utc_now;

    fn template() -> TemplateRef {
        TemplateRef {
            id: "t".into(),
            revision: 1,
        }
    }

    fn entry(parameter: &str, value: f64) -> Action {
        Action::Entry {
            parameter: parameter.into(),
            value: Some(value),
        }
    }

    #[test]
    fn records_are_numbered_in_order_and_read_back_as_written() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_records(dir.path()).unwrap().is_empty());
        let first = append(
            dir.path(),
            template(),
            Some("r1".into()),
            entry("temp_c", 25.0),
            utc_now(),
        )
        .unwrap();
        let second = append(
            dir.path(),
            template(),
            None,
            Action::Retract {
                records: vec![first.id.clone()],
            },
            utc_now(),
        )
        .unwrap();
        assert_eq!(
            (first.id.as_str(), second.id.as_str()),
            ("rec-000001", "rec-000002")
        );
        assert_eq!(load_records(dir.path()).unwrap(), [first, second]);
        let text = fs::read_to_string(dir.path().join("analysis/rec-000001.json")).unwrap();
        let stored: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(stored["action"], "entry");
        assert_eq!(stored["parameter"], "temp_c");
        assert_eq!(stored["value"], 25.0);
        assert_eq!(stored["request_id"], "r1");
    }

    #[test]
    fn a_taken_number_is_never_overwritten_and_the_record_takes_the_next_one() {
        let dir = tempfile::tempdir().unwrap();
        let analysis = analysis_dir(dir.path());
        fs::create_dir_all(&analysis).unwrap();
        let taken = record_file(&analysis, &RecordId::new(1));
        fs::write(&taken, "written by another process").unwrap();
        let record = Record {
            id: RecordId::new(1),
            created_utc: utc_now(),
            template: template(),
            request_id: None,
            action: entry("temp_c", 25.0),
        };
        let saved = link_from(&analysis, record).unwrap();
        assert_eq!(saved.id.as_str(), "rec-000002");
        assert_eq!(
            fs::read_to_string(&taken).unwrap(),
            "written by another process"
        );
        let names: Vec<String> = fs::read_dir(&analysis)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.iter().all(|n| !n.ends_with(".partial")), "{names:?}");
    }

    #[test]
    fn concurrent_writers_each_get_their_own_record() {
        let dir = Arc::new(tempfile::tempdir().unwrap());
        let writers: Vec<_> = (0..8)
            .map(|i| {
                let dir = Arc::clone(&dir);
                thread::spawn(move || {
                    append(
                        dir.path(),
                        template(),
                        None,
                        entry("p", i as f64),
                        utc_now(),
                    )
                    .unwrap()
                })
            })
            .collect();
        let mut saved: Vec<Record> = writers.into_iter().map(|w| w.join().unwrap()).collect();
        saved.sort_by_key(|r| r.id.seq());
        let stored = load_records(dir.path()).unwrap();
        assert_eq!(
            stored.iter().map(|r| r.id.seq()).collect::<Vec<_>>(),
            (1..=8).collect::<Vec<_>>()
        );
        assert_eq!(
            stored, saved,
            "every writer's record is stored as it was written"
        );
    }

    #[test]
    fn only_rec_names_parse_as_record_ids() {
        assert_eq!(RecordId::parse("rec-000042").unwrap().seq(), 42);
        assert_eq!(RecordId::parse("rec-1234567").unwrap().seq(), 1_234_567);
        for bad in ["rec-42", "rec-00004x", "../rec-000001", "aln-000001", ""] {
            assert_eq!(RecordId::parse(bad), None, "{bad}");
        }
    }
}
