use std::path::Path;

use cousinslab::templates::{Paths, from_snapshot, load_profiles, read_yaml, validate};
use serde_json::{Value, json};

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";

fn builtin() -> Value {
    read_yaml(&Paths::default().templates.join(format!("{TEMPLATE}.yaml"))).unwrap()
}

fn rejection(data: Value) -> String {
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    validate(data, &profiles).unwrap_err().0
}

#[test]
fn yaml_loads_exactly_as_pyyaml_loaded_the_shipped_files() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/pyyaml-loads.json");
    let expected: Value = serde_json::from_str(&std::fs::read_to_string(fixture).unwrap()).unwrap();
    let engine = Paths::default().templates.parent().unwrap().to_path_buf();
    let expected = expected.as_object().unwrap();
    assert_eq!(expected.len(), 5);
    for (file, pyyaml) in expected {
        assert_eq!(&read_yaml(&engine.join(file)).unwrap(), pyyaml, "{file}");
    }
}

#[test]
fn profiles_are_keyed_by_id_and_paths_resolve_against_the_repository() {
    let paths = Paths::default();
    let profiles = load_profiles(&paths.instruments).unwrap();
    let ids: Vec<&str> = profiles.keys().map(String::as_str).collect();
    assert_eq!(
        ids,
        [
            "ambit-replay-150-pl1",
            "ambit-replay-150-pl2",
            "ms-legacy-frames-replay",
            "ms2-ezview",
            "ms2-ezview-simulated"
        ]
    );
    let recording = profiles["ambit-replay-150-pl1"]["settings"]["recording"]
        .as_str()
        .unwrap();
    assert!(paths.resolve_path(recording).is_file(), "{recording}");
    let frames = profiles["ms-legacy-frames-replay"]["settings"]["path"]
        .as_str()
        .unwrap();
    assert!(paths.resolve_path(frames).is_file(), "{frames}");
}

#[test]
fn the_builtin_template_validates_and_plans_its_light_protocol() {
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(builtin(), &profiles).unwrap();
    assert_eq!((template.id(), template.revision()), (TEMPLATE, 1));
    let plan = template.protocol_plan("light").unwrap();
    assert_eq!(
        (plan.samples, plan.nominal_s, plan.flashes),
        (8010, 755.5, 14)
    );
    assert!(template.protocol_plan("ms").is_none());
    assert_eq!(template.flash_red_level("light"), 2500);
    assert_eq!(template.flash_red_level("ms"), 2500);
    assert_eq!(template.params()["ubar_per_mv"], 1831.1123481696839);
    let derived: Vec<(&str, &str)> = template
        .derived()
        .iter()
        .map(|d| (d.name.as_str(), d.role.as_str()))
        .collect();
    assert_eq!(derived, [("ubar_co2", "ms"), ("fluorescence", "light")]);
}

#[test]
fn disabling_a_role_drops_it_and_every_chart_left_without_series() {
    let mut data = builtin();
    data["roles"]["light"]["enabled"] = json!(false);
    data["charts"][0]["series"]
        .as_array_mut()
        .unwrap()
        .push(json!({"role": "light", "value": "fluorescence"}));
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(data, &profiles).unwrap();
    let enabled: Vec<&str> = template
        .enabled_roles()
        .into_iter()
        .map(|(r, _)| r)
        .collect();
    assert_eq!(enabled, ["ms"]);
    let charts = template.charts();
    let ids: Vec<&str> = charts.iter().map(|c| c["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["co2", "mass44"]);
    assert_eq!(
        charts[0]["series"],
        json!([{"role": "ms", "value": "ubar_co2"}])
    );
}

#[test]
fn an_imported_role_offers_only_the_columns_its_importer_writes() {
    let mut data = builtin();
    data["charts"][2]["series"][0]["value"] = json!("ch3");
    assert_eq!(
        rejection(data.clone()),
        "Chart mass44: 'ch3' is not a column or derived value of ms"
    );
    data["roles"]["ms"]
        .as_object_mut()
        .unwrap()
        .remove("import");
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    assert!(validate(data, &profiles).is_ok());
}

#[test]
fn a_document_without_the_required_keys_names_each_one() {
    assert_eq!(
        rejection(json!({"name": "x"})),
        "Missing 'id'; Missing 'revision'; Missing 'roles'"
    );
    assert_eq!(
        rejection(json!(["not", "a", "mapping"])),
        "Missing 'id'; Missing 'revision'; Missing 'name'; Missing 'roles'"
    );
}

#[test]
fn invalid_fields_are_rejected_with_the_python_reason() {
    let cases: [(&str, Value, &str); 13] = [
        (
            "/roles/ms/instrument",
            json!("ms9"),
            "Role ms: unknown instrument profile 'ms9'; Derived ubar_co2: unknown names ['m44']; Chart mass44: 'm44' is not a column or derived value of ms",
        ),
        (
            "/roles/ms/start_delay_s",
            json!(-1),
            "Role ms: start_delay_s must be a number of seconds >= 0",
        ),
        (
            "/roles/ms/start_delay_s",
            json!("soon"),
            "Role ms: start_delay_s must be a number of seconds >= 0",
        ),
        (
            "/roles/ms/on_failure",
            json!("retry"),
            "Role ms: on_failure must be one of ['continue_others', 'stop_group']",
        ),
        (
            "/roles/light/protocol",
            json!("protocol_9"),
            "Role light: unknown protocol 'protocol_9'",
        ),
        (
            "/derived/ubar_co2/expr",
            json!("m44 % 2"),
            "Derived ubar_co2: Unsupported syntax in expression 'm44 % 2' at position 3",
        ),
        (
            "/derived/ubar_co2/role",
            json!("pump"),
            "Derived ubar_co2: unknown role 'pump'",
        ),
        (
            "/derived/fluorescence/expr",
            json!("(S - m44) / gain"),
            "Derived fluorescence: unknown names ['gain', 'm44']",
        ),
        (
            "/charts/0/series/0/role",
            json!("pump"),
            "Chart co2: unknown role 'pump'",
        ),
        (
            "/charts/2/series/0/value",
            json!("S"),
            "Chart mass44: 'S' is not a column or derived value of ms",
        ),
        (
            "/alignment/default_reference",
            json!("wall"),
            "alignment.default_reference must be one of ['clock', 'elapsed', 'event']",
        ),
        (
            "/alignment/event",
            json!("lid_closed"),
            "alignment.event 'lid_closed' is not defined under events",
        ),
        (
            "/alignment/trial_role",
            json!("pump"),
            "alignment.trial_role 'pump' is not a role",
        ),
    ];
    for (pointer, value, message) in cases {
        let mut data = builtin();
        *data.pointer_mut(pointer).unwrap() = value;
        assert_eq!(rejection(data), message, "{pointer}");
    }
}

#[test]
fn shapes_the_python_engine_crashed_on_are_rejected_with_a_reason() {
    let cases: [(&str, Value, &str); 6] = [
        (
            "/roles",
            json!(["ms"]),
            "roles must be a mapping of role names to settings",
        ),
        (
            "/roles/ms",
            json!("ms2"),
            "Role ms: settings must be a mapping",
        ),
        (
            "/revision",
            json!("two"),
            "revision must be a whole number, not 'two'",
        ),
        (
            "/roles/ms/import",
            json!("netcdf"),
            "Role ms: unknown import 'netcdf'; use one of ['ambit_csv', 'legacy_frames', 'ms_workbook']",
        ),
        (
            "/parameters/ambit_offset/value",
            json!("high"),
            "Parameter ambit_offset: value must be a number",
        ),
        (
            "/protocols/protocol_2/flash_red_level",
            json!(null),
            "Role light: protocol 'protocol_2' needs a whole-number flash_red_level",
        ),
    ];
    for (pointer, value, message) in cases {
        let mut data = builtin();
        *data.pointer_mut(pointer).unwrap() = value;
        assert_eq!(rejection(data), message, "{pointer}");
    }
}

#[test]
fn a_session_snapshot_rebuilds_the_validated_template_without_profiles() {
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let validated = validate(builtin(), &profiles).unwrap();
    assert_eq!(from_snapshot(builtin()).unwrap(), validated);

    let mut retired = builtin();
    retired["roles"]["ms"]["instrument"] = json!("a-profile-deleted-since");
    assert!(validate(retired.clone(), &profiles).is_err());
    let snapshot = from_snapshot(retired).unwrap();
    assert_eq!(snapshot.derived(), validated.derived());
    assert_eq!(
        snapshot.protocol_plan("light"),
        validated.protocol_plan("light")
    );
}

#[test]
fn a_snapshot_with_an_unparseable_expression_is_rejected() {
    let mut data = builtin();
    data["derived"]["ubar_co2"]["expr"] = json!("m44 ** 2");
    let error = from_snapshot(data).unwrap_err().0;
    assert!(
        error.starts_with("Derived ubar_co2: Unsupported syntax"),
        "{error}"
    );
}

#[test]
fn a_derived_value_may_read_derived_values_of_its_role_but_not_in_a_cycle() {
    let mut data = builtin();
    data["derived"]["d_ubar"] = json!({"role": "ms", "expr": "ubar_co2 - co2_zero_mv"});
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    assert!(validate(data.clone(), &profiles).is_ok());

    data["derived"]["other_role"] = json!({"role": "light", "expr": "ubar_co2 / R"});
    assert_eq!(
        rejection(data.clone()),
        "Derived other_role: unknown names ['ubar_co2']"
    );
    data["derived"]
        .as_object_mut()
        .unwrap()
        .remove("other_role");

    data["derived"]["ubar_co2"]["expr"] = json!("d_ubar * 2");
    assert_eq!(
        rejection(data.clone()),
        "Derived ubar_co2: depends on itself through d_ubar"
    );
    data["derived"]["ubar_co2"]["expr"] = json!("ubar_co2 + 1");
    assert_eq!(rejection(data), "Derived ubar_co2: depends on itself");
}

#[test]
fn a_slope_needs_a_source_clock_a_positive_window_and_at_least_two_points() {
    let mut data = builtin();
    data["derived"]["rate"] =
        json!({"role": "light", "slope": {"of": "S", "window_s": 2, "min_points": 3}});
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(data.clone(), &profiles).unwrap();
    assert_eq!(template.derived()[2].names(), ["S"]);
    assert_eq!(from_snapshot(data.clone()).unwrap(), template);

    data["derived"]["rate"] =
        json!({"role": "ms", "slope": {"of": "m44", "window_s": 2, "min_points": 3}});
    assert_eq!(
        rejection(data.clone()),
        "Derived rate: slope needs role ms to record an elapsed or device clock"
    );
    let cases = [
        (
            json!({"role": "light", "slope": {"of": "S", "window_s": 0, "min_points": 3}}),
            "Derived rate: slope.window_s must be a number of seconds > 0",
        ),
        (
            json!({"role": "light", "slope": {"of": "S", "window_s": 2, "min_points": 1}}),
            "Derived rate: slope.min_points must be a whole number >= 2",
        ),
        (
            json!({"role": "light", "slope": {"of": "foo", "window_s": 2, "min_points": 2}}),
            "Derived rate: unknown names ['foo']",
        ),
        (
            json!({"role": "light", "slope": {"window_s": 2, "min_points": 2}}),
            "Derived rate: slope.of must be the name of a column or derived value",
        ),
        (json!({"role": "light"}), "Derived rate: expr must be text"),
    ];
    for (rate, message) in cases {
        data["derived"]["rate"] = rate;
        assert_eq!(rejection(data.clone()), message);
    }
}

#[test]
fn a_chart_on_the_source_clock_needs_every_role_to_record_one() {
    let mut data = builtin();
    data["charts"][1]["x"] = json!("source");
    let one_chart = json!({"views": [{"id": "run", "components": [
        {"id": "f", "kind": "chart", "chart": "fluorescence"}]}]});
    data["layout"] = one_chart;
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(data.clone(), &profiles).unwrap();
    assert_eq!(template.charts()[1]["x"], "source");

    data["charts"][0]["x"] = json!("source");
    assert_eq!(
        rejection(data.clone()),
        "Chart co2: x: source needs role ms to record an elapsed or device clock"
    );
    data["charts"][0]["x"] = json!("host");
    assert_eq!(
        rejection(data.clone()),
        "Chart co2: x must be one of ['run', 'source']"
    );

    data["charts"][0]["x"] = json!("run");
    data["layout"] = json!({"views": [{"id": "run", "components": [
        {"id": "c", "kind": "chart", "chart": "co2"},
        {"id": "f", "kind": "chart", "chart": "fluorescence"}]}]});
    assert_eq!(
        rejection(data),
        "Layout view 'run': every chart must use the same x; found ['run', 'source']"
    );
}

#[test]
fn parameters_may_be_unset_entered_or_computed_and_share_one_namespace_with_derived() {
    let mut data = builtin();
    data["parameters"]["temp_c"] = json!({"entry": true, "unit": "°C", "label": "Temperature"});
    data["parameters"]["o2_cal"] =
        json!({"expr": "(456.49 - 12.387 * temp_c) / ubar_per_mv", "entry": true});
    data["parameters"]["ubar_per_pct"] = json!({"expr": "ubar_per_mv * 2"});
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(data.clone(), &profiles).unwrap();
    let params = template.params();
    assert_eq!(
        params.get("temp_c"),
        None,
        "an unset parameter is absent, never 0"
    );
    assert_eq!(params.get("o2_cal"), None);
    assert_eq!(params["ubar_per_pct"], 2.0 * 1831.1123481696839);
    let specs = template.param_specs();
    let temp = specs.iter().find(|s| s.name == "temp_c").unwrap();
    assert!(temp.entry && temp.value.is_none());
    assert_eq!(from_snapshot(data.clone()).unwrap().params(), params);

    let cases = [
        (
            "/parameters/o2_cal/expr",
            json!("temp_c +"),
            "Parameter o2_cal: Unsupported syntax in expression 'temp_c +' at position 8",
        ),
        (
            "/parameters/o2_cal/expr",
            json!("temp_c / m44"),
            "Parameter o2_cal: unknown names ['m44']",
        ),
        (
            "/parameters/o2_cal/expr",
            json!("ubar_per_pct"),
            "Parameter o2_cal: depends on itself through ubar_per_pct",
        ),
        (
            "/parameters/temp_c/entry",
            json!("yes"),
            "Parameter temp_c: entry must be true or false",
        ),
        (
            "/parameters/ubar_per_pct/value",
            json!(1),
            "Parameter ubar_per_pct: give value or expr, not both",
        ),
    ];
    for (pointer, value, message) in cases {
        let mut bad = data.clone();
        if pointer.ends_with("/expr") && message.contains("itself") {
            bad["parameters"]["ubar_per_pct"]["expr"] = json!("o2_cal + 1");
        }
        let [_, section, name, key] = pointer.split('/').collect::<Vec<_>>()[..] else {
            panic!("{pointer}");
        };
        bad[section][name][key] = value;
        assert_eq!(rejection(bad), message, "{pointer}");
    }

    data["parameters"]["ubar_co2"] = json!({"value": 1});
    assert_eq!(
        rejection(data),
        "'ubar_co2' is defined under both parameters and derived"
    );
}
