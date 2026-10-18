use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::thread;

use arrow::array::AsArray;
use arrow::datatypes::{DataType, Int64Type, TimestampMicrosecondType};
use chrono::{Local, SubsecRound, TimeZone};
use parquet::arrow::ProjectionMask;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use serde_json::{Map, Value, json};

use super::live::LiveBuffer;
use super::*;
use crate::calc::Program;
use crate::contract::{Cell, InputKind, Instrument, InstrumentInfo, Readiness, Sink};
use crate::query::SessionDb;
use crate::schemas;
use crate::session::segments;
use crate::session::utc_now;
use crate::templates::{TemplateStore, load_profiles, validate};

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";
const SPEED: f64 = 50.0;

fn profiles() -> Profiles {
    load_profiles(&Paths::default().instruments).unwrap()
}

/// The built-in template with `changes` merged into its roles.
fn template_with(data_dir: &Path, changes: Value) -> Template {
    let store = TemplateStore::new(Paths::default(), data_dir);
    let mut data = store.get(TEMPLATE, None).unwrap().data().clone();
    for (role, fields) in changes.as_object().unwrap() {
        let cfg = data["roles"][role].as_object_mut().unwrap();
        for (key, value) in fields.as_object().unwrap() {
            cfg.insert(key.clone(), value.clone());
        }
    }
    validate(data, &profiles()).unwrap()
}

static RUNS: RwLock<()> = RwLock::new(());

/// Tests that assert a timing bound or a race-free order hold this alone. Without it, the CPU
/// spent by parallel runs is what they measure.
fn alone() -> RwLockWriteGuard<'static, ()> {
    RUNS.write().unwrap_or_else(PoisonError::into_inner)
}

/// Other tests that start a group run share the lock with each other.
fn shared() -> RwLockReadGuard<'static, ()> {
    RUNS.read().unwrap_or_else(PoisonError::into_inner)
}

fn store(data_dir: &Path) -> Arc<SessionStore> {
    Arc::new(SessionStore::new(data_dir).unwrap())
}

/// Starts a group without the request checks.
fn launch(
    data_dir: &Path,
    template: Template,
    profiles: &Profiles,
    build: &BuildAdapter,
    join_timeout: Duration,
    clock: HostClock,
) -> GroupRun {
    GroupRun::launch(Launch {
        store: store(data_dir),
        paths: &Paths::default(),
        template,
        profiles,
        speed: SPEED,
        name: "group test",
        build,
        join_timeout,
        clock,
    })
    .unwrap()
}

fn start(data_dir: &Path, template: Template, clock: HostClock) -> GroupRun {
    let run = launch(
        data_dir,
        template,
        &profiles(),
        &build_adapter,
        JOIN_TIMEOUT,
        clock,
    );
    let manifest = run.manifest();
    assert_eq!(
        manifest.status,
        SessionStatus::Running,
        "{:?}",
        manifest.captures
    );
    run
}

/// UTC read off the monotonic clock from one starting point. Under WSL2 the wall clock can
/// step about 0.5 s forward every 32 s while the run waits on the monotonic clock, so
/// a 1.5 s start delay that straddles a step would read as 0.5 s late.
fn steady_clock() -> HostClock {
    let (base, at) = (utc_now(), Instant::now());
    Arc::new(move || (base + chrono::Duration::from_std(at.elapsed()).unwrap()).trunc_subsecs(6))
}

fn wait_until(timeout_s: f64, mut done: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs_f64(timeout_s);
    while Instant::now() < deadline {
        if done() {
            return true;
        }
        thread::sleep(Duration::from_millis(50));
    }
    false
}

/// Stops the run and waits for its final status.
fn stop(run: &GroupRun, cancel: bool) -> Arc<Manifest> {
    run.stop(cancel).unwrap();
    assert!(
        wait_until(20.0, || !run.is_running()),
        "the run did not finish"
    );
    run.manifest()
}

fn seconds(from: DateTime<Utc>, to: DateTime<Utc>) -> f64 {
    (to - from).num_microseconds().unwrap() as f64 / 1e6
}

/// One integer or timestamp column of every finished segment in `dir`, in part order.
fn column(dir: &Path, name: &str) -> Vec<i64> {
    let mut values = Vec::new();
    for part in segments(dir).unwrap() {
        let builder = ParquetRecordBatchReaderBuilder::try_new(File::open(part).unwrap()).unwrap();
        let mask = ProjectionMask::columns(builder.parquet_schema(), [name]);
        for batch in builder.with_projection(mask).build().unwrap() {
            let array = batch.unwrap().column(0).clone();
            match array.data_type() {
                DataType::Int64 => values.extend(array.as_primitive::<Int64Type>().values()),
                DataType::Timestamp(..) => {
                    values.extend(array.as_primitive::<TimestampMicrosecondType>().values())
                }
                other => panic!("{name} is {other}"),
            }
        }
    }
    values
}

fn strings(dir: &Path, name: &str) -> Vec<String> {
    let mut values = Vec::new();
    for part in segments(dir).unwrap() {
        let builder = ParquetRecordBatchReaderBuilder::try_new(File::open(part).unwrap()).unwrap();
        let mask = ProjectionMask::columns(builder.parquet_schema(), [name]);
        for batch in builder.with_projection(mask).build().unwrap() {
            let batch = batch.unwrap();
            let array = batch.column(0).as_string::<i32>();
            values.extend(array.iter().map(|v| v.unwrap_or_default().to_string()));
        }
    }
    values
}

#[derive(Clone, Copy)]
enum Behaviour {
    UntilStopped,
    IgnoresStopFor(Duration),
    Fails,
}

/// A light-role adapter whose loop the test controls, and which notes being cancelled.
struct TestAdapter {
    behaviour: Behaviour,
    cancelled: Arc<AtomicBool>,
}

impl Instrument for TestAdapter {
    fn describe(&self) -> InstrumentInfo {
        InstrumentInfo {
            adapter: "test".into(),
            model: "test".into(),
            input_kind: InputKind::Simulated,
            capabilities: ["acquire".to_string()].into(),
            columns: vec![],
            clocks: vec![],
            aliases: Default::default(),
        }
    }

    fn check_ready(&self) -> Readiness {
        Readiness {
            ok: true,
            detail: "ok".into(),
        }
    }

    fn run(&mut self, _sink: &mut dyn Sink, stop: &StopSignal) -> Result<(), InstrumentError> {
        match self.behaviour {
            Behaviour::UntilStopped => while !stop.wait(Duration::from_millis(10)) {},
            Behaviour::IgnoresStopFor(stall) => thread::sleep(stall),
            Behaviour::Fails => {
                return Err(InstrumentError::new("ConnectionError", "device unplugged"));
            }
        }
        Ok(())
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

/// Builds `light` as a [`TestAdapter`] and every other role as a run would.
fn light_as(behaviour: Behaviour, cancelled: &Arc<AtomicBool>) -> Box<BuildAdapter> {
    let cancelled = Arc::clone(cancelled);
    Box::new(move |profile, role, template, dir, speed, paths| {
        if role != "light" {
            return build_adapter(profile, role, template, dir, speed, paths);
        }
        Ok(BuiltAdapter {
            adapter: Box::new(TestAdapter {
                behaviour,
                cancelled: Arc::clone(&cancelled),
            }),
            simulator: None,
            note: "test adapter".into(),
            sources: vec![],
        })
    })
}

/// Ambit-shaped rows the test can predict: the device clock ticks 100 ms per row, S rises
/// 10 counts per row (100 counts per second) and R is zero on every third row.
struct LineAdapter {
    rows: i64,
}

impl Instrument for LineAdapter {
    fn describe(&self) -> InstrumentInfo {
        InstrumentInfo {
            adapter: "test".into(),
            model: "line".into(),
            input_kind: InputKind::Simulated,
            capabilities: ["acquire".to_string()].into(),
            columns: schemas::ambit_columns(),
            clocks: schemas::ambit_clocks(),
            aliases: Default::default(),
        }
    }

    fn check_ready(&self) -> Readiness {
        Readiness {
            ok: true,
            detail: "ok".into(),
        }
    }

    fn run(&mut self, sink: &mut dyn Sink, stop: &StopSignal) -> Result<(), InstrumentError> {
        for i in 0..self.rows {
            let mut row = vec![
                Cell::Int(i),
                Cell::TimeUtc(utc_now()),
                Cell::Int(i * 100),
                Cell::Int(10 * i),
                Cell::Int(i % 3),
            ];
            row.extend(std::iter::repeat_n(Cell::Int(0), 5));
            sink.rows(vec![row]);
        }
        while !stop.wait(Duration::from_millis(10)) {}
        Ok(())
    }

    fn cancel(&self) {}
}

fn light_as_line(rows: i64) -> Box<BuildAdapter> {
    Box::new(move |profile, role, template, dir, speed, paths| {
        if role != "light" {
            return build_adapter(profile, role, template, dir, speed, paths);
        }
        Ok(BuiltAdapter {
            adapter: Box::new(LineAdapter { rows }),
            simulator: None,
            note: "line adapter".into(),
            sources: vec![],
        })
    })
}

fn invalid(result: Result<(), RunError>) -> String {
    match result {
        Err(RunError::Invalid(message)) => message,
        other => panic!("expected an invalid request, got {other:?}"),
    }
}

#[test]
fn hardware_profile_runs_only_in_real_time() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({"ms": {"instrument": "ms2-ezview"}}));
    assert_eq!(
        invalid(check_request(&template, &profiles(), 20.0)),
        "Roles ms use hardware; hardware runs in real time (speed 1x)"
    );
    check_request(&template, &profiles(), 1.0).unwrap();
}

#[test]
fn speed_must_be_within_a_tenth_and_a_hundred() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    for speed in [0.09, 100.5, f64::NAN, 0.0] {
        assert_eq!(
            invalid(check_request(&template, &profiles(), speed)),
            "Replay speed must be between 0.1x and 100x",
            "{speed}"
        );
    }
    for speed in [0.1, 1.0, 50.0, 100.0] {
        check_request(&template, &profiles(), speed).unwrap();
    }
}

#[test]
fn a_profile_that_disappeared_is_not_found() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let mut profiles = profiles();
    profiles.remove("ms2-ezview-simulated");
    let error = check_request(&template, &profiles, 1.0).unwrap_err();
    assert_eq!(error.to_string(), "Not found: 'ms2-ezview-simulated'");
}

#[test]
fn simulated_spool_profile_builds_a_ready_spool_and_an_idle_simulator() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let capture_dir = data.path().join("captures/ms");
    let built = build_adapter(
        &profiles()["ms2-ezview-simulated"],
        "ms",
        &template,
        &capture_dir,
        50.0,
        &Paths::default(),
    )
    .unwrap();
    let info = built.adapter.describe();
    assert_eq!(info.input_kind, InputKind::Simulated);
    assert_eq!(info.aliases["m44"], "ch3");
    let readiness = built.adapter.check_ready();
    assert!(readiness.ok);
    assert_eq!(
        readiness.detail,
        "Spool file present: simulated-ezview-spool.txt"
    );
    assert_eq!(
        built.note,
        "Simulated input: spool written now by the simulator at 50x. A simulator writes an \
         EZView-style spool with this machine's clock. Values are the researcher's recorded Mass \
         44 and Mass 45 from the start of the 150-pl1 window (row 6762) to the end of the \
         acquisition, so the simulated instrument keeps running like the real one. Mass 32 \
         (-404.404) is left out because the spool decoder cannot produce negative values."
    );
    let names: Vec<_> = built
        .sources
        .iter()
        .map(|p| p.file_name().unwrap())
        .collect();
    assert_eq!(names, ["Raw data-mass spec.xlsx"]);
    let simulator = built.simulator.unwrap();
    assert!(
        !simulator.is_running(),
        "the simulator waits for the group start"
    );
    let spool = capture_dir.join("raw").join(SIMULATED_SPOOL);
    assert_eq!(std::fs::metadata(spool).unwrap().len(), 0);
}

#[test]
fn replay_profile_builds_a_replay_with_the_recording_as_source() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let built = build_adapter(
        &profiles()["ambit-replay-150-pl1"],
        "light",
        &template,
        &data.path().join("captures/light"),
        50.0,
        &Paths::default(),
    )
    .unwrap();
    assert!(built.simulator.is_none());
    assert_eq!(
        built.note,
        "Replay of a recording: Ambit raw data_sample_150_pl1.csv at 50x. Rows and device T are \
         recorded values; host times are this replay's."
    );
    assert_eq!(
        built.adapter.check_ready().detail,
        "Replaying Ambit raw data_sample_150_pl1.csv at 50x"
    );
    assert!(
        built.sources[0].ends_with("reference/instruments/ambit/Ambit raw data_sample_150_pl1.csv")
    );
}

#[test]
fn hardware_spool_without_a_path_is_not_ready() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({"ms": {"instrument": "ms2-ezview"}}));
    let built = build_adapter(
        &profiles()["ms2-ezview"],
        "ms",
        &template,
        &data.path().join("captures/ms"),
        1.0,
        &Paths::default(),
    )
    .unwrap();
    assert_eq!(built.note, "EZView spool file");
    assert!(built.sources.is_empty());
    assert_eq!(built.adapter.describe().input_kind, InputKind::Hardware);
    let readiness = built.adapter.check_ready();
    assert!(!readiness.ok);
    assert!(readiness.detail.contains("No spool file configured"));
}

#[test]
fn an_unknown_adapter_is_refused_with_the_python_message() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let profile = json!({"id": "x", "adapter": "serial_probe", "input_kind": "hardware"});
    let error = build_adapter(
        &profile,
        "ms",
        &template,
        data.path(),
        1.0,
        &Paths::default(),
    )
    .err()
    .unwrap();
    assert_eq!(
        error.to_string(),
        "ValueError: Unknown adapter serial_probe"
    );
}

#[test]
fn roles_start_after_their_delays_and_record_requested_and_actual_times() {
    let _alone = alone();
    let data = tempfile::tempdir().unwrap();
    let run = start(
        data.path(),
        template_with(data.path(), json!({"light": {"start_delay_s": 75}})),
        steady_clock(),
    );
    assert!(wait_until(20.0, || {
        let m = run.manifest();
        m.captures["light"].rows > 200 && m.captures["ms"].rows > 20
    }));
    let marker = run.mark("closed_system").unwrap();
    thread::sleep(Duration::from_millis(500));
    let manifest = stop(&run, false);

    let t0 = manifest.run.as_ref().unwrap().group_start_utc.unwrap();
    let light = &manifest.captures["light"];
    let requested = light.requested_start_utc.unwrap();
    let commanded = light.start_command_utc.unwrap();
    let first = light.first_sample_utc.unwrap();
    assert!((light.host_delay_s.unwrap() - 75.0 / SPEED).abs() < 1e-9);
    assert!((seconds(t0, requested) - 75.0 / SPEED).abs() < 1e-6);
    let gap = seconds(requested, commanded);
    assert!(
        (0.0..0.2).contains(&gap),
        "commanded {gap} s after requested"
    );
    assert!(first >= commanded);
    assert_eq!(manifest.status, SessionStatus::Completed);
    for capture in manifest.captures.values() {
        assert!(
            matches!(
                capture.status,
                CaptureStatus::Completed | CaptureStatus::SourceEnded
            ),
            "{}: {:?}",
            capture.role,
            capture.status
        );
    }

    let session = store(data.path()).path(&manifest.id);
    let light_dir = session.join("captures/light/samples");
    let ms_dir = session.join("captures/ms/samples");
    assert_eq!(column(&light_dir, "t_device_ms").len() as u64, light.rows);
    assert_eq!(column(&light_dir, "t_device_ms").iter().min(), Some(&9));
    let host = column(&ms_dir, "t_host_utc");
    let source: Vec<i64> = column(&ms_dir, "t_source_local")
        .into_iter()
        .map(|us| {
            let naive = DateTime::from_timestamp_micros(us).unwrap().naive_utc();
            Local
                .from_local_datetime(&naive)
                .unwrap()
                .timestamp_micros()
        })
        .collect();
    assert_eq!(host.len() as u64, manifest.captures["ms"].rows);
    let lags: Vec<f64> = host
        .iter()
        .zip(&source)
        .map(|(h, s)| (h - s) as f64 / 1e6)
        .collect();
    let (lo, hi) = (
        lags.iter().copied().fold(f64::MAX, f64::min),
        lags.iter().copied().fold(f64::MIN, f64::max),
    );
    assert!(
        0.0 <= lo && lo <= hi && hi < 1.0,
        "spool receipt lag {lo}..{hi}"
    );
    assert!(
        source.iter().all(|&s| s >= t0.timestamp_micros()),
        "the simulator wrote frames before the group start"
    );
    let spool = session.join("captures/ms/raw").join(SIMULATED_SPOOL);
    assert!(std::fs::metadata(spool).unwrap().len() > 0);

    let timing = light.timing.as_ref().unwrap();
    assert_eq!(timing["requested_samples"], 8010);
    assert_eq!(timing["recorded_samples"], light.rows);
    assert_eq!(manifest.captures["ms"].timing, None);

    assert_eq!(marker.kind, "closed_system");
    assert_eq!(marker.label, "Closed system (CO2 supply needle removed)");
    assert!((marker.x_run_s - seconds(t0, marker.t_host_utc)).abs() < 1e-9);
    assert_eq!(run.markers(), std::slice::from_ref(&marker));
    let markers = session.join("markers");
    assert_eq!(
        column(&markers, "t_host_utc"),
        [marker.t_host_utc.timestamp_micros()]
    );
    assert_eq!(strings(&markers, "kind"), ["closed_system"]);
    assert_eq!(strings(&markers, "clock"), ["t_host_utc"]);
    assert!(matches!(
        run.mark("closed_system"),
        Err(RunError::NotRunning)
    ));
}

#[test]
fn disabling_a_role_runs_the_remaining_roles_only() {
    let _shared = shared();
    let data = tempfile::tempdir().unwrap();
    let run = start(
        data.path(),
        template_with(data.path(), json!({"light": {"enabled": false}})),
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || run.manifest().captures["ms"].rows > 10));
    let manifest = stop(&run, false);
    let roles: Vec<&str> = manifest.captures.keys().map(String::as_str).collect();
    assert_eq!(roles, ["ms"]);
    let template = validate(manifest.template.clone(), &profiles()).unwrap();
    let charts: Vec<Value> = template.charts().iter().map(|c| c["id"].clone()).collect();
    assert_eq!(charts, ["co2", "mass44"]);
}

#[test]
fn not_ready_instrument_prevents_the_whole_group_from_starting() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({"ms": {"instrument": "ms2-ezview"}}));
    let run = launch(
        data.path(),
        template,
        &profiles(),
        &build_adapter,
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    let manifest = run.manifest();
    assert_eq!(manifest.status, SessionStatus::NotReady);
    let ms = manifest.captures["ms"].readiness.as_ref().unwrap();
    assert!(
        ms.detail.contains("No spool file configured"),
        "{}",
        ms.detail
    );
    assert_eq!(manifest.captures["light"].status, CaptureStatus::Ready);
    assert!(manifest.captures["light"].start_command_utc.is_none());
    assert!(!run.is_running());
    assert!(matches!(run.stop(false), Err(RunError::NotRunning)));
    assert_eq!(store(data.path()).load(run.id()).unwrap(), *manifest);
}

#[test]
fn a_group_that_is_not_ready_never_starts_its_spool_simulator() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let mut profiles = profiles();
    profiles.get_mut("ambit-replay-150-pl1").unwrap()["settings"]["recording"] =
        json!("${repo}/reference/instruments/ambit/missing.csv");
    let run = launch(
        data.path(),
        template,
        &profiles,
        &build_adapter,
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    let manifest = run.manifest();
    assert_eq!(manifest.status, SessionStatus::NotReady);
    let light = manifest.captures["light"].readiness.as_ref().unwrap();
    assert!(
        light.detail.starts_with("Recording not found"),
        "{}",
        light.detail
    );
    assert_eq!(manifest.captures["ms"].status, CaptureStatus::Ready);
    thread::sleep(Duration::from_millis(300));
    let spool = store(data.path())
        .capture_dir(run.id(), "ms")
        .join("raw")
        .join(SIMULATED_SPOOL);
    assert_eq!(std::fs::metadata(spool).unwrap().len(), 0);
}

#[test]
fn hardware_profile_reports_why_it_is_not_ready() {
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({"ms": {"instrument": "ms2-ezview"}}));
    let start = |speed| {
        GroupRun::start(
            store(data.path()),
            &Paths::default(),
            template.clone(),
            &profiles(),
            speed,
            None,
        )
    };
    assert!(start(20.0).err().unwrap().to_string().contains("real time"));
    let manifest = start(1.0).unwrap().manifest();
    assert_eq!(manifest.status, SessionStatus::NotReady);
    assert_eq!(
        manifest.name,
        "Leaf disc CO2 drawdown with PSII fluorescence"
    );
    let ms = manifest.captures["ms"].readiness.as_ref().unwrap();
    assert!(
        ms.detail.contains("No spool file configured"),
        "{}",
        ms.detail
    );
}

#[test]
fn cancel_asks_each_adapter_for_a_safe_state_and_ends_cancelled() {
    let _shared = shared();
    let data = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let template = template_with(data.path(), json!({"light": {"start_delay_s": 0}}));
    let build = light_as(Behaviour::UntilStopped, &cancelled);
    let run = launch(
        data.path(),
        template,
        &profiles(),
        &*build,
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || run.manifest().captures["ms"].rows > 5));
    let manifest = stop(&run, true);
    assert_eq!(manifest.status, SessionStatus::Cancelled);
    assert!(cancelled.load(Ordering::SeqCst));
    assert_eq!(manifest.captures["light"].status, CaptureStatus::Completed);
    assert!(matches!(run.stop(false), Err(RunError::NotRunning)));
}

#[test]
fn a_capture_still_running_after_the_join_timeout_is_recorded_as_interrupted() {
    let _alone = alone();
    let data = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let template = template_with(data.path(), json!({"light": {"start_delay_s": 0}}));
    let build = light_as(
        Behaviour::IgnoresStopFor(Duration::from_secs(5)),
        &cancelled,
    );
    let run = launch(
        data.path(),
        template,
        &profiles(),
        &*build,
        Duration::from_secs(1),
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || run.manifest().captures["ms"].rows > 5));
    let stopped = Instant::now();
    let manifest = stop(&run, false);
    assert!(
        stopped.elapsed() < Duration::from_secs(4),
        "the stop waited for the stuck capture"
    );
    let light = &manifest.captures["light"];
    assert_eq!(light.status, CaptureStatus::Interrupted);
    assert_eq!(
        light.error.as_deref(),
        Some("Capture had not ended 1 s after the stop request")
    );
    assert_eq!(manifest.captures["ms"].status, CaptureStatus::Completed);
    assert_eq!(manifest.status, SessionStatus::CompletedWithFailures);
    assert_eq!(store(data.path()).load(run.id()).unwrap(), *manifest);
}

#[test]
fn the_final_status_waits_for_a_slow_capture_to_end() {
    let _alone = alone();
    let data = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let template = template_with(data.path(), json!({"light": {"start_delay_s": 0}}));
    let build = light_as(
        Behaviour::IgnoresStopFor(Duration::from_millis(800)),
        &cancelled,
    );
    let run = launch(
        data.path(),
        template,
        &profiles(),
        &*build,
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || run.manifest().captures["ms"].rows > 5));
    let manifest = stop(&run, false);
    let light = &manifest.captures["light"];
    assert_eq!(light.status, CaptureStatus::Completed);
    assert_eq!(manifest.status, SessionStatus::Completed);
    let finished = manifest.run.as_ref().unwrap().stopped_utc.unwrap();
    assert!(light.stopped_utc.unwrap() <= finished);
}

#[test]
fn detected_flashes_are_stored_with_their_receipt_times() {
    let _shared = shared();
    let data = tempfile::tempdir().unwrap();
    let run = start(
        data.path(),
        template_with(data.path(), json!({"light": {"start_delay_s": 0}})),
        Arc::new(utc_now),
    );
    assert!(wait_until(30.0, || run.manifest().captures["light"].rows > 2300));
    let manifest = stop(&run, false);
    let t0 = manifest.run.as_ref().unwrap().group_start_utc.unwrap();
    let finished = manifest.run.as_ref().unwrap().stopped_utc.unwrap();
    let events = store(data.path())
        .capture_dir(run.id(), "light")
        .join("events");
    let kinds = strings(&events, "kind");
    let received = column(&events, "t_host_utc");
    let flashes: Vec<i64> = kinds
        .iter()
        .zip(&received)
        .filter(|(kind, _)| *kind == "sat_flash")
        .map(|(_, t)| *t)
        .collect();
    assert!(!flashes.is_empty(), "{kinds:?}");
    assert!(
        flashes
            .iter()
            .all(|&t| t0.timestamp_micros() < t && t < finished.timestamp_micros())
    );
}

fn failure_policy(policy: &str, ms_status: CaptureStatus) {
    let _alone = alone();
    let data = tempfile::tempdir().unwrap();
    let cancelled = Arc::new(AtomicBool::new(false));
    let template = template_with(
        data.path(),
        json!({"light": {"start_delay_s": 0, "on_failure": policy}}),
    );
    let build = light_as(Behaviour::Fails, &cancelled);
    let run = launch(
        data.path(),
        template,
        &profiles(),
        &*build,
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || run.manifest().captures["light"].status
        == CaptureStatus::Failed));
    thread::sleep(Duration::from_millis(500));
    let manifest = run.manifest();
    assert_eq!(
        manifest.captures["light"].error.as_deref(),
        Some("ConnectionError: device unplugged")
    );
    assert_eq!(manifest.captures["ms"].status, ms_status);
    let stopped_by =
        (policy == "stop_group").then_some("light failed and its policy is stop_group");
    assert_eq!(manifest.stopped_by.as_deref(), stopped_by);
    let manifest = stop(&run, false);
    assert_eq!(manifest.status, SessionStatus::CompletedWithFailures);
}

#[test]
fn failure_policy_continue_others_keeps_the_other_roles_running() {
    failure_policy("continue_others", CaptureStatus::Running);
}

#[test]
fn failure_policy_stop_group_stops_every_role() {
    failure_policy("stop_group", CaptureStatus::Completed);
}

#[test]
fn a_metric_streams_its_derived_value_live_even_when_no_chart_plots_it() {
    let _shared = shared();
    let data = tempfile::tempdir().unwrap();
    let mut doc = template_with(data.path(), json!({"light": {"start_delay_s": 0}}))
        .data()
        .clone();
    doc["charts"]
        .as_array_mut()
        .unwrap()
        .retain(|c| c["id"] != "fluorescence");
    doc["layout"] = json!({"views": [{"id": "run", "components": [
        {"id": "now", "kind": "metric", "value": "fluorescence"}]}]});
    let template = validate(doc, &profiles()).unwrap();
    let run = start(data.path(), template, Arc::new(utc_now));
    assert!(wait_until(20.0, || run.manifest().captures["light"].rows > 20));
    let live = run.live(&Cursors::new());
    let marker = run.mark("closed_system").unwrap();
    assert!(wait_until(
        20.0,
        || run.live(&Cursors::new()).captures["light"].next > live.captures["light"].next
    ));
    let cursors = Cursors::from([
        ("light".to_string(), live.captures["light"].next),
        ("ms".to_string(), live.captures["ms"].next),
    ]);
    let later = run.live(&cursors);
    let manifest = stop(&run, false);

    let light = &live.captures["light"];
    assert_eq!(live.status, SessionStatus::Running);
    assert_eq!(light.rows.len() as u64, light.next);
    assert!(light.rows.iter().any(|row| !row["fluorescence"].is_null()));
    let samples = store(data.path())
        .capture_dir(run.id(), "light")
        .join("samples");
    let (s, r) = (column(&samples, "S"), column(&samples, "R"));
    for (i, row) in light.rows.iter().enumerate() {
        let expected = (s[i] as f64 - 815.52) / r[i] as f64;
        assert_eq!(row["fluorescence"].as_f64(), Some(expected), "row {i}");
        assert!(row["x"].as_f64().unwrap() >= 0.0);
    }

    let newer = &later.captures["light"];
    assert_eq!(newer.rows.len() as u64, newer.next - light.next);
    assert_eq!(newer.rows_total, newer.next);
    assert_eq!(later.markers, [marker]);
    assert_eq!(later.manifest_captures["light"].role, "light");
    assert!(later.elapsed_s > 0.0);
    assert_eq!(
        manifest.captures["light"].rows,
        column(&samples, "S").len() as u64
    );
}

#[test]
fn live_cursors_skip_what_was_seen_and_rows_that_fell_off_the_buffer() {
    let buffer = LiveBuffer::default();
    let point = |i: usize| Map::from_iter([("x".to_string(), json!(i))]);
    for chunk in (0..LIVE_BUFFER_ROWS + 10).collect::<Vec<_>>().chunks(1000) {
        buffer.push_rows(chunk.iter().map(|&i| point(i)).collect());
    }
    for kind in ["light_on", "sat_flash", "light_off"] {
        buffer.push_event(LiveEvent {
            kind: kind.into(),
            label: kind.into(),
            x_run_s: None,
            value: None,
        });
    }
    let total = (LIVE_BUFFER_ROWS + 10) as u64;
    let all = buffer.view(0, 0, CaptureStatus::Running);
    assert_eq!(
        (all.next, all.rows_total, all.rows.len()),
        (total, total, LIVE_BUFFER_ROWS)
    );
    assert_eq!(all.rows[0]["x"], 10, "the 10 oldest rows fell off");
    let recent = buffer.view(total - 5, 2, CaptureStatus::Running);
    let xs: Vec<&Value> = recent.rows.iter().map(|r| &r["x"]).collect();
    assert_eq!(
        xs,
        [
            &json!(total - 5),
            &json!(total - 4),
            &json!(total - 3),
            &json!(total - 2),
            &json!(total - 1)
        ]
    );
    assert_eq!(
        (
            recent.events.len(),
            recent.events[0].kind.as_str(),
            recent.events_next
        ),
        (1, "light_off", 3)
    );
    let caught_up = buffer.view(total + 7, 9, CaptureStatus::Running);
    assert!(caught_up.rows.is_empty() && caught_up.events.is_empty());
}

/// In 20 runs at 50x, every capture gets its start command within 0.2 s of
/// its requested start. The run records both off the system clock, as in production; the clock
/// also notes the monotonic instant of each reading, so a wall clock step between the group
/// start and a start command shows up as the difference between the recorded gap and the
/// monotonic one. Run with
/// `cargo test --release --lib start_gap -- --ignored --nocapture`.
#[test]
#[ignore = "timing probe of 20 runs; run in release mode"]
fn start_gap_stays_under_a_fifth_of_a_second_over_twenty_runs_at_50x() {
    let _alone = alone();
    let data = tempfile::tempdir().unwrap();
    let template = template_with(data.path(), json!({}));
    let readings = Arc::new(Mutex::new(Vec::<(DateTime<Utc>, Instant)>::new()));
    let log = Arc::clone(&readings);
    let clock: HostClock = Arc::new(move || {
        let now = utc_now();
        log.lock().unwrap().push((now, Instant::now()));
        now
    });
    let instant_of = |t: DateTime<Utc>| {
        let readings = readings.lock().unwrap();
        readings.iter().find(|(wall, _)| *wall == t).unwrap().1
    };
    let mut recorded: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    let mut late: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for _ in 0..20 {
        let run = start(data.path(), template.clone(), Arc::clone(&clock));
        assert!(wait_until(20.0, || {
            let m = run.manifest();
            m.captures.values().all(|c| c.start_command_utc.is_some())
        }));
        let manifest = stop(&run, false);
        let t0 = manifest.run.as_ref().unwrap().group_start_utc.unwrap();
        for c in manifest.captures.values() {
            let commanded = c.start_command_utc.unwrap();
            let gap = seconds(c.requested_start_utc.unwrap(), commanded);
            let waited = instant_of(commanded) - instant_of(t0);
            let lateness = waited.as_secs_f64() - seconds(t0, c.requested_start_utc.unwrap());
            recorded.entry(c.role.clone()).or_default().push(gap);
            late.entry(c.role.clone()).or_default().push(lateness);
        }
    }
    let summary = |values: &[f64]| {
        let mut sorted = values.to_vec();
        sorted.sort_by(f64::total_cmp);
        let n = sorted.len();
        format!(
            "n {n}, min {:.6}, median {:.6}, max {:.6}",
            sorted[0],
            sorted[n / 2],
            sorted[n - 1]
        )
    };
    for role in recorded.keys() {
        println!("{role}: recorded gap s, {}", summary(&recorded[role]));
        println!("{role}: monotonic lateness s, {}", summary(&late[role]));
        let steps: Vec<f64> = recorded[role]
            .iter()
            .zip(&late[role])
            .map(|(gap, lateness)| gap - lateness)
            .filter(|step| step.abs() > 0.01)
            .collect();
        println!("{role}: wall clock steps inside the wait, s: {steps:?}");
        assert!(
            late[role].iter().all(|l| (0.0..0.2).contains(l)),
            "{role}: {:?}",
            late[role]
        );
    }
}

#[test]
fn review_computes_the_same_rate_and_ratio_as_the_live_points() {
    let _shared = shared();
    let data = tempfile::tempdir().unwrap();
    let mut doc = template_with(data.path(), json!({"light": {"start_delay_s": 0}}))
        .data()
        .clone();
    doc["derived"]["rate"] =
        json!({"role": "light", "slope": {"of": "S", "window_s": 1, "min_points": 5}});
    doc["derived"]["ratio"] = json!({"role": "light", "expr": "S / R"});
    doc["charts"].as_array_mut().unwrap().push(json!({
        "id": "line", "title": "Line", "unit": "",
        "series": [{"role": "light", "value": "rate"}, {"role": "light", "value": "ratio"}]
    }));
    let template = validate(doc, &profiles()).unwrap();
    let rows = 60;
    let run = launch(
        data.path(),
        template.clone(),
        &profiles(),
        &light_as_line(rows),
        JOIN_TIMEOUT,
        Arc::new(utc_now),
    );
    assert!(wait_until(20.0, || {
        run.live(&Cursors::new()).captures["light"].rows.len() as i64 == rows
    }));
    let live = run.live(&Cursors::new());
    let manifest = stop(&run, false);

    let session_dir = store(data.path()).path(run.id());
    let db = SessionDb::open(&session_dir, &manifest).unwrap();
    let clocks = &manifest.captures["light"].clocks;
    let program = Program::for_role(&template, "light", clocks).unwrap();
    let values: Vec<&str> = program.values().collect();
    let computed = db.evaluate(&program, &template.params(), "light").unwrap();
    assert_eq!(computed.len() as i64, rows);
    let points = &live.captures["light"].rows;
    assert_eq!(points.len(), computed.len());
    for (point, row) in points.iter().zip(&computed) {
        for (i, value) in values.iter().enumerate() {
            assert_eq!(
                point[*value].as_f64(),
                row.values[i],
                "{value} at seq {}",
                row.seq
            );
        }
    }

    let index = |name: &str| values.iter().position(|v| *v == name).unwrap();
    let rates: Vec<Option<f64>> = computed.iter().map(|r| r.values[index("rate")]).collect();
    assert!(
        rates[..10].iter().all(Option::is_none),
        "no rate before a full second: {rates:?}"
    );
    assert!(
        rates[10..]
            .iter()
            .all(|r| r.is_some_and(|r| (r - 100.0).abs() < 1e-9)),
        "{rates:?}"
    );
    let ratio = index("ratio");
    for row in &computed {
        assert_eq!(
            row.values[ratio].is_none(),
            row.seq % 3 == 0,
            "seq {}",
            row.seq
        );
    }
}
