//! The run's owner: the only code that changes or saves the manifest once a run has started.
//!
//! Capture threads and the handle send it messages; it applies them in arrival order, saves
//! on status changes, and publishes a snapshot for readers after every batch.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use chrono::{DateTime, Utc};
use indexmap::IndexMap;

use super::RunError;
use crate::contract::StopSignal;
use crate::session::{CaptureStatus, Manifest, SessionStatus, SessionStore, utc_now};
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

/// What the owner keeps of a capture thread after starting it.
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
}

impl Owner {
    pub fn run(mut self, messages: Receiver<Message>) {
        loop {
            let Ok(message) = messages.recv() else {
                return;
            };
            let mut save = self.handle(message);
            while let Ok(message) = messages.try_recv() {
                save |= self.handle(message);
            }
            if save {
                self.save();
            }
            self.publish();
            if self.manifest.status == SessionStatus::Stopping
                && self.captures.values().all(|c| c.ended)
            {
                break;
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

    fn finish(&mut self) {
        for capture in self.captures.values_mut() {
            if let Some(thread) = capture.thread.take() {
                let _ = thread.join();
            }
        }
        for simulator in &mut self.simulators {
            let _ = simulator.close();
        }
        let failed = self
            .manifest
            .captures
            .values()
            .any(|c| c.status == CaptureStatus::Failed);
        self.manifest.status = if self.cancel.load(Ordering::SeqCst) {
            SessionStatus::Cancelled
        } else if failed {
            SessionStatus::CompletedWithFailures
        } else {
            SessionStatus::Completed
        };
        if let Some(run) = &mut self.manifest.run {
            run.stopped_utc = Some(utc_now());
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
