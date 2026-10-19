//! Session storage: a folder per session, a JSON manifest, and Parquet segments per capture.
//!
//! ```text
//! sessions/<id>/session.json              template snapshot, captures, timing, status
//! sessions/<id>/captures/<cid>/samples/   part-NNNNN.parquet, rolled every few seconds
//! sessions/<id>/captures/<cid>/events/    part-NNNNN.parquet
//! sessions/<id>/captures/<cid>/raw/       source bytes (spool file, copies of imported files)
//! sessions/<id>/markers/                  operator events, host clock
//! sessions/<id>/alignments/<aid>.json     explicit offsets; never applied to stored data
//! ```
//!
//! A Parquet file is unreadable until its footer is written, so each segment is written to a
//! temporary name and renamed when complete. A crash loses at most the unflushed rows.

mod events;
mod manifest;
mod recovery;
mod segment;
mod store;
mod time;

use std::fmt;
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

pub use events::{event_columns, event_row};
pub use manifest::{
    Capture, CaptureStatus, Host, Manifest, OnFailure, RunInfo, SessionKind, SessionStatus, Source,
    StartPlan,
};
pub use segment::{
    FLUSH_EVERY, FLUSH_ROWS, SegmentWriter, arrow_schema, read_segment, segment_rows, segments,
};
pub use store::SessionStore;
pub use time::{iso, iso_time, iso_time_opt, parse_iso, utc_now};

#[derive(Debug)]
pub enum SessionError {
    Io(io::Error),
    Parquet(parquet::errors::ParquetError),
    Arrow(arrow::error::ArrowError),
    Json(serde_json::Error),
    /// A row whose cells do not match the writer's columns.
    BadRow(String),
}

impl fmt::Display for SessionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionError::Io(e) => write!(f, "{e}"),
            SessionError::Parquet(e) => write!(f, "{e}"),
            SessionError::Arrow(e) => write!(f, "{e}"),
            SessionError::Json(e) => write!(f, "{e}"),
            SessionError::BadRow(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for SessionError {}

impl From<io::Error> for SessionError {
    fn from(e: io::Error) -> Self {
        SessionError::Io(e)
    }
}

impl From<parquet::errors::ParquetError> for SessionError {
    fn from(e: parquet::errors::ParquetError) -> Self {
        SessionError::Parquet(e)
    }
}

impl From<arrow::error::ArrowError> for SessionError {
    fn from(e: arrow::error::ArrowError) -> Self {
        SessionError::Arrow(e)
    }
}

impl From<serde_json::Error> for SessionError {
    fn from(e: serde_json::Error) -> Self {
        SessionError::Json(e)
    }
}

/// Lowercase ASCII words joined by `-`, at most 40 characters, `session` when nothing is left.
pub fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out: String = out.trim_matches('-').chars().take(40).collect();
    if out.is_empty() {
        "session".into()
    } else {
        out
    }
}

/// `YYYYMMDD-HHMMSS-<slug>`, before any suffix that keeps it unique.
pub fn session_id(created: DateTime<Utc>, name: &str) -> String {
    format!("{}-{}", created.format("%Y%m%d-%H%M%S"), slug(name))
}

/// Lowercase hex SHA-256 of a file's bytes.
pub fn sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut block = vec![0; 1 << 20];
    loop {
        let n = file.read(&mut block)?;
        if n == 0 {
            break;
        }
        hasher.update(&block[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn slug_keeps_python_quirks() {
        assert_eq!(slug("Killed run"), "killed-run");
        assert_eq!(slug("  150 / pl1 (Diego)  "), "150-pl1-diego");
        assert_eq!(slug("Ünïcode ÄB"), "n-code-b");
        assert_eq!(slug("!!!"), "session");
        assert_eq!(slug(""), "session");
        let long = format!("{} b", "a".repeat(39));
        assert_eq!(slug(&long), format!("{}-", "a".repeat(39)));
        assert_eq!(slug(&"x".repeat(50)).len(), 40);
    }

    #[test]
    fn session_ids_start_with_the_utc_second() {
        let created = Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap();
        assert_eq!(
            session_id(created, "Killed run"),
            "20261016-220952-killed-run"
        );
    }

    #[test]
    fn sha256_hashes_file_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("abc.txt");
        std::fs::write(&path, b"abc").unwrap();
        assert_eq!(
            sha256(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
