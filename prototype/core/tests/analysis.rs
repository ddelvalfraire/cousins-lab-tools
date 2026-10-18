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
        "measurements": {
            "sample": {
                "label": "Sample",
                "role": "ms",
                "labels": {"name": "Sample Name"},
                "steps": {
                    "co2": {"label": "CO2 Sample", "readings": {"co2_mv": {"stat": "mean", "of": "m44"}}},
                    "o2": {"label": "Calculate", "readings": {"o2_mv": {"stat": "mean", "of": "m32"}}},
                },
                "results": {
                    "co2_zeroed": {"expr": "co2_mv - zero_p", "unit": "mV", "label": "CO2 above zero"},
                    "ratio": {"expr": "o2_mv / co2_zeroed", "unit": "", "label": "Ratio"},
                },
            },
        },
        "derived": {
            "scaled": {"role": "ms", "expr": "m44 * ubar_per_pct"},
            "rate": {"role": "ms", "slope": {"of": "m44", "window_s": 0.3, "min_points": 3}},
            "zeroed": {"role": "ms", "expr": "m44 - zero_p"},
        },
        "charts": [
            {"id": "raw", "title": "Raw", "unit": "mV", "x": "source",
             "series": [{"role": "ms", "value": "m44"}]},
            {"id": "zeroed", "title": "Zeroed", "unit": "mV", "x": "source",
             "series": [{"role": "ms", "value": "zeroed"}]},
            {"id": "line_cal", "kind": "xy", "title": "Line", "x_label": "mV", "y_label": "µl",
             "series": [{"calibration": "line", "color": "#00fa9a"}]},
            {"id": "samples", "kind": "xy", "title": "Samples",
             "series": [{"measurement": "sample", "x": "co2_zeroed", "y": "ratio", "label": "Ratio"}]},
        ],
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
        from: None,
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
               "source": null, "record": null, "values": {}, "reading": null, "from": null})
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

#[test]
fn a_calibration_recomputes_review_charts_and_a_saved_alignment_keeps_its_values() {
    let (engine, _dir, id) = imported(template());
    let review = |trial_params: Value| {
        let preview = call(
            &engine,
            "preview_alignment",
            json!({"session_id": id, "reference": "elapsed", "trial_params": trial_params}),
        );
        preview["charts"][1]["series"].clone()
    };
    assert_eq!(
        review(json!({})),
        json!([]),
        "zero_p is unset, so nothing plots"
    );
    let preview = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    let ids: Vec<&str> = preview["charts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        ids,
        ["raw", "zeroed"],
        "xy charts come from the analysis view"
    );
    record(&engine, &id, reading("zero", [0.2, 0.45]));
    let zero = (211.692 + 191.442 + 171.192) / 3.0;
    let series = review(json!({}));
    let points = series[0]["points"].as_array().unwrap();
    assert_eq!(points.len(), 16, "every stored row, the earliest included");
    assert_eq!(points[0], json!([0.105, 231.942 - zero]));
    let overridden = review(json!({"all": {"zero_p": 200.0}}));
    assert_eq!(overridden[0]["points"][0], json!([0.105, 231.942 - 200.0]));

    let saved = call(
        &engine,
        "save_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    assert_eq!(saved["trials"][0]["params"]["zero_p"], zero);
    assert_eq!(saved["trials"][0]["params"]["offset_p"], zero * 2.0);
    record(&engine, &id, reading("zero", [2.9, 3.2]));
    let charts = call(
        &engine,
        "alignment_charts",
        json!({"session_id": id, "alignment_id": saved["id"]}),
    );
    assert_eq!(
        charts["charts"][1]["series"][0]["points"][0],
        json!([0.105, 231.942 - zero]),
        "a saved alignment keeps the parameters it was saved with"
    );
}

#[test]
fn a_table_row_keeps_what_it_was_added_with_after_a_later_calibration() {
    let (engine, _dir, id) = imported(template());
    let add =
        |labels: Value| json!({"action": "add_row", "measurement": "sample", "labels": labels});
    let refuse = |request: Value| {
        let mut args = request;
        args["session_id"] = json!(id);
        refused(&engine, "record_analysis", args).message
    };
    assert_eq!(refuse(add(json!({}))), "Draft has no readings");
    let zero = (211.692 + 191.442 + 171.192) / 3.0;
    let co2 = (-314.808 + -335.058 + -355.308) / 3.0;
    record(&engine, &id, reading("zero", [0.2, 0.45]));
    let drafted = record(&engine, &id, reading("sample.co2", [2.9, 3.2]));
    let draft = &drafted["drafts"]["sample"];
    assert_eq!(
        draft["results"],
        json!({"co2_zeroed": co2 - zero, "ratio": null})
    );
    assert_eq!(draft["unset"], json!(["o2_mv"]));
    assert_eq!(draft["records"], json!(["rec-000002"]));
    assert_eq!(
        drafted["tables"]["sample"]["columns"],
        json!([
            {"key": "name", "label": "Sample Name", "unit": "", "kind": "label"},
            {"key": "co2_zeroed", "label": "CO2 above zero", "unit": "mV", "kind": "result"},
            {"key": "ratio", "label": "Ratio", "unit": "", "kind": "result"},
        ])
    );
    assert_eq!(
        refuse(add(json!({"nickname": "x"}))),
        "Measurement sample has no label nickname"
    );
    assert_eq!(
        refuse(json!({"action": "add_row", "measurement": "extract"})),
        "No measurement extract"
    );

    let added = record(&engine, &id, add(json!({"name": "leaf 1"})));
    assert_eq!(added["record"], "rec-000003");
    let rows = &added["tables"]["sample"]["rows"];
    assert_eq!(rows.as_array().unwrap().len(), 1);
    assert_eq!(rows[0]["record"], "rec-000003");
    assert_eq!(rows[0]["labels"], json!({"name": "leaf 1"}));
    assert_eq!(
        rows[0]["results"],
        json!({"co2_zeroed": co2 - zero, "ratio": null})
    );
    assert_eq!(added["steps"]["sample.co2"]["reading"], Value::Null);
    assert_eq!(added["drafts"]["sample"]["records"], json!([]));

    let recalibrated = record(&engine, &id, reading("zero", [0.7, 0.9]));
    assert_ne!(recalibrated["parameters"]["zero_p"]["value"], zero);
    assert_eq!(recalibrated["tables"]["sample"]["rows"], *rows);
    let cleared = record(
        &engine,
        &id,
        json!({"action": "retract", "records": ["rec-000003"]}),
    );
    assert_eq!(cleared["tables"]["sample"]["rows"], json!([]));
    assert_eq!(refuse(add(json!({}))), "Draft has no readings");
}

#[test]
fn a_table_exports_as_csv_with_each_rows_parameters_in_the_sidecar() {
    let (engine, _dir, id) = imported(template());
    let export = || {
        call(
            &engine,
            "export_table",
            json!({"session_id": id, "measurement": "sample"}),
        )
    };
    let e = refused(
        &engine,
        "export_table",
        json!({"session_id": id, "measurement": "sample"}),
    );
    assert_eq!(e.message, "Table sample has no rows to export");
    record(&engine, &id, reading("zero", [0.2, 0.45]));
    record(&engine, &id, reading("sample.co2", [2.9, 3.2]));
    record(&engine, &id, reading("sample.o2", [2.9, 3.2]));
    let added = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "sample", "labels": {"name": "leaf, 1"}}),
    );
    let row = &added["tables"]["sample"]["rows"][0];
    let paths = export();
    let csv_path = PathBuf::from(paths["csv"].as_str().unwrap());
    assert!(csv_path.ends_with("exports/table-sample-rec-000004/table.csv"));
    let text = std::fs::read_to_string(&csv_path).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines[0], "record,created_utc,name,co2_zeroed,ratio");
    let (co2, ratio) = (
        row["results"]["co2_zeroed"].as_f64().unwrap(),
        row["results"]["ratio"].as_f64().unwrap(),
    );
    assert_eq!(
        lines[1],
        format!(
            "rec-000004,{},\"leaf, 1\",{co2:?},{ratio:?}",
            row["created_utc"].as_str().unwrap()
        )
    );
    assert_eq!(lines.len(), 2);
    let sidecar: Value = serde_json::from_str(
        &std::fs::read_to_string(paths["metadata"].as_str().unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(sidecar["through_record"], "rec-000004");
    assert_eq!(
        sidecar["rows"][0]["readings"],
        json!(["rec-000002", "rec-000003"])
    );
    let zero = (211.692 + 191.442 + 171.192) / 3.0;
    assert_eq!(sidecar["rows"][0]["params"]["zero_p"], zero);
    assert_eq!(sidecar["columns"][1]["expr"], "co2_mv - zero_p");

    std::fs::write(&csv_path, "kept").unwrap();
    assert_eq!(export(), paths, "the same log exports to the same folder");
    assert_eq!(std::fs::read_to_string(&csv_path).unwrap(), "kept");
    record(&engine, &id, reading("zero", [0.7, 0.9]));
    let later = export();
    assert!(
        later["csv"]
            .as_str()
            .unwrap()
            .contains("table-sample-rec-000005")
    );
    let again = std::fs::read_to_string(later["csv"].as_str().unwrap()).unwrap();
    assert_eq!(
        again.lines().nth(1),
        Some(lines[1]),
        "a later calibration leaves the row alone"
    );
}

#[test]
fn xy_charts_carry_calibration_points_with_the_fit_line_and_table_rows() {
    let (engine, _dir, id) = imported(template());
    let fresh = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(
        fresh["xy"],
        json!({
            "line_cal": {"series": [{"name": "line", "color": "#00fa9a", "points": [], "line": null}]},
            "samples": {"series": [{"name": "Ratio", "color": null, "points": [], "line": null}]},
        })
    );
    let (x0, x1) = (
        (211.692 + 191.442 + 171.192) / 3.0,
        (-314.808 + -335.058 + -355.308) / 3.0,
    );
    record(&engine, &id, reading("line.p0", [0.2, 0.45]));
    let one = record(&engine, &id, reading("line.p1", [2.9, 3.2]));
    let series = &one["xy"]["line_cal"]["series"][0];
    assert_eq!(series["points"], json!([[x0, 0.0], [x1, 1.0]]));
    let line = series["line"].as_array().unwrap();
    let (lo, hi) = (&line[0], &line[1]);
    assert_eq!((lo[0].as_f64(), hi[0].as_f64()), (Some(x1), Some(x0)));
    assert!((lo[1].as_f64().unwrap() - 1.0).abs() < 1e-12, "{line:?}");
    assert!(hi[1].as_f64().unwrap().abs() < 1e-12, "{line:?}");

    record(&engine, &id, reading("zero", [0.2, 0.45]));
    record(&engine, &id, reading("sample.co2", [2.9, 3.2]));
    record(&engine, &id, reading("sample.o2", [2.9, 3.2]));
    let added = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "sample"}),
    );
    let row = &added["tables"]["sample"]["rows"][0]["results"];
    assert_eq!(
        added["xy"]["samples"]["series"][0]["points"],
        json!([[row["co2_zeroed"], row["ratio"]]])
    );
    record(&engine, &id, reading("sample.co2", [2.9, 3.2]));
    record(&engine, &id, reading("sample.o2", [2.9, 3.2]));
    let twice = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "sample"}),
    );
    let point = json!([row["co2_zeroed"], row["ratio"]]);
    assert_eq!(
        twice["xy"]["samples"]["series"][0]["points"],
        json!([point, point]),
        "equal x values each keep their own point"
    );
}

#[test]
fn a_typed_value_fills_a_step_until_a_later_reading_and_says_where_it_came_from() {
    let (engine, dir, id) = imported(template());
    let typed =
        |step: &str, values: Value| json!({"action": "typed", "step": step, "values": values});
    let saved = record(&engine, &id, typed("zero", json!({"zero_p": 190.5})));
    let step = &saved["steps"]["zero"];
    assert_eq!(
        (
            &step["source"],
            &step["record"],
            &step["values"],
            &step["reading"]
        ),
        (
            &json!("typed"),
            &json!("rec-000001"),
            &json!({"zero_p": 190.5}),
            &Value::Null
        )
    );
    assert_eq!(saved["parameters"]["zero_p"]["value"], 190.5);
    assert_eq!(saved["parameters"]["zero_p"]["source"], "fitted");
    assert_eq!(saved["parameters"]["offset_p"]["value"], 381.0);
    let file = dir
        .path()
        .join("sessions")
        .join(&id)
        .join("analysis/rec-000001.json");
    let stored: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
    assert_eq!(
        (&stored["action"], &stored["step"], &stored["values"]),
        (&json!("typed"), &json!("zero"), &json!({"zero_p": 190.5}))
    );

    let read = record(&engine, &id, reading("zero", [0.2, 0.45]));
    let first = (211.692 + 191.442 + 171.192) / 3.0;
    assert_eq!(read["steps"]["zero"]["source"], "read");
    assert_eq!(read["steps"]["zero"]["values"], json!({"zero_p": first}));
    let retyped = record(&engine, &id, typed("zero", json!({"zero_p": 2.0})));
    assert_eq!(retyped["parameters"]["zero_p"]["value"], 2.0);

    let points = record(&engine, &id, typed("line.p0", json!({"m44": 10.0})));
    assert_eq!(points["fits"]["line"]["n"], 1);
    let fitted = record(&engine, &id, typed("line.p1", json!({"m44": 20.0})));
    assert_eq!(fitted["parameters"]["gain_p"]["value"], 0.1);
    assert_eq!(
        fitted["xy"]["line_cal"]["series"][0]["points"],
        json!([[10.0, 0.0], [20.0, 1.0]])
    );
    let sample = record(&engine, &id, typed("sample.co2", json!({"co2_mv": 12.0})));
    assert_eq!(sample["drafts"]["sample"]["results"]["co2_zeroed"], 10.0);
    assert_eq!(
        sample["drafts"]["sample"]["readings"],
        json!({"co2_mv": 12.0})
    );

    let refuse = |request: Value| {
        let mut args = request;
        args["session_id"] = json!(id);
        refused(&engine, "record_analysis", args).message
    };
    assert_eq!(refuse(typed("nope", json!({"x": 1}))), "No step nope");
    assert_eq!(
        refuse(typed("zero", json!({}))),
        "Type at least one value for step zero"
    );
    assert_eq!(
        refuse(typed("line.p0", json!({"m32": 1}))),
        "Step line.p0 has no reading m32; it reads m44"
    );
    assert!(refuse(typed("zero", json!({"zero_p": "a"}))).starts_with("Bad arguments: "));
}

fn import_again(engine: &Engine, template: &str) -> String {
    let manifest = call(
        engine,
        "import_files",
        json!({"template_id": template,
               "files": [{"role": "ms", "path": fixture("legacy-frames.zip")}]}),
    );
    manifest["id"].as_str().unwrap().to_string()
}

fn stored(dir: &tempfile::TempDir, id: &str, record: &Value) -> Value {
    let file = dir
        .path()
        .join("sessions")
        .join(id)
        .join(format!("analysis/{}.json", record.as_str().unwrap()));
    serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap()
}

#[test]
fn calibrations_copy_from_another_session_of_the_template_and_name_their_source() {
    let (engine, dir, from) = imported(template());
    let typed =
        |step: &str, values: Value| json!({"action": "typed", "step": step, "values": values});
    record(&engine, &from, reading("zero", [0.2, 0.45]));
    record(&engine, &from, reading("zero", [2.9, 3.2]));
    record(&engine, &from, typed("line.p0", json!({"m44": 10.0})));
    record(&engine, &from, typed("line.p1", json!({"m44": 20.0})));
    record(
        &engine,
        &from,
        json!({"action": "entry", "parameter": "temp_c", "value": 21}),
    );
    record(&engine, &from, reading("sample.co2", [2.9, 3.2]));
    record(
        &engine,
        &from,
        json!({"action": "add_row", "measurement": "sample"}),
    );
    let source = record(&engine, &from, reading("sample.co2", [0.2, 0.45]));
    let to = import_again(&engine, TEMPLATE);
    assert_eq!(
        call(&engine, "calibration_sources", json!({"session_id": to})),
        json!([{"session_id": from, "name": "Imported recording", "created_utc": source_created(&engine, &from),
                "revision": 1, "steps": 3, "parameters": 1}])
    );

    let copied = call(
        &engine,
        "copy_calibrations",
        json!({"session_id": to, "from_session_id": from, "request_id": "copy-1"}),
    );
    assert_eq!(
        copied["records"],
        json!(["rec-000001", "rec-000002", "rec-000003", "rec-000004"])
    );
    assert_eq!(copied["notes"], json!([]));
    let zero = &copied["steps"]["zero"];
    assert_eq!(zero["source"], "copied");
    assert_eq!(zero["values"], source["steps"]["zero"]["values"]);
    assert_eq!(
        zero["from"],
        json!({"session": from, "record": "rec-000002"})
    );
    assert_eq!(copied["steps"]["line.p1"]["from"]["record"], "rec-000004");
    for name in ["zero_p", "gain_p", "base_p", "temp_c", "o2_scale"] {
        assert_eq!(
            copied["parameters"][name]["value"], source["parameters"][name]["value"],
            "{name}"
        );
    }
    assert_eq!(copied["parameters"]["temp_c"]["record"], "rec-000004");
    assert_eq!(
        stored(&dir, &to, &json!("rec-000004"))["from"],
        json!({"session": from, "record": "rec-000005"})
    );
    assert_eq!(
        copied["steps"]["sample.co2"]["source"],
        Value::Null,
        "drafts stay behind"
    );
    assert_eq!(
        copied["tables"]["sample"]["rows"],
        json!([]),
        "rows stay behind"
    );

    let again = call(
        &engine,
        "copy_calibrations",
        json!({"session_id": to, "from_session_id": from, "request_id": "copy-1"}),
    );
    assert_eq!(again["records"], copied["records"]);
    assert_eq!(
        record_files(&dir, &to),
        4,
        "a repeated request saves nothing"
    );

    let refuse = |args: Value| refused(&engine, "copy_calibrations", args).message;
    assert_eq!(
        refuse(json!({"session_id": to, "from_session_id": to})),
        "A session cannot copy calibrations from itself"
    );
    let empty = import_again(&engine, TEMPLATE);
    assert_eq!(
        refuse(json!({"session_id": to, "from_session_id": empty})),
        format!("Session {empty} has no calibrations to copy")
    );
    let mut other = template();
    other["id"] = json!("other-test");
    call(
        &engine,
        "save_template",
        json!({"template_id": "other-test", "data": other}),
    );
    let elsewhere = import_again(&engine, "other-test");
    let error = refused(
        &engine,
        "copy_calibrations",
        json!({"session_id": elsewhere, "from_session_id": from}),
    );
    assert_eq!(error.kind, ErrorKind::Invalid);
    assert_eq!(
        error.message,
        format!(
            "Session {from} uses template analysis-test; this session uses other-test. Calibrations copy only between sessions of the same template"
        )
    );
    assert_eq!(record_files(&dir, &elsewhere), 0);
    assert_eq!(
        call(
            &engine,
            "calibration_sources",
            json!({"session_id": elsewhere})
        ),
        json!([])
    );
}

fn source_created(engine: &Engine, id: &str) -> Value {
    let session = call(engine, "get_session", json!({"session_id": id}));
    session["manifest"]["created_utc"].clone()
}

#[test]
fn calibrations_export_to_csv_with_their_source_records() {
    let (engine, _dir, from) = imported(template());
    assert_eq!(
        refused(&engine, "export_calibrations", json!({"session_id": from})).message,
        "This session has no calibrations to export"
    );
    let typed =
        |step: &str, values: Value| json!({"action": "typed", "step": step, "values": values});
    record(&engine, &from, reading("zero", [0.2, 0.45]));
    record(&engine, &from, typed("line.p0", json!({"m44": 10.5})));
    record(
        &engine,
        &from,
        json!({"action": "entry", "parameter": "temp_c", "value": 21}),
    );
    let source = record(&engine, &from, reading("sample.co2", [2.9, 3.2]));
    let export = call(&engine, "export_calibrations", json!({"session_id": from}));
    let csv = export["csv"].as_str().unwrap();
    assert!(
        csv.ends_with("exports/calibrations-rec-000004/calibrations.csv"),
        "{csv}"
    );
    let zero = source["steps"]["zero"]["values"]["zero_p"]
        .as_f64()
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(csv).unwrap(),
        format!(
            "template,kind,name,reading,value,label,source,record\n\
             analysis-test,step,zero,zero_p,{zero:?},Zero,read,rec-000001\n\
             analysis-test,step,line.p0,m44,10.5,0 µl,typed,rec-000002\n\
             analysis-test,parameter,temp_c,,21.0,Temperature,entered,rec-000003\n"
        )
    );
    assert_eq!(
        call(&engine, "export_calibrations", json!({"session_id": from})),
        export
    );
}
