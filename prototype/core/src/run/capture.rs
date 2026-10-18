//! One capture's thread: wait for its start, run the adapter, write what it produces.
//!
//! The thread owns its adapter and its segment writers. It never touches the manifest; it
//! reports to the run's owner, and its last act is the report that it ended.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::time::Instant;

use chrono::{DateTime, Utc};

use super::HostClock;
use super::live::{LiveBuffer, PointMaker};
use super::owner::{Message, Outcome, Report};
use crate::contract::{Cell, Event, Instrument, Row, Sink, StopSignal};
use crate::session::{SegmentWriter, SessionError, event_row};

pub(super) struct CaptureTask {
    pub adapter: Box<dyn Instrument>,
    pub start_at: Instant,
    pub cancel: Arc<AtomicBool>,
    pub clock: HostClock,
    pub output: Output,
}

/// Where a capture's rows and events go: its segments, and reports to the owner.
pub(super) struct Output {
    pub role: String,
    pub samples: SegmentWriter,
    pub events: SegmentWriter,
    /// Position of `t_host_utc` in the adapter's rows, when it records one.
    pub host_time: Option<usize>,
    pub stop: StopSignal,
    pub owner: Sender<Message>,
    pub live: Arc<LiveBuffer>,
    pub points: PointMaker,
    pub rows: u64,
    pub event_seq: i64,
    pub write_error: Option<String>,
}

impl CaptureTask {
    pub fn run(self) {
        let CaptureTask {
            mut adapter,
            start_at,
            cancel,
            clock,
            mut output,
        } = self;
        let stop = output.stop.clone();
        if stop.wait(start_at.saturating_duration_since(Instant::now())) {
            end(&*adapter, &cancel, &output, Report::NotStarted);
            return;
        }
        output.report(Report::Started { at: clock() });
        let result = adapter.run(&mut output, &stop);
        let flushed = output
            .samples
            .flush()
            .and_then(|()| output.events.flush())
            .map_err(|e| write_failure(&e));
        let written = match output.write_error.take() {
            Some(error) => Err(error),
            None => flushed,
        };
        let outcome = match (result, written) {
            (Err(e), _) => Outcome::Failed(e.to_string()),
            (Ok(()), Err(e)) => Outcome::Failed(e),
            (Ok(()), Ok(())) if stop.is_set() => Outcome::Completed,
            (Ok(()), Ok(())) => Outcome::SourceEnded,
        };
        let ended = Report::Ended {
            outcome,
            rows: output.rows,
            at: clock(),
        };
        end(&*adapter, &cancel, &output, ended);
    }
}

fn end(adapter: &dyn Instrument, cancel: &AtomicBool, output: &Output, report: Report) {
    if cancel.load(Ordering::SeqCst) {
        adapter.cancel();
    }
    output.report(report);
}

fn write_failure(error: &SessionError) -> String {
    match error {
        SessionError::Io(e) => format!("OSError: {e}"),
        other => format!("ArrowInvalid: {other}"),
    }
}

impl Output {
    fn report(&self, report: Report) {
        // A send fails only once the owner has given up waiting for this capture, and then
        // nothing is left to tell.
        let _ = self.owner.send(Message::Report {
            role: self.role.clone(),
            report,
        });
    }

    fn host_time(&self, row: &Row) -> Option<DateTime<Utc>> {
        match row.get(self.host_time?) {
            Some(Cell::TimeUtc(t)) => Some(*t),
            _ => None,
        }
    }

    /// A capture that cannot store what it acquires has failed. Stopping it ends the
    /// adapter's loop instead of letting it acquire into nothing.
    fn failed_to_write(&mut self, error: &SessionError) {
        if self.write_error.is_none() {
            self.write_error = Some(write_failure(error));
            self.stop.set();
        }
    }
}

impl Sink for Output {
    fn rows(&mut self, rows: Vec<Row>) {
        let (Some(first_row), Some(last_row)) = (rows.first(), rows.last()) else {
            return;
        };
        let first = if self.rows == 0 {
            self.host_time(first_row)
        } else {
            None
        };
        let last = self.host_time(last_row);
        let points = rows.iter().map(|row| self.points.raw(row)).collect();
        self.rows += rows.len() as u64;
        if let Err(e) = self.samples.append(rows) {
            self.failed_to_write(&e);
        }
        self.live.push_rows(points);
        self.report(Report::Rows {
            total: self.rows,
            first,
            last,
        });
    }

    fn event(&mut self, event: Event) {
        let row = event_row(self.event_seq, &event);
        self.event_seq += 1;
        if let Err(e) = self.events.append(vec![row]) {
            self.failed_to_write(&e);
        }
        self.live.push_event(self.points.event(&event));
    }
}
