use cousinslab::templates::{Paths, Template, TemplateError, load_profiles, read_yaml, validate};
use serde_json::{Value, json};

fn data() -> Value {
    read_yaml(
        &Paths::default()
            .templates
            .join("jii-leaf-co2-fluorescence.yaml"),
    )
    .unwrap()
}

fn with_layout(mut data: Value, components: Value) -> Value {
    data["layout"] = json!({"views": [{"id": "run", "name": "Run", "components": components}]});
    data
}

fn check(data: Value) -> Result<Template, TemplateError> {
    validate(data, &load_profiles(&Paths::default().instruments).unwrap())
}

fn boxes(components: &Value) -> Vec<(&str, [i64; 4])> {
    components
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            let cell = |k: &str| c[k].as_i64().unwrap();
            (
                c["id"].as_str().unwrap(),
                [cell("x"), cell("y"), cell("w"), cell("h")],
            )
        })
        .collect()
}

#[test]
fn sizes_default_by_kind_and_unplaced_components_stack_below_the_last_one() {
    let template = check(with_layout(
        data(),
        json!([
            {"id": "co2", "kind": "chart", "chart": "co2"},
            {"id": "now", "kind": "metric", "value": "ubar_co2", "x": 8, "y": 0},
            {"id": "ctl", "kind": "controls"},
            {"id": "caps", "kind": "captures"},
            {"id": "params", "kind": "inputs"},
            {"id": "box", "kind": "group", "components": [{"id": "inner", "kind": "metric", "value": "fluorescence"}]},
        ]),
    ))
    .unwrap();
    let layout = template.layout();
    let components = &layout["views"][0]["components"];
    assert_eq!(
        boxes(components),
        [
            ("co2", [0, 0, 8, 4]),
            ("now", [8, 0, 4, 2]),
            ("ctl", [0, 4, 4, 3]),
            ("caps", [0, 7, 12, 3]),
            ("params", [0, 10, 6, 4]),
            ("box", [0, 14, 12, 5]),
        ]
    );
    assert_eq!(components[5]["components"][0]["w"], 4);
}

#[test]
fn a_template_without_a_layout_gets_one_view_with_every_chart_then_controls_and_captures() {
    let mut data = data();
    data.as_object_mut().unwrap().remove("layout");
    let layout = check(data).unwrap().layout();
    assert_eq!(layout["columns"], 12);
    assert_eq!(layout["views"].as_array().unwrap().len(), 1);
    let components = &layout["views"][0]["components"];
    let kinds: Vec<(&str, Option<&str>)> = components
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            (
                c["kind"].as_str().unwrap(),
                c.get("chart").and_then(Value::as_str),
            )
        })
        .collect();
    assert_eq!(
        kinds,
        [
            ("chart", Some("co2")),
            ("chart", Some("fluorescence")),
            ("chart", Some("mass44")),
            ("controls", None),
            ("captures", None),
        ]
    );
    let sizes: Vec<[i64; 4]> = boxes(components).into_iter().map(|(_, b)| b).collect();
    assert_eq!(
        sizes,
        [
            [0, 0, 6, 4],
            [6, 0, 6, 4],
            [0, 4, 6, 4],
            [0, 8, 4, 3],
            [4, 8, 8, 3]
        ]
    );
}

#[test]
fn invalid_layouts_are_rejected_with_the_reason() {
    let cases = [
        (
            json!([{"id": "a", "kind": "sparkline"}]),
            "unknown kind 'sparkline'",
        ),
        (
            json!([{"id": "a", "kind": "calibration"}]),
            "unknown kind 'calibration'",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "ubar_co2", "x": 10, "w": 4}]),
            "outside the 12-column grid",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "ubar_co2", "h": 0}]),
            "outside the 12-column grid",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "ubar_co2", "x": "left"}]),
            "x, y, w and h must be whole numbers",
        ),
        (
            json!([{"id": "a", "kind": "chart", "chart": "co2", "x": 0, "y": 0},
                   {"id": "b", "kind": "metric", "value": "ubar_co2", "x": 6, "y": 2}]),
            "'a' and 'b' overlap",
        ),
        (
            json!([{"id": "a", "kind": "chart", "chart": "o2"}]),
            "unknown chart 'o2'",
        ),
        (json!([{"id": "a", "kind": "chart"}]), "unknown chart None"),
        (
            json!([{"id": "a", "kind": "metric", "value": "m44"}]),
            "'m44' is not a derived value",
        ),
        (
            json!([{"id": "a", "kind": "controls", "role": "pulser"}]),
            "unknown role 'pulser'",
        ),
        (
            json!([{"id": "a", "kind": "inputs", "parameters": ["gain"]}]),
            "unknown parameters ['gain']",
        ),
        (
            json!([{"id": "a", "kind": "controls"}, {"id": "a", "kind": "captures"}]),
            "'a' is defined twice",
        ),
        (
            json!([{"id": "g", "kind": "group", "components": [{"id": "x", "kind": "chart", "chart": "nope"}]}]),
            "unknown chart 'nope'",
        ),
        (json!([{"id": "a"}]), "unknown kind None"),
        (
            json!([{"id": "g", "kind": "group", "components": 5}]),
            "components must be a list",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": ["ubar_co2"]}]),
            "['ubar_co2'] is not a derived value",
        ),
        (
            json!([{"id": "a", "kind": "controls", "role": ["ms"]}]),
            "unknown role ['ms']",
        ),
        (
            json!([{"id": ["a"], "kind": "controls"}]),
            "ids must be text",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "fluorescence", "role": "ms"}]),
            "a metric takes its role from fluorescence (light)",
        ),
    ];
    for (components, message) in cases {
        let error = check(with_layout(data(), components.clone()))
            .unwrap_err()
            .0;
        assert!(error.contains(message), "{components}: {error}");
    }
}

#[test]
fn invalid_layouts_keep_the_full_python_messages() {
    let cases = [
        (
            json!([{"id": "a", "kind": "sparkline"}]),
            "Layout component 'a': unknown kind 'sparkline'; use one of ['captures', 'chart', 'controls', 'group', 'inputs', 'metric', 'readings', 'table']",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "ubar_co2", "x": 10, "w": 4}]),
            "Layout component 'a' is outside the 12-column grid (x=10, y=0, w=4, h=2)",
        ),
        (
            json!([{"id": "a", "kind": "chart", "chart": "co2", "x": 0, "y": 0},
                   {"id": "b", "kind": "metric", "value": "ubar_co2", "x": 6, "y": 2}]),
            "Layout components 'a' and 'b' overlap in view 'run'",
        ),
        (
            json!([{"id": "g", "kind": "group", "components": [{"id": "x", "kind": "chart", "chart": "nope"}]}]),
            "Layout component 'x': unknown chart 'nope'",
        ),
        (
            json!([{"id": "g", "kind": "group", "components": [7]}]),
            "Layout group 'g': each component must be a mapping",
        ),
        (
            json!([{"id": ["a"], "kind": "controls"}]),
            "Layout view 'run': component ids must be text, not ['a']",
        ),
        (
            json!([{"id": "a", "kind": "inputs", "parameters": "gain"}]),
            "Layout component 'a': parameters must be a list of parameter names",
        ),
        (
            json!([{"id": "a", "kind": "metric", "value": "fluorescence", "role": "ms"}]),
            "Layout component 'a': a metric takes its role from fluorescence (light); remove role 'ms'",
        ),
    ];
    for (components, message) in cases {
        assert_eq!(
            check(with_layout(data(), components)).unwrap_err().0,
            message
        );
    }
}

#[test]
fn a_layout_needs_at_least_one_view_and_unique_view_ids() {
    let mut data = data();
    data["layout"] = json!({"views": []});
    assert_eq!(
        check(data.clone()).unwrap_err().0,
        "layout.views must be a non-empty list"
    );
    data["layout"] = json!({"views": [1]});
    assert_eq!(
        check(data.clone()).unwrap_err().0,
        "Layout: each view must be a mapping with a list of components"
    );
    data["layout"] =
        json!({"views": [{"id": "run", "components": []}, {"id": "run", "components": []}]});
    assert_eq!(
        check(data).unwrap_err().0,
        "Layout view 'run' is defined twice"
    );
}

#[test]
fn components_bound_to_an_excluded_role_are_hidden_and_the_rest_stay() {
    let mut data = data();
    data["roles"]["light"]["enabled"] = json!(false);
    let template = check(with_layout(
        data,
        json!([
            {"id": "co2", "kind": "chart", "chart": "co2", "w": 4},
            {"id": "fl", "kind": "chart", "chart": "fluorescence", "x": 4, "y": 0, "w": 4},
            {"id": "fl-now", "kind": "metric", "value": "fluorescence", "x": 8, "y": 0},
            {"id": "light-ctl", "kind": "controls", "role": "light"},
            {"id": "ctl", "kind": "controls"},
            {"id": "box", "kind": "group", "components": [{"id": "inner", "kind": "metric", "value": "fluorescence"}]},
        ]),
    ))
    .unwrap();
    let hidden = serde_json::to_value(template.hidden_components()).unwrap();
    assert_eq!(
        hidden,
        json!({
            "fl": "Every role in chart fluorescence is excluded",
            "fl-now": "Role light is excluded",
            "light-ctl": "Role light is excluded",
            "inner": "Role light is excluded",
            "box": "Every component in the group is hidden",
        })
    );
}

#[test]
fn live_values_are_a_roles_chart_series_and_bound_metrics() {
    let template = check(data()).unwrap();
    let bindings = template.metric_bindings();
    let expected = [("fluorescence", "light"), ("ubar_co2", "ms")]
        .map(|(v, r)| (v.to_string(), r.to_string()));
    assert_eq!(bindings, expected.into_iter().collect());
    let ms: Vec<String> = template.live_values("ms").into_iter().collect();
    assert_eq!(ms, ["m44", "ubar_co2"]);
    let light: Vec<String> = template.live_values("light").into_iter().collect();
    assert_eq!(light, ["fluorescence"]);
}

#[test]
fn normalized_layouts_equal_the_python_engines_key_for_key_and_in_order() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/python-layouts.json");
    let python: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut without_layout = data();
    without_layout.as_object_mut().unwrap().remove("layout");
    let mut unplaced = data();
    unplaced["layout"] = python["unnamed_and_unplaced_input"].clone();
    for (name, data) in [
        ("builtin", data()),
        ("without_layout", without_layout),
        ("unnamed_and_unplaced", unplaced),
    ] {
        let layout = check(data).unwrap().layout();
        let (rust, python) = (layout.to_string(), python[name].to_string());
        assert_eq!(rust, python, "{name}");
    }
}

#[test]
fn charts_of_one_view_share_an_axis_even_inside_groups() {
    let mut data = data();
    data["charts"][1]["x"] = json!("source");
    let mixed = with_layout(
        data.clone(),
        json!([
            {"id": "a", "kind": "chart", "chart": "fluorescence", "x": 0, "y": 0, "w": 6, "h": 4},
            {"id": "g", "kind": "group", "x": 6, "y": 0, "w": 6, "h": 4, "components": [
                {"id": "b", "kind": "chart", "chart": "mass44", "x": 0, "y": 0, "w": 6, "h": 4}]}
        ]),
    );
    assert_eq!(
        check(mixed).unwrap_err().0,
        "Layout view 'run': every chart must use the same x; found ['run', 'source']"
    );
    let separate = data.clone();
    let mut separate = with_layout(
        separate,
        json!([{"id": "a", "kind": "chart", "chart": "fluorescence", "x": 0, "y": 0, "w": 6, "h": 4}]),
    );
    separate["layout"]["views"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id": "other", "components": [
        {"id": "b", "kind": "chart", "chart": "mass44", "x": 0, "y": 0, "w": 6, "h": 4}]}));
    assert!(
        check(separate).is_ok(),
        "one axis per view, not per template"
    );
}

/// Two legacy frame roles with one calibration and one measurement each.
fn frames() -> Value {
    let role = json!({"instrument": "ms-legacy-frames-replay", "import": "legacy_frames"});
    json!({
        "id": "frames", "revision": 1, "name": "Frames",
        "roles": {"ms": role, "ms2": role},
        "parameters": {"zero_p": {}, "zero2_p": {}},
        "calibrations": {
            "zero": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}},
            "zero2": {"role": "ms2", "set": {"zero2_p": {"stat": "mean", "of": "m44"}}},
        },
        "measurements": {
            "sample": {"role": "ms", "steps": {"co2": {"readings": {"co2_mv": {"stat": "mean", "of": "m44"}}}},
                       "results": {"pct": {"expr": "co2_mv - zero_p"}}},
            "other": {"role": "ms2", "readings": {"o_mv": {"stat": "mean", "of": "m32"}},
                      "results": {"o": {"expr": "o_mv"}}},
        },
    })
}

#[test]
fn readings_and_table_tiles_bind_steps_and_measurements_and_default_their_sizes() {
    let template = check(with_layout(
        frames(),
        json!([
            {"id": "steps", "kind": "readings", "role": "ms", "steps": ["zero", "sample.co2"]},
            {"id": "rows", "kind": "table", "measurement": "sample"},
            {"id": "steps2", "kind": "readings", "steps": ["zero2", "other"]},
            {"id": "rows2", "kind": "table", "measurement": "other"},
        ]),
    ))
    .unwrap();
    assert_eq!(
        boxes(&template.layout()["views"][0]["components"]),
        [
            ("steps", [0, 0, 3, 6]),
            ("rows", [0, 6, 4, 7]),
            ("steps2", [0, 13, 3, 6]),
            ("rows2", [0, 19, 4, 7]),
        ]
    );
    assert!(template.hidden_components().is_empty());
    let mut without = template.data().clone();
    without["roles"]["ms2"]["enabled"] = json!(false);
    let hidden = check(without).unwrap().hidden_components();
    let reasons: Vec<(&str, &str)> = hidden
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    assert_eq!(
        reasons,
        [
            ("rows2", "Role ms2 is excluded"),
            ("steps2", "Role ms2 is excluded")
        ]
    );
}

#[test]
fn readings_and_table_tiles_name_what_they_cannot_bind() {
    let cases = [
        (
            json!({"kind": "readings", "steps": []}),
            "Layout component 'a': steps must be a non-empty list of step references",
        ),
        (
            json!({"kind": "readings", "steps": "zero"}),
            "Layout component 'a': steps must be a non-empty list of step references",
        ),
        (
            json!({"kind": "readings", "steps": ["zero", "co2.ul9"]}),
            "Layout component 'a': unknown steps ['co2.ul9']",
        ),
        (
            json!({"kind": "readings", "steps": ["zero", "zero2"]}),
            "Layout component 'a': steps read roles ['ms', 'ms2']; give each role its own readings tile",
        ),
        (
            json!({"kind": "readings", "role": "ms", "steps": ["zero", "zero2"]}),
            "Layout component 'a': steps of role ['ms2'] cannot sit in a readings tile of role ms",
        ),
        (
            json!({"kind": "table", "measurement": "extract"}),
            "Layout component 'a': unknown measurement 'extract'",
        ),
        (
            json!({"kind": "table"}),
            "Layout component 'a': unknown measurement None",
        ),
        (
            json!({"kind": "table", "measurement": "other", "role": "ms"}),
            "Layout component 'a': a table takes its role from its measurement (ms2); remove role 'ms'",
        ),
    ];
    for (mut component, message) in cases {
        component["id"] = json!("a");
        let error = check(with_layout(frames(), json!([component.clone()])))
            .unwrap_err()
            .0;
        assert_eq!(error, message, "{component}");
    }
}
