use std::path::Path;

use serde_json::{Value, json};

use super::*;
use crate::contract::InputKind;
use crate::templates::{Paths, TemplateStore, load_profiles, validate};

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";

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
