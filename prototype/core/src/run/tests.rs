use std::fs::File;
use std::path::Path;
use std::thread;

use arrow::array::AsArray;
use arrow::datatypes::{DataType, Int64Type, TimestampMicrosecondType};
use chrono::{Local, TimeZone};
use parquet::arrow::ProjectionMask;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use serde_json::{Value, json};

use super::*;
use crate::contract::InputKind;
use crate::session::segments;
use crate::templates::{TemplateStore, load_profiles, validate};

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";
const SPEED: f64 = 50.0;

fn profiles() -> Profiles {
    load_profiles(&Paths::default().instruments).unwrap()
}

/// The built-in template with `changes` merged into its roles, as `template_with` does in
/// the Python tests.
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

fn store(data_dir: &Path) -> Arc<SessionStore> {
    Arc::new(SessionStore::new(data_dir).unwrap())
}

/// Starts a group without the request checks, as the Python tests construct `GroupRun`.
fn launch(
    data_dir: &Path,
    template: Template,
    profiles: &Profiles,
    build: &BuildAdapter,
) -> GroupRun {
    GroupRun::launch(Launch {
        store: store(data_dir),
        paths: &Paths::default(),
        template,
        profiles,
        speed: SPEED,
        name: "group test",
        build,
    })
    .unwrap()
}

fn start(data_dir: &Path, template: Template) -> GroupRun {
    let run = launch(data_dir, template, &profiles(), &build_adapter);
    let manifest = run.manifest();
    assert_eq!(
        manifest.status,
        SessionStatus::Running,
        "{:?}",
        manifest.captures
    );
    run
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

/// Stops the run and waits for its final status, which Python's blocking `stop` returns with.
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
    let data = tempfile::tempdir().unwrap();
    let run = start(
        data.path(),
        template_with(data.path(), json!({"light": {"start_delay_s": 75}})),
    );
    assert!(wait_until(20.0, || {
        let m = run.manifest();
        m.captures["light"].rows > 200 && m.captures["ms"].rows > 20
    }));
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
}

#[test]
fn disabling_a_role_runs_the_remaining_roles_only() {
    let data = tempfile::tempdir().unwrap();
    let run = start(
        data.path(),
        template_with(data.path(), json!({"light": {"enabled": false}})),
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
    let run = launch(data.path(), template, &profiles(), &build_adapter);
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
    let run = launch(data.path(), template, &profiles, &build_adapter);
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
