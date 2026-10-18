//! The analysis commands over an imported legacy frame zip: records, folds and refusals.

use std::path::PathBuf;

use cousinslab::alignment::TemplateRef;
use cousinslab::analysis::{Action, append};
use cousinslab::api::Engine;
use cousinslab::session::utc_now;
use cousinslab::templates::Paths;
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

#[test]
fn the_view_lists_every_parameter_with_its_value_and_where_it_came_from() {
    let (engine, dir, id) = imported(template());
    let view = call(&engine, "analysis", json!({"session_id": id}));
    assert_eq!(view["rev"], 0);
    let names: Vec<&String> = view["parameters"].as_object().unwrap().keys().collect();
    assert_eq!(names, ["ubar_per_pct", "temp_c", "o2_scale"]);
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
