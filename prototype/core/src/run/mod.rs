//! Group runs: start every enabled role of a template together, each after its own delay.
//!
//! Requested start, the moment the engine started the adapter, and the first sample's receipt
//! time are recorded separately. Starting adapters together does not make the instruments
//! sample together; any relation between their samples comes from the clocks.

mod adapter;
mod capture;
mod live;
mod markers;
mod owner;

use std::collections::BTreeMap;
use std::fmt;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde_json::Value;

use crate::ambit::read_ambit_csv;
use crate::contract::{Clock, Column, InstrumentError, StopSignal};
use crate::expr::Params;
use crate::legacy_frames::read_frames;
use crate::pycompat::str_repr;
use crate::session::{
    Capture, CaptureStatus, FLUSH_EVERY, FLUSH_ROWS, Manifest, OnFailure, RunInfo, SegmentWriter,
    SessionError, SessionKind, SessionStatus, SessionStore, Source, event_columns, utc_now,
};
use crate::templates::{Paths, Profiles, Template};
use capture::{CaptureTask, Output};
use live::{LiveBuffer, PointMaker};
use markers::MarkerLog;
use owner::{CaptureControl, Message, Owner, Published};

pub use adapter::{BuiltAdapter, SIMULATED_SPOOL, build_adapter};
pub use live::{Cursors, LIVE_BUFFER_ROWS, LiveCaptureView, LiveEvent, LiveView};
pub use markers::Marker;

/// Per-capture wait at stop; a capture still running after it is recorded as interrupted.
pub const JOIN_TIMEOUT: Duration = Duration::from_secs(10);

/// What `run.note` tells a reader about times in a run that is not real time.
pub const RUN_NOTE: &str = "Simulated and replayed inputs: sample spacing and start delays are \
    divided by the speed factor, and host clock times are real. Replayed device counters such \
    as the Ambit T are the recorded values and are not compressed, so they advance slower than \
    the host clock by the speed factor. The simulated spool's timestamps are written with this \
    machine's clock.";

#[derive(Debug)]
pub enum RunError {
    /// The request cannot start a run. The text is what the API shows.
    Invalid(String),
    /// A role names an instrument profile that is gone.
    UnknownInstrument(String),
    /// Stop or mark on a session that is not running.
    NotRunning,
    Instrument(InstrumentError),
    Session(SessionError),
}

impl fmt::Display for RunError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunError::Invalid(message) => write!(f, "{message}"),
            RunError::UnknownInstrument(id) => write!(f, "Not found: {}", str_repr(id)),
            RunError::NotRunning => write!(f, "This session is not running"),
            RunError::Instrument(e) => write!(f, "{e}"),
            RunError::Session(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for RunError {}

impl From<InstrumentError> for RunError {
    fn from(e: InstrumentError) -> Self {
        RunError::Instrument(e)
    }
}

impl From<SessionError> for RunError {
    fn from(e: SessionError) -> Self {
        RunError::Session(e)
    }
}

/// A replacement for the file a role's profile reads, keyed by role. The profile on disk and
/// the template stay as they are; the capture's manifest records the path used.
pub type Sources = BTreeMap<String, PathBuf>;

/// The profile setting that names the file a role reads, for adapters whose source a run may
/// replace. A simulated spool writes its own file, so it has none.
fn source_setting(profile: &Value) -> Option<&'static str> {
    match profile["adapter"].as_str()? {
        "legacy_frames_replay" => Some("path"),
        "ambit_replay" => Some("recording"),
        "ezview_spool" if profile.get("simulate").is_none_or(Value::is_null) => Some("spool_path"),
        _ => None,
    }
}

/// Refuses a replacement source for a role the run does not start, for an input that has no
/// source file, or one that does not exist or cannot be read the way its adapter reads it.
pub fn check_sources(
    template: &Template,
    profiles: &Profiles,
    sources: &Sources,
) -> Result<(), RunError> {
    let enabled: BTreeMap<&str, &Value> = template.enabled_roles().into_iter().collect();
    for (role, path) in sources {
        let cfg = enabled
            .get(role.as_str())
            .ok_or_else(|| RunError::Invalid(format!("Role {role} is not in this run")))?;
        let profile = profile(profiles, cfg)?;
        if source_setting(profile).is_none() {
            return Err(RunError::Invalid(format!(
                "Role {role} reads a simulated input; it has no source file to replace"
            )));
        }
        if path.as_os_str().is_empty() || !path.exists() {
            return Err(RunError::Invalid(format!(
                "Source for role {role} not found: {}",
                path.display()
            )));
        }
        let readable = match profile["adapter"].as_str() {
            Some("legacy_frames_replay") => read_frames(path).map(drop).map_err(|e| e.to_string()),
            Some("ambit_replay") => read_ambit_csv(path).map(drop).map_err(|e| e.to_string()),
            _ if path.is_dir() => Err("it is a folder, not a spool file".to_string()),
            _ => File::open(path).map(drop).map_err(|e| e.to_string()),
        };
        readable.map_err(|e| {
            RunError::Invalid(format!("Source for role {role} cannot be read: {e}"))
        })?;
    }
    Ok(())
}

/// `profile` with its source setting pointing at `path`, when the run replaces it.
fn with_source(profile: &Value, path: Option<&PathBuf>) -> Value {
    let mut profile = profile.clone();
    if let (Some(path), Some(key)) = (path, source_setting(&profile)) {
        profile["settings"][key] = Value::from(path.to_string_lossy().into_owned());
    }
    profile
}

/// Refuses speeds outside 0.1x to 100x, and any speed but 1x when an enabled role reads
/// hardware, which cannot be sped up.
pub fn check_request(template: &Template, profiles: &Profiles, speed: f64) -> Result<(), RunError> {
    if !(0.1..=100.0).contains(&speed) {
        return Err(RunError::Invalid(
            "Replay speed must be between 0.1x and 100x".into(),
        ));
    }
    let mut hardware = Vec::new();
    for (role, cfg) in template.enabled_roles() {
        if profile(profiles, cfg)?["input_kind"] == "hardware" {
            hardware.push(role);
        }
    }
    if !hardware.is_empty() && speed != 1.0 {
        return Err(RunError::Invalid(format!(
            "Roles {} use hardware; hardware runs in real time (speed 1x)",
            hardware.join(", ")
        )));
    }
    Ok(())
}

fn profile<'a>(
    profiles: &'a Profiles,
    cfg: &serde_json::Value,
) -> Result<&'a serde_json::Value, RunError> {
    let id = cfg["instrument"].as_str().unwrap_or_default();
    profiles
        .get(id)
        .ok_or_else(|| RunError::UnknownInstrument(id.into()))
}

/// The host's UTC clock, for the times the run records itself. Tests that bound a gap between
/// two of them substitute a clock that cannot step.
type HostClock = Arc<dyn Fn() -> DateTime<Utc> + Send + Sync>;

/// Builds the adapter for one role. Runs use [`build_adapter`]; tests substitute their own.
type BuildAdapter =
    dyn Fn(&Value, &str, &Template, &Path, f64, &Paths) -> Result<BuiltAdapter, InstrumentError>;

/// A live or finished group run. Clones share the run; the API layer keeps one per session.
#[derive(Clone)]
pub struct GroupRun(Arc<Shared>);

struct Shared {
    id: String,
    template: Template,
    published: Arc<Published>,
    live: IndexMap<String, Arc<LiveBuffer>>,
    /// Absent when the group never started because a role was not ready.
    started: Option<Started>,
}

struct Started {
    owner: mpsc::Sender<Message>,
    t0: Instant,
    t0_utc: DateTime<Utc>,
    markers: Arc<Mutex<MarkerLog>>,
    clock: HostClock,
}

struct Launch<'a> {
    store: Arc<SessionStore>,
    paths: &'a Paths,
    template: Template,
    profiles: &'a Profiles,
    speed: f64,
    name: &'a str,
    sources: &'a Sources,
    build: &'a BuildAdapter,
    join_timeout: Duration,
    clock: HostClock,
}

/// One enabled role between preparation and its thread.
struct Prepared {
    role: String,
    built: BuiltAdapter,
    output_dir: PathBuf,
    host_time: Option<usize>,
    columns: Vec<Column>,
    clocks: Vec<Clock>,
    aliases: BTreeMap<String, String>,
    live: Arc<LiveBuffer>,
}

impl GroupRun {
    /// Checks the request, creates the session, prepares every enabled role and, when all are
    /// ready, starts them. A group with a role that is not ready is saved as `not_ready` and
    /// starts nothing. `name` falls back to the template's name.
    pub fn start(
        store: Arc<SessionStore>,
        paths: &Paths,
        template: Template,
        profiles: &Profiles,
        speed: f64,
        name: Option<&str>,
        sources: &Sources,
    ) -> Result<GroupRun, RunError> {
        check_request(&template, profiles, speed)?;
        check_sources(&template, profiles, sources)?;
        let fallback = template.data()["name"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let name = name.filter(|n| !n.is_empty()).unwrap_or(&fallback);
        GroupRun::launch(Launch {
            store,
            paths,
            template,
            profiles,
            speed,
            name,
            sources,
            build: &build_adapter,
            join_timeout: JOIN_TIMEOUT,
            clock: Arc::new(utc_now),
        })
    }

    fn launch(request: Launch<'_>) -> Result<GroupRun, RunError> {
        let Launch {
            store,
            paths,
            template,
            profiles,
            speed,
            name,
            sources,
            build,
            join_timeout,
            clock,
        } = request;
        let mut manifest = store.create(name, SessionKind::Run, template.data().clone())?;
        let mut prepared = Vec::new();
        let mut ready = true;
        for (role, cfg) in template.enabled_roles() {
            let profile = &with_source(profile(profiles, cfg)?, sources.get(role));
            let dir = store.capture_dir(&manifest.id, role);
            let built = build(profile, role, &template, &dir, speed, paths)?;
            let info = built.adapter.describe();
            let readiness = built.adapter.check_ready();
            ready &= readiness.ok;
            let delay = cfg["start_delay_s"].as_f64().unwrap_or(0.0);
            let capture = Capture {
                role: role.into(),
                label: cfg["label"].as_str().unwrap_or(role).into(),
                instrument: Some(profile.clone()),
                adapter: Some(info.adapter.clone()),
                model: Some(info.model.clone()),
                input_kind: info.input_kind,
                input_note: built.note.clone(),
                sources: built.sources.iter().map(|p| source(p)).collect(),
                capabilities: Some(info.capabilities.iter().cloned().collect()),
                columns: info.columns.clone(),
                clocks: info.clocks.clone(),
                aliases: info.aliases.clone().into_iter().collect(),
                requested_delay_s: Some(delay),
                host_delay_s: Some(delay / speed),
                on_failure: Some(
                    serde_json::from_value(cfg["on_failure"].clone())
                        .unwrap_or(OnFailure::ContinueOthers),
                ),
                status: if readiness.ok {
                    CaptureStatus::Ready
                } else {
                    CaptureStatus::NotReady
                },
                readiness: Some(readiness),
                rows: 0,
                protocol_plan: template
                    .protocol_plan(role)
                    .map(|plan| serde_json::to_value(plan).expect("a plan is plain data")),
                ignored_columns: None,
                timing: None,
                requested_start_utc: None,
                start_command_utc: None,
                first_sample_utc: None,
                last_sample_utc: None,
                error: None,
                stopped_utc: None,
            };
            manifest.captures.insert(role.into(), capture);
            prepared.push(Prepared {
                role: role.into(),
                host_time: info.columns.iter().position(|c| c.name == "t_host_utc"),
                columns: info.columns,
                clocks: info.clocks,
                aliases: info.aliases,
                live: Arc::default(),
                output_dir: dir,
                built,
            });
        }
        manifest.run = Some(RunInfo {
            speed,
            note: RUN_NOTE.into(),
            group_start_utc: None,
            stopped_utc: None,
        });
        if !ready {
            manifest.status = SessionStatus::NotReady;
            store.save(&manifest)?;
            return Ok(GroupRun(Arc::new(Shared {
                id: manifest.id.clone(),
                template,
                published: Arc::new(Published::new(&manifest)),
                live: live_buffers(&prepared),
                started: None,
            })));
        }
        store.save(&manifest)?;
        GroupRun::begin(store, manifest, template, prepared, join_timeout, clock)
    }

    /// Takes the group start, starts the simulators, then each capture's thread. Each thread
    /// waits for its own deadline on the monotonic clock, measured from the group start.
    fn begin(
        store: Arc<SessionStore>,
        mut manifest: Manifest,
        template: Template,
        prepared: Vec<Prepared>,
        join_timeout: Duration,
        clock: HostClock,
    ) -> Result<GroupRun, RunError> {
        let markers = Arc::new(Mutex::new(MarkerLog::new(&store.path(&manifest.id))?));
        let (owner_tx, owner_rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let mut tasks = Vec::new();
        let mut simulators = Vec::new();
        let live = live_buffers(&prepared);
        for p in prepared {
            let names = p.columns.iter().map(|c| c.name.clone()).collect();
            let (points, evaluation) =
                PointMaker::new(&template, &p.role, names, p.aliases, p.host_time, &p.clocks)
                    .map_err(|e| RunError::Invalid(e.to_string()))?;
            p.live.attach(evaluation);
            let output = Output {
                role: p.role.clone(),
                samples: SegmentWriter::new(
                    &p.output_dir.join("samples"),
                    &p.columns,
                    FLUSH_ROWS,
                    FLUSH_EVERY,
                )?,
                events: SegmentWriter::new(
                    &p.output_dir.join("events"),
                    &event_columns(),
                    FLUSH_ROWS,
                    Duration::ZERO,
                )?,
                host_time: p.host_time,
                stop: StopSignal::default(),
                owner: owner_tx.clone(),
                live: p.live,
                points,
                rows: 0,
                event_seq: 0,
                write_error: None,
            };
            simulators.extend(p.built.simulator);
            tasks.push((p.built.adapter, output));
        }

        let (t0, t0_utc) = (Instant::now(), clock());
        for simulator in &mut simulators {
            simulator.start().map_err(SessionError::Io)?;
        }
        manifest.status = SessionStatus::Running;
        if let Some(run) = &mut manifest.run {
            run.group_start_utc = Some(t0_utc);
        }
        let mut controls = IndexMap::new();
        for (adapter, mut output) in tasks {
            output.points.t0 = t0_utc;
            let capture = &mut manifest.captures[&output.role];
            let delay =
                Duration::from_micros((capture.host_delay_s.unwrap_or(0.0) * 1e6).round() as u64);
            capture.requested_start_utc = Some(after(t0_utc, delay));
            capture.status = if delay.is_zero() {
                CaptureStatus::Starting
            } else {
                CaptureStatus::Waiting
            };
            let role = output.role.clone();
            let stop = output.stop.clone();
            let task = CaptureTask {
                adapter,
                start_at: t0 + delay,
                cancel: Arc::clone(&cancel),
                clock: Arc::clone(&clock),
                output,
            };
            let thread = thread::Builder::new()
                .name(format!("capture-{role}"))
                .spawn(move || task.run())
                .map_err(SessionError::Io)?;
            controls.insert(
                role,
                CaptureControl {
                    stop,
                    thread: Some(thread),
                    ended: false,
                },
            );
        }
        store.save(&manifest)?;
        let published = Arc::new(Published::new(&manifest));
        let plans = template
            .enabled_roles()
            .into_iter()
            .filter_map(|(role, _)| Some((role.to_string(), template.protocol_plan(role)?.clone())))
            .collect();
        let owner = Owner {
            store,
            manifest,
            published: Arc::clone(&published),
            captures: controls,
            simulators,
            cancel,
            markers: Arc::clone(&markers),
            plans,
            join_timeout,
            clock: Arc::clone(&clock),
        };
        let id = owner.manifest.id.clone();
        thread::Builder::new()
            .name(format!("run-{id}"))
            .spawn(move || owner.run(owner_rx))
            .map_err(SessionError::Io)?;
        Ok(GroupRun(Arc::new(Shared {
            id,
            template,
            published,
            live,
            started: Some(Started {
                owner: owner_tx,
                t0,
                t0_utc,
                markers,
                clock,
            }),
        })))
    }

    pub fn id(&self) -> &str {
        &self.0.id
    }

    /// The manifest as of the owner's last update.
    pub fn manifest(&self) -> Arc<Manifest> {
        self.0.published.snapshot()
    }

    /// Running or stopping: the final status has not landed yet.
    pub fn is_running(&self) -> bool {
        matches!(
            self.manifest().status,
            SessionStatus::Running | SessionStatus::Stopping
        )
    }

    /// The last error saving the manifest, if a save has failed. The run goes on in memory.
    pub fn save_error(&self) -> Option<String> {
        self.0.published.save_error.lock().unwrap().clone()
    }

    /// Asks every capture to stop and returns once the session is saved as `stopping`. The
    /// final status lands when the captures have ended. `cancel` also asks each adapter to put
    /// its device in a safe state.
    pub fn stop(&self, cancel: bool) -> Result<(), RunError> {
        let started = self.0.started.as_ref().ok_or(RunError::NotRunning)?;
        let (reply, answer) = mpsc::channel();
        if started.owner.send(Message::Stop { cancel, reply }).is_err() {
            return Err(RunError::NotRunning);
        }
        answer.recv().unwrap_or(Err(RunError::NotRunning))
    }

    /// Records an operator marker on the host clock. The label comes from the template's
    /// event of that id; an id the template does not define is its own label.
    pub fn mark(&self, event_id: &str) -> Result<Marker, RunError> {
        let started = self.0.started.as_ref().ok_or(RunError::NotRunning)?;
        if self.manifest().status != SessionStatus::Running {
            return Err(RunError::NotRunning);
        }
        let label = self.0.template.data()["events"][event_id]["label"]
            .as_str()
            .unwrap_or(event_id);
        let now = (started.clock)();
        let marker = Marker {
            kind: event_id.into(),
            label: label.into(),
            x_run_s: seconds_since(started.t0_utc, now),
            t_host_utc: now,
        };
        Ok(started.markers.lock().unwrap().record(marker)?)
    }

    /// What changed since `cursors`, in the shape the UI polls. Status and captures come from
    /// the same manifest snapshot.
    pub fn live(&self, cursors: &Cursors) -> LiveView {
        let manifest = self.manifest();
        let captures = self
            .0
            .live
            .iter()
            .map(|(role, buffer)| {
                let rows = cursors.get(role).copied().unwrap_or(0);
                let events = cursors.get(&format!("{role}:events")).copied().unwrap_or(0);
                let status = manifest.captures[role].status;
                (role.clone(), buffer.view(rows, events, status))
            })
            .collect();
        LiveView {
            status: manifest.status,
            elapsed_s: self
                .0
                .started
                .as_ref()
                .map_or(0.0, |s| s.t0.elapsed().as_secs_f64()),
            captures,
            markers: self.markers(),
            manifest_captures: manifest.captures.clone(),
            params_rev: self
                .0
                .live
                .values()
                .map(|b| b.params_rev())
                .max()
                .unwrap_or(0),
        }
    }

    /// Recomputes every live point with `params`, the session's parameters as of analysis
    /// revision `rev`, and computes later rows with them. An older `rev` changes nothing.
    pub fn set_params(&self, params: &Params, rev: u64) {
        for buffer in self.0.live.values() {
            buffer.set_params(params, rev);
        }
    }

    pub fn markers(&self) -> Vec<Marker> {
        match &self.0.started {
            Some(started) => started.markers.lock().unwrap().recorded.clone(),
            None => Vec::new(),
        }
    }
}

/// `(t - t0).total_seconds()` on microsecond times, as Python computes run-relative times.
fn seconds_since(t0: DateTime<Utc>, t: DateTime<Utc>) -> f64 {
    (t - t0).num_microseconds().unwrap_or(i64::MAX) as f64 / 1e6
}

fn live_buffers(prepared: &[Prepared]) -> IndexMap<String, Arc<LiveBuffer>> {
    prepared
        .iter()
        .map(|p| (p.role.clone(), Arc::clone(&p.live)))
        .collect()
}

fn after(t: DateTime<Utc>, delay: Duration) -> DateTime<Utc> {
    t + chrono::Duration::from_std(delay).expect("a start delay fits in chrono's range")
}

fn source(path: &Path) -> Source {
    Source {
        path: path.display().to_string(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        sha256: None,
        bytes: None,
    }
}

#[cfg(test)]
mod tests;
