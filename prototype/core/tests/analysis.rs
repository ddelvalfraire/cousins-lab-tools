//! The analysis commands over an imported legacy frame zip: records, folds and refusals.

use std::path::PathBuf;

use cousinslab::alignment::TemplateRef;
use cousinslab::analysis::{Action, Range, ReadingSpec, Stat, append, read_range};
use cousinslab::api::{ApiError, Engine, ErrorKind};
use cousinslab::calc::Program;
use cousinslab::query::SessionDb;
use cousinslab::session::{Manifest, utc_now};
use cousinslab::templates::Paths;
use cousinslab::templates::from_snapshot;
use indexmap::IndexMap;
use serde_json::{Value, json};

const TEMPLATE: &str = "analysis-test";

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
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

fn template() -> Value {
    json!({
        "id": TEMPLATE,
        "revision": 1,
        "name": "Analysis test",
        "roles": {"ms": {"instrument": "ms-legacy-frames-replay", "import": "legacy_frames"}},
        "parameters": {
            "ubar_per_pct": {"value": 9200, "unit": "µbar/%", "label": "µbar per %CO2"},
            "temp_c": {"entry": true, "unit": "°C", "label": "Temperature"},
            "o2_scale": {"expr": "temp_c * 2", "entry": true, "unit": "x", "label": "O2 scale"},
            "zero_p": {"unit": "mV", "label": "Zero"},
            "offset_p": {"expr": "zero_p * 2", "unit": "mV"},
            "gain_p": {"unit": "µl/mV"},
            "base_p": {"unit": "µl"},
        },
        "calibrations": {
            "zero": {"label": "Zero", "role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}},
            "line": {"role": "ms", "line": {
                "reading": {"stat": "mean", "of": "m44"},
                "points": {"p0": {"label": "0 µl", "known": 0}, "p1": {"label": "1 µl", "known": 1}},
                "sets": {"slope": "gain_p", "intercept": "base_p"},
            }},
        },
        "derived": {
            "scaled": {"role": "ms", "expr": "m44 * ubar_per_pct"},
            "rate": {"role": "ms", "slope": {"of": "m44", "window_s": 0.3, "min_points": 3}},
        },
        "charts": [{"id": "raw", "title": "Raw", "unit": "mV", "x": "source",
                    "series": [{"role": "ms", "value": "m44"}]}],
    })
}

/// An engine with `data` saved as the template and the fixture zip imported under it.
fn imported(data: Value) -> (Engine, tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), dir.path()).unwrap();
    call(
        &engine,
        "save_template",
        json!({"template_id": TEMPLATE, "data": data}),
    );
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": TEMPLATE,
               "files": [{"role": "ms", "path": fixture("legacy-frames.zip")}]}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    (engine, dir, id)
}

fn record(engine: &Engine, id: &str, request: Value) -> Value {
    let mut args = request;
    args["session_id"] = json!(id);
    call(engine, "record_analysis", args)
}

fn record_files(dir: &tempfile::TempDir, id: &str) -> usize {
    let analysis = dir.path().join("sessions").join(id).join("analysis");
    std::fs::read_dir(analysis).map_or(0, |entries| entries.count())
}

#[test]
fn the_view_lists_every_parameter_with_its_value_and_where_it_came_from() {
    let (engine, dir, id) = imported(template());
    let view = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(view["rev"], 0);
    let names: Vec<&String> = view["parameters"].as_object().unwrap().keys().collect();
    assert_eq!(
        names,
        [
            "ubar_per_pct",
            "temp_c",
            "o2_scale",
            "zero_p",
            "offset_p",
            "gain_p",
            "base_p"
        ]
    );
    assert_eq!(
        view["parameters"]["temp_c"],
        json!({"value": null, "unit": "°C", "label": "Temperature", "note": "", "entry": true,
               "source": "unset", "why": "Enter a value"})
    );
    assert_eq!(view["parameters"]["o2_scale"]["why"], "needs temp_c");
    assert_eq!(view["parameters"]["ubar_per_pct"]["value"], 9200.0);
    assert_eq!(view["parameters"]["ubar_per_pct"]["source"], "default");

    let session_dir = dir.path().join("sessions").join(&id);
    let template = TemplateRef {
        id: TEMPLATE.into(),
        revision: 1,
    };
    let entry = Action::Entry {
        parameter: "temp_c".into(),
        value: Some(25.0),
    };
    append(&session_dir, template, None, entry, utc_now()).unwrap();
    let view = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(view["rev"], 1);
    assert_eq!(
        view["parameters"]["temp_c"],
        json!({"value": 25.0, "unit": "°C", "label": "Temperature", "note": "", "entry": true,
               "source": "entered", "record": "rec-000001"})
    );
    assert_eq!(view["parameters"]["o2_scale"]["value"], 50.0);
    assert_eq!(view["parameters"]["o2_scale"]["source"], "computed");
    let missing = engine
        .call("analysis", json!({"session_id": "nope"}))
        .unwrap_err();
    assert_eq!(missing.message, "No session nope");
}

#[test]
fn an_entry_sets_a_parameter_and_a_retried_request_saves_nothing() {
    let (engine, dir, id) = imported(template());
    let entry = json!({"request_id": "r1", "action": "entry", "parameter": "temp_c", "value": 25});
    let saved = record(&engine, &id, entry.clone());
    assert_eq!(saved["record"], "rec-000001");
    assert_eq!(saved["rev"], 1);
    assert_eq!(saved["parameters"]["temp_c"]["value"], 25.0);
    assert_eq!(saved["parameters"]["temp_c"]["source"], "entered");
    assert_eq!(saved["parameters"]["temp_c"]["record"], "rec-000001");
    assert_eq!(saved["parameters"]["o2_scale"]["value"], 50.0);
    assert_eq!(saved["parameters"]["o2_scale"]["source"], "computed");

    let mut retry = entry;
    retry["value"] = json!(30);
    assert_eq!(record(&engine, &id, retry), saved);
    assert_eq!(record_files(&dir, &id), 1);
    assert_eq!(call(&engine, "analysis", json!({"session_id": id})), {
        let mut view = saved.clone();
        view.as_object_mut().unwrap().remove("record");
        view
    });

    let typed = record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "o2_scale", "value": 7}),
    );
    assert_eq!(typed["parameters"]["o2_scale"]["value"], 7.0);
    assert_eq!(typed["parameters"]["o2_scale"]["source"], "entered");

    let retracted = record(
        &engine,
        &id,
        json!({"action": "retract", "records": ["rec-000001", "rec-000002"]}),
    );
    assert_eq!(retracted["record"], "rec-000003");
    assert_eq!(retracted["rev"], 3);
    assert_eq!(retracted["parameters"]["temp_c"]["source"], "unset");
    assert_eq!(retracted["parameters"]["o2_scale"]["why"], "needs temp_c");
    assert_eq!(record_files(&dir, &id), 3);
}

#[test]
fn requests_that_name_nothing_the_session_has_are_refused() {
    let (engine, _dir, id) = imported(template());
    let refuse = |request: Value| {
        let mut args = request;
        args["session_id"] = json!(id);
        let e = refused(&engine, "record_analysis", args);
        (e.kind, e.message)
    };
    let invalid = |message: &str| (ErrorKind::Invalid, message.to_string());
    assert_eq!(
        refuse(json!({"action": "entry", "parameter": "nope", "value": 1})),
        invalid("No parameter nope")
    );
    assert_eq!(
        refuse(json!({"action": "entry", "parameter": "ubar_per_pct", "value": 1})),
        invalid("Parameter ubar_per_pct cannot be typed in; only parameters with entry: true can")
    );
    assert_eq!(
        refuse(json!({"action": "retract", "records": []})),
        invalid("Name at least one record to retract")
    );
    for missing in ["rec-000009", "../session"] {
        assert_eq!(
            refuse(json!({"action": "retract", "records": [missing]})),
            (ErrorKind::NotFound, format!("No record {missing}"))
        );
    }
    record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "temp_c", "value": 1}),
    );
    record(
        &engine,
        &id,
        json!({"action": "retract", "records": ["rec-000001"]}),
    );
    assert_eq!(
        refuse(json!({"action": "retract", "records": ["rec-000002"]})),
        invalid("rec-000002 is a retraction and cannot be retracted")
    );
    let (kind, message) = refuse(json!({"action": "edit"}));
    assert_eq!(kind, ErrorKind::Invalid);
    assert!(
        message.starts_with("Bad arguments: unknown variant `edit`"),
        "{message}"
    );
    let e = refused(&engine, "analysis", json!({"session_id": "nope"}));
    assert_eq!(
        (e.kind, e.message.as_str()),
        (ErrorKind::NotFound, "No session nope")
    );
}

/// The fixture's m44 falls 20.25 mV every 105 ms, in rows at 0.105 to 0.84 s, 1.995 to
/// 2.415 s and 2.94 to 3.15 s.
#[test]
fn a_range_reads_every_stored_row_inside_it() {
    let (engine, dir, id) = imported(template());
    let session = call(&engine, "get_session", json!({"session_id": id}));
    let manifest: Manifest = serde_json::from_value(session["manifest"].clone()).unwrap();
    let cid = "ms-legacy-frames";
    let capture = &manifest.captures[cid];
    let template = from_snapshot(manifest.template.clone()).unwrap();
    let program = Program::for_role(&template, "ms", &capture.clocks).unwrap();
    let db = SessionDb::open(&dir.path().join("sessions").join(&id), &manifest).unwrap();
    let spec = |stat, of: &str| ReadingSpec {
        stat,
        of: of.into(),
    };
    let readings = IndexMap::from([
        ("mean".to_string(), spec(Stat::Mean, "m44")),
        ("slope".to_string(), spec(Stat::Slope, "m44")),
        ("scaled".to_string(), spec(Stat::Mean, "scaled")),
        ("rate".to_string(), spec(Stat::Mean, "rate")),
    ]);
    let read = |from, to, params: &cousinslab::expr::Params, complete| {
        let range = Range::new(from, to).unwrap();
        read_range(&db, &program, params, cid, range, &readings, complete)
    };
    let params = template.params();
    let values = read(0.2, 0.45, &params, true).unwrap();
    let mean = (211.692 + 191.442 + 171.192) / 3.0;
    assert_eq!(values["mean"].value, Some(mean));
    assert_eq!(values["mean"].n, 3);
    assert_eq!(
        (values["mean"].t_first_s, values["mean"].t_last_s),
        (0.21, 0.42)
    );
    let slope = values["slope"].value.unwrap();
    assert!((slope - -20.25 / 0.105).abs() < 1e-9, "{slope}");
    assert!((values["scaled"].value.unwrap() - mean * 9200.0).abs() < 1e-6);
    assert_eq!(values["rate"].n, 1, "only 0.42 s has a full 0.3 s window");

    let after_gap = read(2.2, 2.5, &params, true).unwrap();
    assert_eq!(
        after_gap["rate"].n, 3,
        "the window reaches back before the range"
    );
    assert!((after_gap["rate"].value.unwrap() - -20.25 / 0.105).abs() < 1e-9);
    let without = read(0.2, 0.45, &cousinslab::expr::Params::new(), true).unwrap();
    assert_eq!((without["scaled"].value, without["scaled"].n), (None, 0));
    assert_eq!(without["mean"].value, Some(mean));

    let message = |r: Result<_, cousinslab::query::AnalysisError>| r.unwrap_err().to_string();
    assert_eq!(
        message(read(1.0, 1.9, &params, true)),
        "No stored rows between 1 and 1.9 s"
    );
    assert_eq!(
        message(read(3.0, 4.0, &params, false)),
        "Rows after 3.15 s are not stored yet; try again in a moment"
    );
    assert_eq!(read(3.0, 4.0, &params, true).unwrap()["mean"].n, 2);
}

const CAPTURE: &str = "ms-legacy-frames";

fn reading(step: &str, range: [f64; 2]) -> Value {
    json!({"action": "reading", "step": step, "capture": CAPTURE, "range_s": range})
}

#[test]
fn a_reading_is_saved_with_its_values_and_a_set_calibration_fills_its_parameter() {
    let (engine, dir, id) = imported(template());
    let fresh = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(
        fresh["steps"]["zero"],
        json!({"label": "Zero", "owner": "zero", "role": "ms", "kind": "set", "known": null,
               "reading": null})
    );
    let first = (211.692 + 191.442 + 171.192) / 3.0;
    let saved = record(&engine, &id, reading("zero", [0.2, 0.45]));
    let step = &saved["steps"]["zero"]["reading"];
    assert_eq!(step["record"], "rec-000001");
    assert_eq!(
        (step["capture"].clone(), step["range_s"].clone()),
        (json!(CAPTURE), json!([0.2, 0.45]))
    );
    assert_eq!(
        step["values"]["zero_p"],
        json!({"stat": "mean", "of": "m44", "value": first, "n": 3, "t_first_s": 0.21, "t_last_s": 0.42})
    );
    assert_eq!(saved["parameters"]["zero_p"]["value"], first);
    assert_eq!(saved["parameters"]["zero_p"]["source"], "fitted");
    assert_eq!(saved["parameters"]["zero_p"]["calibration"], "zero");
    assert_eq!(saved["parameters"]["offset_p"]["value"], first * 2.0);
    let file = dir
        .path()
        .join("sessions")
        .join(&id)
        .join("analysis/rec-000001.json");
    let stored: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    assert_eq!(stored["clock"], "t_ms");
    assert_eq!(stored["params"]["ubar_per_pct"], 9200.0);
    assert_eq!(stored["values"], step["values"]);

    let redone = record(&engine, &id, reading("zero", [2.9, 3.2]));
    let second = (-314.808 + -335.058 + -355.308) / 3.0;
    assert_eq!(redone["parameters"]["zero_p"]["value"], second);
    let retracted = record(
        &engine,
        &id,
        json!({"action": "retract", "records": ["rec-000002"]}),
    );
    assert_eq!(
        retracted["steps"]["zero"]["reading"]["record"],
        "rec-000001"
    );
    assert_eq!(retracted["parameters"]["zero_p"]["value"], first);
    let cleared = record(
        &engine,
        &id,
        json!({"action": "retract", "records": ["rec-000001"]}),
    );
    assert_eq!(cleared["steps"]["zero"]["reading"], Value::Null);
    assert_eq!(cleared["parameters"]["zero_p"]["source"], "unset");
    assert_eq!(cleared["parameters"]["offset_p"]["why"], "needs zero_p");
}

#[test]
fn a_preview_computes_the_reading_without_saving_it_and_both_refuse_the_same_requests() {
    let (engine, dir, id) = imported(template());
    let preview = call(
        &engine,
        "preview_reading",
        json!({"session_id": id, "step": "zero", "capture": CAPTURE, "range_s": [0.2, 0.45]}),
    );
    assert_eq!(preview["step"], "zero");
    assert_eq!(preview["values"]["zero_p"]["n"], 3);
    assert_eq!(
        preview["values"]["zero_p"]["value"],
        (211.692 + 191.442 + 171.192) / 3.0
    );
    assert_eq!(record_files(&dir, &id), 0);
    for (request, message) in [
        (reading("nope", [0.2, 0.45]), "No step nope"),
        (
            reading("zero", [1.0, 1.9]),
            "No stored rows between 1 and 1.9 s",
        ),
        (
            reading("zero", [0.45, 0.2]),
            "Bad arguments: A range is two finite times in seconds, the first before the second",
        ),
        (
            json!({"action": "reading", "step": "zero", "capture": "ms", "range_s": [0.2, 0.45]}),
            "No capture ms",
        ),
    ] {
        let mut args = request.clone();
        args["session_id"] = json!(id);
        let e = refused(&engine, "record_analysis", args.clone());
        assert_eq!((e.kind, e.message.as_str()), (ErrorKind::Invalid, message));
        let e = refused(&engine, "preview_reading", args);
        assert_eq!(e.message, message);
    }
    assert_eq!(record_files(&dir, &id), 0);
}

#[test]
fn a_reading_refuses_a_capture_of_another_role() {
    let mut data = template();
    data["roles"]["other"] = data["roles"]["ms"].clone();
    let (engine, _dir, id) = imported(data);
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": TEMPLATE, "files": [
            {"role": "ms", "path": fixture("legacy-frames.zip"), "label": "a"},
            {"role": "other", "path": fixture("legacy-frames.zip"), "label": "b"},
        ]}),
    );
    let two = manifest["id"].as_str().unwrap();
    assert_ne!(two, id);
    let mut args =
        json!({"action": "reading", "step": "zero", "capture": "other-b", "range_s": [0.2, 0.45]});
    args["session_id"] = json!(two);
    let e = refused(&engine, "record_analysis", args);
    assert_eq!(
        e.message,
        "Capture other-b records role other; step zero reads role ms"
    );
}

#[test]
fn line_points_fill_their_steps_and_the_fit_sets_slope_and_intercept() {
    let (engine, _dir, id) = imported(template());
    let fresh = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(
        fresh["fits"]["line"],
        json!({"slope": null, "intercept": null, "r2": null, "n": 0, "missing": ["p0", "p1"]})
    );
    assert_eq!(fresh["steps"]["line.p1"]["known"], 1.0);
    assert_eq!(fresh["steps"]["line.p1"]["kind"], "point");
    record(&engine, &id, reading("line.p0", [0.2, 0.45]));
    let view = record(&engine, &id, reading("line.p1", [2.9, 3.2]));
    let (x0, x1) = (
        (211.692 + 191.442 + 171.192) / 3.0,
        (-314.808 + -335.058 + -355.308) / 3.0,
    );
    let fit = &view["fits"]["line"];
    assert_eq!(
        (fit["n"].clone(), fit["missing"].clone()),
        (json!(2), json!([]))
    );
    let slope = fit["slope"].as_f64().unwrap();
    assert!((slope - 1.0 / (x1 - x0)).abs() < 1e-15, "{fit}");
    assert!((fit["intercept"].as_f64().unwrap() - -x0 / (x1 - x0)).abs() < 1e-12);
    assert_eq!(view["parameters"]["gain_p"]["value"], slope);
    assert_eq!(view["parameters"]["gain_p"]["calibration"], "line");
    assert_eq!(view["parameters"]["base_p"]["source"], "fitted");
}
