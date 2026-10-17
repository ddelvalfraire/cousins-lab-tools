//! The run's owner: the only code that changes or saves the manifest once a run has started.
//!
//! Capture threads and the handle send it messages; it applies them in arrival order, saves
//! on status changes, and publishes a snapshot for readers after every batch.

use std::collections::BTreeMap;
use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use arrow::array::AsArray;
use arrow::datatypes::Int64Type;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use parquet::arrow::ProjectionMask;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

use super::markers::MarkerLog;
use super::{HostClock, RunError};
use crate::ambit::timing_summary;
use crate::contract::StopSignal;
use crate::protocol::ProtocolPlan;
use crate::pycompat::format_g;
use crate::session::{
    CaptureStatus, Manifest, OnFailure, SessionError, SessionStatus, SessionStore, segments,
};
use crate::simulate::SpoolSimulator;

pub(super) enum Message {
    Report {
        role: String,
        report: Report,
    },
    Stop {
        cancel: bool,
        reply: Sender<Result<(), RunError>>,
    },
}

/// What a capture thread tells the owner. Each capture sends exactly one `NotStarted` or
/// `Ended`, as its last message.
pub(super) enum Report {
    Started {
        at: DateTime<Utc>,
    },
    NotStarted,
    Rows {
        total: u64,
        first: Option<DateTime<Utc>>,
        last: Option<DateTime<Utc>>,
    },
    Ended {
        outcome: Outcome,
        rows: u64,
        at: DateTime<Utc>,
    },
}

pub(super) enum Outcome {
    /// The adapter returned because the run asked it to stop.
    Completed,
    /// The adapter returned on its own: the source has nothing more.
    SourceEnded,
    Failed(String),
}

pub(super) struct CaptureControl {
    pub stop: StopSignal,
    pub thread: Option<JoinHandle<()>>,
    pub ended: bool,
}

/// What the owner shares with the handle. Only the owner writes `manifest`.
pub(super) struct Published {
    pub manifest: Mutex<Arc<Manifest>>,
    pub save_error: Mutex<Option<String>>,
}

impl Published {
    pub fn new(manifest: &Manifest) -> Self {
        Published {
            manifest: Mutex::new(Arc::new(manifest.clone())),
            save_error: Mutex::new(None),
        }
    }

    pub fn snapshot(&self) -> Arc<Manifest> {
        Arc::clone(&self.manifest.lock().unwrap())
    }
}

pub(super) struct Owner {
    pub store: Arc<SessionStore>,
    pub manifest: Manifest,
    pub published: Arc<Published>,
    pub captures: IndexMap<String, CaptureControl>,
    pub simulators: Vec<SpoolSimulator>,
    pub cancel: Arc<AtomicBool>,
    pub markers: Arc<Mutex<MarkerLog>>,
    /// The protocol each role runs, for the timing summary at stop.
    pub plans: BTreeMap<String, ProtocolPlan>,
    pub join_timeout: Duration,
    pub clock: HostClock,
}

impl Owner {
    pub fn run(mut self, messages: Receiver<Message>) {
        let mut deadline: Option<Instant> = None;
        loop {
            let message = match deadline {
                None => match messages.recv() {
                    Ok(message) => message,
                    Err(_) => return,
                },
                Some(deadline) => {
                    match messages.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    {
                        Ok(message) => message,
                        Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => break,
                    }
                }
            };
            let mut save = self.handle(message);
            while let Ok(message) = messages.try_recv() {
                save |= self.handle(message);
            }
            if save {
                self.save();
            }
            self.publish();
            if self.manifest.status == SessionStatus::Stopping {
                if self.captures.values().all(|c| c.ended) {
                    break;
                }
                deadline.get_or_insert_with(|| Instant::now() + self.join_timeout);
            }
        }
        self.finish();
    }

    /// Applies one message and says whether the manifest must be saved.
    fn handle(&mut self, message: Message) -> bool {
        match message {
            Message::Report { role, report } => self.apply(&role, report),
            Message::Stop { cancel, reply } => {
                let result = self.request_stop(cancel);
                // The handle waits for this reply; it can only be gone if its thread died.
                let _ = reply.send(result);
                false
            }
        }
    }

    fn apply(&mut self, role: &str, report: Report) -> bool {
        let capture = &mut self.manifest.captures[role];
        match report {
            Report::Started { at } => {
                capture.start_command_utc = Some(at);
                capture.status = CaptureStatus::Running;
            }
            Report::NotStarted => {
                capture.status = CaptureStatus::NotStarted;
                self.captures[role].ended = true;
            }
            Report::Rows { total, first, last } => {
                capture.rows = total;
                if capture.first_sample_utc.is_none() {
                    capture.first_sample_utc = first;
                }
                capture.last_sample_utc = last.or(capture.last_sample_utc);
                return false;
            }
            Report::Ended { outcome, rows, at } => {
                capture.rows = rows;
                capture.stopped_utc = Some(at);
                capture.status = match outcome {
                    Outcome::Completed => CaptureStatus::Completed,
                    Outcome::SourceEnded => CaptureStatus::SourceEnded,
                    Outcome::Failed(error) => {
                        capture.error = Some(error);
                        CaptureStatus::Failed
                    }
                };
                self.captures[role].ended = true;
                if capture.status == CaptureStatus::Failed
                    && capture.on_failure == Some(OnFailure::StopGroup)
                {
                    self.manifest.stopped_by =
                        Some(format!("{role} failed and its policy is stop_group"));
                    for other in self.captures.values() {
                        other.stop.set();
                    }
                }
            }
        }
        true
    }

    /// Saves `stopping` before any capture is asked to stop, so a reader never sees a capture
    /// stopped by request while the session still says running.
    fn request_stop(&mut self, cancel: bool) -> Result<(), RunError> {
        if self.manifest.status != SessionStatus::Running {
            return Err(RunError::NotRunning);
        }
        self.manifest.status = SessionStatus::Stopping;
        self.save();
        self.publish();
        self.cancel.store(cancel, Ordering::SeqCst);
        for capture in self.captures.values() {
            capture.stop.set();
        }
        Ok(())
    }

    /// Runs once every capture has ended or the join timeout has passed. A capture still going
    /// is recorded as interrupted, never as finished.
    fn finish(&mut self) {
        for (role, control) in &mut self.captures {
            if !control.ended {
                let capture = &mut self.manifest.captures[role];
                capture.status = CaptureStatus::Interrupted;
                capture.error = Some(format!(
                    "Capture had not ended {} s after the stop request",
                    format_g(self.join_timeout.as_secs_f64())
                ));
            } else if let Some(thread) = control.thread.take() {
                let _ = thread.join();
            }
        }
        for simulator in &mut self.simulators {
            let _ = simulator.close();
        }
        if let Err(e) = self.markers.lock().unwrap().flush() {
            *self.published.save_error.lock().unwrap() = Some(e.to_string());
        }
        for (role, plan) in &self.plans {
            let samples = self
                .store
                .capture_dir(&self.manifest.id, role)
                .join("samples");
            if let Ok(Some(device_ms)) = device_ms(&samples) {
                let timing = timing_summary(&device_ms, Some(plan));
                self.manifest.captures[role].timing =
                    Some(serde_json::to_value(timing).expect("a timing summary is plain data"));
            }
        }
        let failed = self
            .manifest
            .captures
            .values()
            .any(|c| matches!(c.status, CaptureStatus::Failed | CaptureStatus::Interrupted));
        self.manifest.status = if self.cancel.load(Ordering::SeqCst) {
            SessionStatus::Cancelled
        } else if failed {
            SessionStatus::CompletedWithFailures
        } else {
            SessionStatus::Completed
        };
        if let Some(run) = &mut self.manifest.run {
            run.stopped_utc = Some((self.clock)());
        }
        self.save();
        self.publish();
    }

    fn save(&self) {
        if let Err(e) = self.store.save(&self.manifest) {
            *self.published.save_error.lock().unwrap() = Some(e.to_string());
        }
    }

    fn publish(&self) {
        *self.published.manifest.lock().unwrap() = Arc::new(self.manifest.clone());
    }
}

/// Every `t_device_ms` in a capture's samples, in part order, or None when it wrote no part.
fn device_ms(samples: &Path) -> Result<Option<Vec<i64>>, SessionError> {
    let parts = segments(samples)?;
    if parts.is_empty() {
        return Ok(None);
    }
    let mut values = Vec::new();
    for part in parts {
        let builder = ParquetRecordBatchReaderBuilder::try_new(File::open(part)?)?;
        let mask = ProjectionMask::columns(builder.parquet_schema(), ["t_device_ms"]);
        for batch in builder.with_projection(mask).build()? {
            let batch = batch?;
            let column = batch
                .column_by_name("t_device_ms")
                .and_then(|c| c.as_primitive_opt::<Int64Type>())
                .ok_or_else(|| SessionError::BadRow("no int64 t_device_ms column".into()))?;
            values.extend(column.iter().flatten());
        }
    }
    Ok(Some(values))
}
