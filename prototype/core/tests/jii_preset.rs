//! The JII leaf-disc preset over the sample 150 files: the workbook's injection curve and
//! per-leaf zero typed in must give its µbar column, and a flash row gives PhiPSII.

use std::path::PathBuf;

use cousinslab::api::Engine;
use cousinslab::templates::{Paths, load_profiles, read_yaml, validate};
use serde_json::{Value, json};

const TEMPLATE: &str = "jii-leaf-disc-preset";
const MS: &str = "ms-workbook";
const LIGHT: &str = "light-150-pl1";

/// Workbook RawDataAcquisition67Data M11:N14: µl injected and the mass 44 reading.
const INJECTIONS: [(&str, f64); 4] = [
    ("co2.zero", 0.3111),
    ("co2.ul1", 0.6912),
    ("co2.ul2", 1.0681),
    ("co2.ul3", 1.4005),
];
/// Workbook P14, SLOPE of µbar on mV over those points.
const UBAR_PER_MV: f64 = 1831.1123481696839;

fn reference(path: &str) -> PathBuf {
    Paths::default()
        .repo
        .join("reference/instruments")
        .join(path)
}

fn pl1_csv() -> PathBuf {
    reference("ambit/Ambit raw data_sample_150_pl1.csv")
}

fn call(engine: &Engine, command: &str, args: Value) -> Value {
    engine
        .call(command, args)
        .unwrap_or_else(|e| panic!("{command} failed: {e:?}"))
}

fn imported() -> (Engine, tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), dir.path()).unwrap();
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": TEMPLATE, "files": [
            {"role": "ms", "path": reference("mass-spec/Raw data-mass spec.xlsx"), "label": "workbook"},
            {"role": "light", "path": pl1_csv(), "label": "150-pl1"},
        ]}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    (engine, dir, id)
}

fn record(engine: &Engine, id: &str, request: Value) -> Value {
    let mut args = request;
    args["session_id"] = json!(id);
    call(engine, "record_analysis", args)
}

fn typed(engine: &Engine, id: &str, step: &str, values: Value) -> Value {
    record(
        engine,
        id,
        json!({"action": "typed", "step": step, "values": values}),
    )
}

fn reading(engine: &Engine, id: &str, step: &str, capture: &str, range_s: [f64; 2]) -> Value {
    record(
        engine,
        id,
        json!({"action": "reading", "step": step, "capture": capture, "range_s": range_s}),
    )
}

fn assert_close(actual: &Value, expected: f64, what: &str) {
    let actual = actual
        .as_f64()
        .unwrap_or_else(|| panic!("{what}: {actual}"));
    assert!(
        (actual - expected).abs() <= 1e-9 * expected.abs().max(1.0),
        "{what}: {actual} != {expected}"
    );
}

#[test]
fn the_preset_validates_and_each_view_fills_its_rows_without_overlap() {
    let data = read_yaml(&Paths::default().templates.join(format!("{TEMPLATE}.yaml"))).unwrap();
    let profiles = load_profiles(&Paths::default().instruments).unwrap();
    let template = validate(data, &profiles).unwrap();
    let layout = template.layout();
    let views: Vec<&str> = layout["views"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["name"].as_str().unwrap())
        .collect();
    assert_eq!(views, ["Gas", "Fluorescence", "Together"]);
    for view in layout["views"].as_array().unwrap() {
        let mut cells = std::collections::BTreeMap::new();
        for c in view["components"].as_array().unwrap() {
            let at = |k: &str| c[k].as_u64().unwrap();
            for x in at("x")..at("x") + at("w") {
                for y in at("y")..at("y") + at("h") {
                    let taken = cells.insert((x, y), c["id"].as_str().unwrap());
                    assert_eq!(taken, None, "{} overlaps at {x},{y}", c["id"]);
                }
            }
        }
        let rows = cells.keys().map(|(_, y)| y + 1).max().unwrap();
        assert_eq!(
            cells.len() as u64,
            12 * rows,
            "view {} leaves a hole",
            view["id"]
        );
    }
}

#[test]
fn typed_injections_and_zero_give_the_workbook_ubar_column() {
    let (engine, _dir, id) = imported();
    let mut view = Value::Null;
    for (step, mv) in INJECTIONS {
        view = typed(&engine, &id, step, json!({"m44": mv}));
    }
    let ubar_per_ul = &view["parameters"]["ubar_per_ul"];
    assert_close(&ubar_per_ul["value"], 92.2 * 10.0 / 1.38, "µbar per µl");
    assert_close(
        &view["parameters"]["ubar_per_mv"]["value"],
        UBAR_PER_MV,
        "µbar per mV (P14)",
    );

    typed(&engine, &id, "co2_zero", json!({"co2_zero_mv": 0.303}));
    // Sheet 150-pl1 row 2 is raw row 6765, at 3381.772 s: m44 0.838753699299446.
    let row = reading(&engine, &id, "leaf.compensation", MS, [3381.7, 3381.8]);
    let one = &row["steps"]["leaf.compensation"]["reading"]["values"]["plateau_ubar"];
    assert_eq!(one["n"], 1);
    assert_close(&one["value"], 981.0252143648033, "150-pl1 E2");
}

#[test]
fn leaf_rates_are_uptake_positive_and_per_m2_waits_for_the_disc_area() {
    let (engine, _dir, id) = imported();
    let type_reading =
        |step: &str, name: &str, v: f64| typed(&engine, &id, step, json!({ name: v }));
    type_reading("leaf.dark", "dark_slope", 0.02);
    type_reading("leaf.uptake", "closed_slope", -18.0);
    let view = type_reading("leaf.compensation", "plateau_ubar", 6.0);
    let results = &view["drafts"]["leaf"]["results"];
    assert_close(&results["respiration_ubar_s"], 0.02, "release positive");
    assert_close(&results["uptake_ubar_s"], 18.0, "uptake positive");
    assert_eq!(results["uptake_umol_s"], Value::Null, "no temperature yet");

    let view = record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "temp_c", "value": 25}),
    );
    let umol_per_ubar = 0.1 * 1.38 / (8.314462618 * 298.15);
    let results = &view["drafts"]["leaf"]["results"];
    assert_close(&results["uptake_umol_s"], 18.0 * umol_per_ubar, "pV/RT");
    assert_eq!(results["uptake_m2"], Value::Null, "no disc area yet");

    record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "leaf_area_cm2", "value": 2.0}),
    );
    let view = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "leaf", "labels": {"leaf_name": "150-pl1"}}),
    );
    let row = &view["tables"]["leaf"]["rows"][0]["results"];
    assert_close(&row["uptake_m2"], 18.0 * umol_per_ubar / 2e-4, "µmol/m²/s");
    assert_close(&row["compensation_ubar"], 6.0, "compensation point");
}

/// `(S - 815.52) / R` of every row of the pl1 CSV inside the range.
fn fluorescence_in(range_s: [f64; 2]) -> Vec<f64> {
    let text = std::fs::read_to_string(pl1_csv()).unwrap();
    text.lines()
        .skip(1)
        .filter_map(|line| {
            let f: Vec<&str> = line.split(',').collect();
            let t = f[0].parse::<f64>().ok()? / 1000.0;
            let (s, r): (f64, f64) = (f[2].parse().ok()?, f[3].parse().ok()?);
            (range_s[0]..=range_s[1])
                .contains(&t)
                .then_some((s - 815.52) / r)
        })
        .collect()
}

#[test]
fn a_flash_row_reads_fm_prime_as_the_flash_maximum_and_gives_phi_psii() {
    let (engine, _dir, id) = imported();
    // The first flash turns the red LED to 2500 at 212.164 s on the Ambit clock.
    let (before, during) = ([210.0, 212.12], [212.16, 213.56]);
    reading(&engine, &id, "flash.fs", LIGHT, before);
    let view = reading(&engine, &id, "flash.fm", LIGHT, during);
    let fm = &view["steps"]["flash.fm"]["reading"]["values"]["fm_max"];
    let rows = fluorescence_in(during);
    assert_eq!(fm["n"], rows.len());
    let max = rows.iter().copied().fold(f64::MIN, f64::max);
    assert_close(&fm["value"], max, "Fm' is the highest row of the flash");

    typed(&engine, &id, "flash.fs", json!({"fs_mean": 4.32}));
    typed(&engine, &id, "flash.fm", json!({"fm_max": 7.0}));
    let view = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "flash", "labels": {"flash_name": "1"}}),
    );
    let row = &view["tables"]["flash"]["rows"][0]["results"];
    assert_close(&row["fs"], 4.32, "Fs");
    assert_close(&row["fm_prime"], 7.0, "Fm'");
    assert_close(&row["phi_psii"], (7.0 - 4.32) / 7.0, "PhiPSII");
}
