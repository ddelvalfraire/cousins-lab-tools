//! Operator markers: events the researcher records during a run, on the host clock.

use std::path::Path;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::contract::Event;
use crate::session::{FLUSH_ROWS, SegmentWriter, SessionError, event_columns, event_row, iso_time};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Marker {
    pub kind: String,
    pub label: String,
    /// Seconds since the group start.
    pub x_run_s: f64,
    #[serde(with = "iso_time")]
    pub t_host_utc: DateTime<Utc>,
}

/// The session's `markers/` segments plus the markers recorded so far. Each marker is
/// written as its own segment at once, as Python does, so a crash cannot lose one.
pub(super) struct MarkerLog {
    writer: SegmentWriter,
    seq: i64,
    pub recorded: Vec<Marker>,
}

impl MarkerLog {
    pub fn new(session_dir: &Path) -> Result<Self, SessionError> {
        Ok(MarkerLog {
            writer: SegmentWriter::new(
                &session_dir.join("markers"),
                &event_columns(),
                FLUSH_ROWS,
                Duration::ZERO,
            )?,
            seq: 0,
            recorded: Vec::new(),
        })
    }

    pub fn record(&mut self, marker: Marker) -> Result<Marker, SessionError> {
        let event = Event {
            kind: marker.kind.clone(),
            label: marker.label.clone(),
            t_host_utc: Some(marker.t_host_utc),
            clock: Some("t_host_utc".into()),
            t_native: None,
            value: None,
            payload: Default::default(),
        };
        self.writer.append(vec![event_row(self.seq, &event)])?;
        self.seq += 1;
        self.recorded.push(marker.clone());
        Ok(marker)
    }

    pub fn flush(&mut self) -> Result<(), SessionError> {
        self.writer.flush()
    }
}
