//! The command table the UI calls, exercised without a window.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use chrono::DateTime;
use cousinslab::api::{ApiError, Engine, ErrorKind};
use cousinslab::templates::Paths;
use serde_json::{Value, json};

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";
const SPEED: f64 = 50.0;

/// Runs at 50x share the CPU with every other test; one at a time keeps their timing honest.
static RUNS: Mutex<()> = Mutex::new(());

fn engine() -> (Engine, tempfile::TempDir) {
    let data = tempfile::tempdir().unwrap();
    (Engine::open(Paths::default(), data.path()).unwrap(), data)
}

fn call(engine: &Engine, command: &str, args: Value) -> Value {
    engine
        .call(command, args)
        .unwrap_or_else(|e| panic!("{command} failed: {e:?}"))
}

fn refused(engine: &Engine, command: &str, args: Value) -> ApiError {
    match engine.call(command, args) {
        Ok(value) => panic!("{command} should fail, returned {value}"),
        Err(e) => e,
    }
}

fn template(engine: &Engine) -> Value {
    call(engine, "get_template", json!({"template_id": TEMPLATE}))["data"].clone()
}

fn save(engine: &Engine, data: Value) -> Value {
    call(
        engine,
        "save_template",
        json!({"template_id": TEMPLATE, "data": data}),
    )
}

fn wait_until(timeout_s: u64, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(timeout_s);
    while !ready() {
        assert!(Instant::now() < deadline, "timed out after {timeout_s} s");
        thread::sleep(Duration::from_millis(50));
    }
}

fn session(engine: &Engine, id: &str) -> Value {
    call(engine, "get_session", json!({"session_id": id}))
}

fn rows(engine: &Engine, id: &str, role: &str) -> u64 {
    session(engine, id)["manifest"]["captures"][role]["rows"]
        .as_u64()
        .unwrap_or(0)
}

/// Starts the built-in template at 50x with the light role starting after `light_delay_s`.
fn start_run(engine: &Engine, light_delay_s: u64) -> String {
    let mut data = template(engine);
    data["roles"]["light"]["start_delay_s"] = json!(light_delay_s);
    let revision = save(engine, data)["data"]["revision"].clone();
    let manifest = call(
        engine,
        "start_run",
        json!({"template_id": TEMPLATE, "revision": revision, "speed": SPEED}),
    );
    assert_eq!(manifest["status"], "running", "{manifest}");
    manifest["id"].as_str().unwrap().to_string()
}

fn stop(engine: &Engine, id: &str) {
    assert_eq!(
        call(engine, "stop_session", json!({"session_id": id})),
        json!({"status": "stopping"})
    );
    wait_until(30, || !session(engine, id)["live"].as_bool().unwrap());
}

fn epoch_s(iso: &Value) -> f64 {
    let t = DateTime::parse_from_rfc3339(iso.as_str().unwrap()).unwrap();
    t.timestamp_micros() as f64 / 1e6
}

fn parquet_bytes(dir: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut out = BTreeMap::new();
    for entry in walk(dir) {
        if entry.extension().is_some_and(|e| e == "parquet") {
            out.insert(entry.clone(), std::fs::read(&entry).unwrap());
        }
    }
    out
}

fn walk(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(walk(&path));
        } else {
            out.push(path);
        }
    }
    out
}

#[test]
fn template_edit_becomes_a_new_revision_and_the_old_one_is_unchanged() {
    let (engine, _data) = engine();
    let mut data = template(&engine);
    data["roles"]["light"]["start_delay_s"] = json!(120);
    let saved = save(&engine, data);
    assert_eq!(
        (
            saved["data"]["revision"].clone(),
            saved["revisions"].clone()
        ),
        (json!(2), json!([1, 2]))
    );
    let r1 = call(
        &engine,
        "get_template",
        json!({"template_id": TEMPLATE, "revision": 1}),
    );
    assert_eq!(r1["data"]["roles"]["light"]["start_delay_s"], 30);
}

#[test]
fn invalid_template_edit_is_rejected_with_the_reason() {
    let (engine, _data) = engine();
    let mut data = template(&engine);
    data["derived"]["ubar_co2"]["expr"] = json!("(m44 - not_a_parameter) * ubar_per_mv");
    let error = refused(
        &engine,
        "save_template",
        json!({"template_id": TEMPLATE, "data": data}),
    );
    assert_eq!(error.kind, ErrorKind::Invalid);
    assert!(
        error.message.contains("not_a_parameter"),
        "{}",
        error.message
    );
}

#[test]
fn hardware_profile_runs_only_in_real_time_and_reports_why_it_is_not_ready() {
    let (engine, _data) = engine();
    let mut data = template(&engine);
    data["roles"]["ms"]["instrument"] = json!("ms2-ezview");
    let revision = save(&engine, data)["data"]["revision"].clone();
    let fast = json!({"template_id": TEMPLATE, "revision": revision, "speed": 20});
    let error = refused(&engine, "start_run", fast);
    assert_eq!(error.kind, ErrorKind::Invalid);
    assert!(error.message.contains("real time"), "{}", error.message);

    let manifest = call(
        &engine,
        "start_run",
        json!({"template_id": TEMPLATE, "revision": revision, "speed": 1}),
    );
    assert_eq!(manifest["status"], "not_ready");
    let detail = manifest["captures"]["ms"]["readiness"]["detail"]
        .as_str()
        .unwrap();
    assert!(detail.contains("No spool file configured"), "{detail}");
}

#[test]
fn template_view_carries_the_layout_and_what_an_excluded_role_hides() {
    let (engine, _data) = engine();
    let view = call(&engine, "get_template", json!({"template_id": TEMPLATE}));
    let components: BTreeMap<String, Value> = view["layout"]["views"][0]["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| (c["id"].as_str().unwrap().to_string(), c.clone()))
        .collect();
    assert_eq!(
        (
            components["co2-chart"]["x"].clone(),
            components["fluorescence-chart"]["x"].clone()
        ),
        (json!(0), json!(4))
    );
    assert_eq!(components["co2-now"]["value"], "ubar_co2");
    assert_eq!(components["fluorescence-now"]["value"], "fluorescence");
    let bottom = components
        .values()
        .filter(|c| c["id"] != "captures")
        .map(|c| c["y"].as_i64().unwrap() + c["h"].as_i64().unwrap())
        .max()
        .unwrap();
    assert_eq!(components["captures"]["y"], bottom);
    assert_eq!(view["hidden_components"], json!({}));

    let mut data = view["data"].clone();
    data["roles"]["light"]["enabled"] = json!(false);
    let r2 = save(&engine, data);
    assert_eq!(
        r2["hidden_components"],
        json!({"fluorescence-chart": "Every role in chart fluorescence is excluded",
               "fluorescence-now": "Role light is excluded"})
    );
    assert_eq!(
        r2["layout"], view["layout"],
        "hiding is resolved per revision; the stored layout is untouched"
    );
    assert_eq!(r2["enabled_roles"], json!(["ms"]));
}

#[test]
fn layout_edit_becomes_a_new_revision_and_the_old_layout_is_unchanged() {
    let (engine, _data) = engine();
    let mut data = template(&engine);
    let views = data["layout"]["views"].as_array_mut().unwrap();
    views.reverse();
    views[1]["components"][0]["x"] = json!(4);
    views[1]["components"][1]["x"] = json!(0);
    let r2 = save(&engine, data);
    let ids = |view: &Value| -> Vec<Value> {
        view["layout"]["views"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v["id"].clone())
            .collect()
    };
    assert_eq!(ids(&r2), [json!("signals"), json!("acquisition")]);
    assert_eq!(r2["layout"]["views"][1]["components"][0]["x"], 4);
    assert_eq!(r2["layout"]["views"][1]["components"][1]["x"], 0);
    let r1 = call(
        &engine,
        "get_template",
        json!({"template_id": TEMPLATE, "revision": 1}),
    );
    assert_eq!(ids(&r1), [json!("acquisition"), json!("signals")]);
    assert_eq!(r1["layout"]["views"][0]["components"][0]["x"], 0);
}

#[test]
fn overlapping_layout_edit_is_rejected_with_the_reason() {
    let (engine, _data) = engine();
    let mut data = template(&engine);
    data["layout"]["views"][0]["components"][1]["x"] = json!(2);
    let error = refused(
        &engine,
        "save_template",
        json!({"template_id": TEMPLATE, "data": data}),
    );
    assert_eq!(error.kind, ErrorKind::Invalid);
    assert!(
        error
            .message
            .contains("'co2-chart' and 'fluorescence-chart' overlap"),
        "{}",
        error.message
    );
}

#[test]
fn failures_come_back_with_a_kind_the_ui_can_tell_apart() {
    let (engine, _data) = engine();
    let cases = [
        ("get_template", json!({}), ErrorKind::Invalid, "template_id"),
        (
            "get_template",
            json!({"template_id": "nope"}),
            ErrorKind::NotFound,
            "No template nope",
        ),
        (
            "save_template",
            json!({"template_id": TEMPLATE, "yaml": "id: [unclosed"}),
            ErrorKind::Invalid,
            "",
        ),
        (
            "get_session",
            json!({"session_id": "nope"}),
            ErrorKind::NotFound,
            "No session nope",
        ),
        (
            "get_session",
            json!({"session_id": "../templates"}),
            ErrorKind::NotFound,
            "No session",
        ),
        (
            "session_live",
            json!({"session_id": "nope"}),
            ErrorKind::Conflict,
            "not running",
        ),
        (
            "stop_session",
            json!({"session_id": "nope"}),
            ErrorKind::Conflict,
            "This session is not running",
        ),
        (
            "launch_rocket",
            json!({}),
            ErrorKind::NotFound,
            "No command launch_rocket",
        ),
    ];
    for (command, args, kind, text) in cases {
        let error = refused(&engine, command, args);
        assert_eq!(error.kind, kind, "{command}: {}", error.message);
        assert!(error.message.contains(text), "{command}: {}", error.message);
    }
}

#[test]
fn imported_session_answers_every_review_command() {
    let (engine, _data) = engine();
    let recordings = call(&engine, "list_recordings", json!({}));
    let workbook = recordings["ms_workbook"][0].as_str().unwrap();
    let pl1 = recordings["ambit_csv"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p.as_str().unwrap().contains("pl1"))
        .unwrap();
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": TEMPLATE, "files": [
            {"role": "ms", "path": workbook, "label": "workbook"},
            {"role": "light", "path": pl1, "label": "150-pl1"},
        ]}),
    );
    assert_eq!(manifest["status"], "imported");
    let id = manifest["id"].as_str().unwrap();
    let listed = call(&engine, "list_sessions", json!({}));
    assert_eq!(listed[0]["inputs"], json!(["import"]));
    assert_eq!(listed[0]["live"], false);

    let clock = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "clock"}),
    );
    assert_eq!(
        clock["alignment"]["trials"][0]["members"],
        json!([]),
        "imports record no clock time"
    );
    let reasons: Vec<&str> = clock["alignment"]["unaligned"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["reason"].as_str().unwrap())
        .collect();
    assert_eq!(reasons.len(), 2);
    assert!(
        reasons
            .iter()
            .all(|r| r.starts_with("Records no clock time")),
        "{reasons:?}"
    );

    let saved = call(
        &engine,
        "save_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    let aid = saved["id"].as_str().unwrap();
    let charts = call(
        &engine,
        "alignment_charts",
        json!({"session_id": id, "alignment_id": aid}),
    );
    assert!(
        !charts["charts"][0]["series"][0]["points"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let export = call(
        &engine,
        "export_alignment",
        json!({"session_id": id, "alignment_id": aid}),
    );
    assert!(Path::new(export["csv"].as_str().unwrap()).is_file());
    assert!(engine.owns_path(Path::new(export["csv"].as_str().unwrap())));
    let query = call(
        &engine,
        "query_session",
        json!({"session_id": id, "alignment_id": aid, "sql": "SELECT count(*) AS n FROM aligned"}),
    );
    assert!(query["rows"][0]["n"].as_i64().unwrap() > 0, "{query}");
    let missing = refused(
        &engine,
        "alignment_charts",
        json!({"session_id": id, "alignment_id": "aln-nope"}),
    );
    assert_eq!(missing.kind, ErrorKind::NotFound);
    assert!(!engine.owns_path(Path::new("/etc/passwd")));
    let sideways = refused(
        &engine,
        "get_session",
        json!({"session_id": format!("{id}/../{id}")}),
    );
    assert_eq!(
        sideways.kind,
        ErrorKind::NotFound,
        "ids cannot walk the data folder"
    );
}

#[test]
fn a_finished_run_serves_its_events_and_replay_values_without_changing_stored_files() {
    let _one_run = RUNS.lock().unwrap_or_else(|e| e.into_inner());
    let (engine, _data) = engine();
    let id = start_run(&engine, 30);
    wait_until(20, || rows(&engine, &id, "light") >= 200);
    call(
        &engine,
        "mark_session",
        json!({"session_id": id, "event": "closed_system"}),
    );
    stop(&engine, &id);
    let refusal = refused(
        &engine,
        "mark_session",
        json!({"session_id": id, "event": "closed_system"}),
    );
    assert_eq!(refusal.kind, ErrorKind::Conflict);
    let session_dir = engine.data_dir().join("sessions").join(&id);
    let before = parquet_bytes(&session_dir);

    let events = call(&engine, "session_events", json!({"session_id": id}));
    let operator: Vec<&Value> = events
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["source"] == "operator")
        .collect();
    assert_eq!(
        operator
            .iter()
            .map(|e| e["kind"].clone())
            .collect::<Vec<_>>(),
        [json!("closed_system")]
    );
    for reference in ["event", "elapsed", "clock"] {
        let view = call(
            &engine,
            "preview_alignment",
            json!({"session_id": id, "reference": reference}),
        );
        assert_eq!(view["alignment"]["id"], "preview");
        for value in ["ubar_co2", "fluorescence"] {
            assert!(
                !view["values"][value][0]["points"]
                    .as_array()
                    .unwrap()
                    .is_empty(),
                "{reference} {value}"
            );
        }
    }
    assert_eq!(parquet_bytes(&session_dir), before);
}

#[test]
fn live_session_aligns_on_the_host_clock_and_on_the_operator_marker() {
    let _one_run = RUNS.lock().unwrap_or_else(|e| e.into_inner());
    let (engine, _data) = engine();
    let id = start_run(&engine, 25);
    wait_until(20, || rows(&engine, &id, "light") > 100);
    let marker = call(
        &engine,
        "mark_session",
        json!({"session_id": id, "event": "closed_system"}),
    );
    thread::sleep(Duration::from_millis(300));
    stop(&engine, &id);

    let clock = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "clock"}),
    )["alignment"]
        .clone();
    assert_eq!(clock["unaligned"], json!([]));
    let members = clock["trials"][0]["members"].as_array().unwrap();
    assert!(members.iter().all(|m| m["clock"]["kind"] == "host_utc"));
    assert!(
        members.iter().all(|m| m["zero"] == members[0]["zero"]),
        "one shared clock origin"
    );
    let ms = members.iter().find(|m| m["capture"] == "ms").unwrap();
    assert!(
        ms["uncertainty_s"].as_f64().unwrap() >= 0.05,
        "receipt time is no finer than the spool poll"
    );

    let event = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "event"}),
    )["alignment"]
        .clone();
    let marker_epoch = epoch_s(&marker["t_host_utc"]);
    let members: Vec<&Value> = event["trials"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["members"].as_array().unwrap())
        .collect();
    assert_eq!(members.len(), 2);
    for m in members {
        assert!(
            (m["zero"].as_f64().unwrap() - marker_epoch).abs() < 1e-6,
            "{m}"
        );
        assert!(
            m["method"].as_str().unwrap().contains("Operator marker"),
            "{m}"
        );
    }
}

#[test]
fn detected_flash_is_transferred_to_the_mass_spec_over_the_host_clock() {
    let _one_run = RUNS.lock().unwrap_or_else(|e| e.into_inner());
    let (engine, _data) = engine();
    let id = start_run(&engine, 0);
    wait_until(30, || rows(&engine, &id, "light") > 3300);
    stop(&engine, &id);
    let event = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "event"}),
    )["alignment"]
        .clone();
    assert_eq!(event["unaligned"], json!([]));
    let members: BTreeMap<String, Value> = event["trials"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["members"].as_array().unwrap())
        .map(|m| (m["capture"].as_str().unwrap().to_string(), m.clone()))
        .collect();
    assert_eq!(members["ms"]["zero"], members["light"]["zero"]);
    assert!(
        members["ms"]["method"]
            .as_str()
            .unwrap()
            .starts_with("Transferred over the host clock")
    );
    assert_eq!(
        members["light"]["method"],
        "Detected Saturation flash 4 (receipt time)"
    );
}

#[test]
fn session_events_place_flashes_and_operator_markers_on_the_run_clock() {
    let _one_run = RUNS.lock().unwrap_or_else(|e| e.into_inner());
    let (engine, _data) = engine();
    let id = start_run(&engine, 0);
    wait_until(30, || rows(&engine, &id, "light") > 2300);
    let marker = call(
        &engine,
        "mark_session",
        json!({"session_id": id, "event": "closed_system"}),
    );
    stop(&engine, &id);
    let events = call(&engine, "session_events", json!({"session_id": id}));
    let events = events.as_array().unwrap();
    let marker_x = marker["x_run_s"].as_f64().unwrap();
    let operator: Vec<&Value> = events
        .iter()
        .filter(|e| e["source"] == "operator")
        .collect();
    assert_eq!(operator.len(), 1);
    assert_eq!(operator[0]["kind"], "closed_system");
    assert!((operator[0]["x_run_s"].as_f64().unwrap() - marker_x).abs() < 1e-3);
    let flashes: Vec<&Value> = events.iter().filter(|e| e["kind"] == "sat_flash").collect();
    assert!(!flashes.is_empty());
    for flash in flashes {
        let x = flash["x_run_s"].as_f64().unwrap();
        assert!(
            flash["source"] == "light" && 0.0 < x && x < marker_x,
            "{flash}"
        );
    }
    let xs: Vec<f64> = events
        .iter()
        .map(|e| e["x_run_s"].as_f64().unwrap())
        .collect();
    assert!(
        xs.windows(2).all(|w| w[0] <= w[1]),
        "events are in run-clock order"
    );
}
