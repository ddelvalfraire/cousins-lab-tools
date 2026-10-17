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

use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::contract::Clock;
use crate::query::AnalysisError;
use crate::session::{iso_time_opt, utc_now};

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
}
