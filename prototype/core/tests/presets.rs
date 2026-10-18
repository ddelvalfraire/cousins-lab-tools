//! The legacy module presets over the lab's sample zip, checked against values computed here
//! straight from the frame files.

use std::sync::OnceLock;

use cousinslab::api::Engine;
use cousinslab::legacy_frames::{FrameRecording, read_frames};
use cousinslab::templates::Paths;
use serde_json::{Value, json};

const CAPTURE: &str = "ms-sampledata";

const M32: usize = 0;
const M44: usize = 3;

fn sample() -> &'static FrameRecording {
    static SAMPLE: OnceLock<FrameRecording> = OnceLock::new();
    SAMPLE.get_or_init(|| read_frames(&sample_path()).unwrap())
}

fn sample_path() -> std::path::PathBuf {
    Paths::default().repo.join("module2/SampleData.zip")
}

fn call(engine: &Engine, command: &str, args: Value) -> Value {
    engine
        .call(command, args)
        .unwrap_or_else(|e| panic!("{command} failed: {e:?}"))
}

/// An engine over the built-in templates with the sample zip imported under `template`.
fn imported(template: &str) -> (Engine, tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), dir.path()).unwrap();
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": template, "files": [{"role": "ms", "path": sample_path()}]}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    (engine, dir, id)
}

fn record(engine: &Engine, id: &str, request: Value) -> Value {
    let mut args = request;
    args["session_id"] = json!(id);
    call(engine, "record_analysis", args)
}

fn reading(engine: &Engine, id: &str, step: &str, range_s: [f64; 2]) -> Value {
    record(
        engine,
        id,
        json!({"action": "reading", "step": step, "capture": CAPTURE, "range_s": range_s}),
    )
}

/// `(t_s, value)` of every sample row with `t_ms / 1000` inside the range, ends included.
fn rows_in(range_s: [f64; 2], value: impl Fn(&[f64; 8]) -> f64) -> Vec<(f64, f64)> {
    sample()
        .rows
        .iter()
        .map(|r| (r.t_ms as f64 / 1000.0, r))
        .filter(|(t, _)| (range_s[0]..=range_s[1]).contains(t))
        .map(|(t, r)| (t, value(&r.masses)))
        .collect()
}

fn hand_mean(range_s: [f64; 2], mass: usize) -> (f64, usize) {
    let values = rows_in(range_s, |m| m[mass]);
    let sum: f64 = values.iter().map(|(_, v)| v).sum();
    (sum / values.len() as f64, values.len())
}

/// Least-squares slope and intercept of y on x.
fn hand_line(points: &[(f64, f64)]) -> (f64, f64) {
    let n = points.len() as f64;
    let (mx, my) = (
        points.iter().map(|p| p.0).sum::<f64>() / n,
        points.iter().map(|p| p.1).sum::<f64>() / n,
    );
    let sxy: f64 = points.iter().map(|(x, y)| (x - mx) * (y - my)).sum();
    let sxx: f64 = points.iter().map(|(x, _)| (x - mx) * (x - mx)).sum();
    let slope = sxy / sxx;
    (slope, my - slope * mx)
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

fn chart_points<'a>(charts: &'a Value, id: &str, series: usize) -> &'a [Value] {
    let chart = charts["charts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id)
        .unwrap_or_else(|| panic!("no chart {id}"));
    chart["series"][series]["points"].as_array().unwrap()
}

fn points_between(points: &[Value], from: f64, to: f64) -> Vec<f64> {
    points
        .iter()
        .filter(|p| (from..=to).contains(&p[0].as_f64().unwrap()))
        .map(|p| p[1].as_f64().unwrap())
        .collect()
}

/// Air-saturated O2 at `t` °C, the polynomial modules 1 and 2 share.
fn o2_air(t: f64) -> f64 {
    -0.0018 * t * t * t + 0.2229 * t * t - 12.387 * t + 456.49
}

/// The second CO2 staircase of the sample (about -19, 39, 96 and 152 mV), read as the 0 to
/// 3 µl injections, then a sample on the 42 mV plateau.
const M2_CAL: [(&str, [f64; 2], f64); 4] = [
    ("co2.zero", [880.0, 895.0], 0.0),
    ("co2.ul1", [925.0, 948.0], 1.0),
    ("co2.ul2", [970.0, 1005.0], 2.0),
    ("co2.ul3", [1030.0, 1065.0], 3.0),
];
const M2_SAMPLE: [f64; 2] = [2800.0, 3000.0];

#[test]
fn module2_calibrates_on_the_sample_staircase_and_recomputes_ubar_from_the_first_row() {
    let (engine, _dir, id) = imported("legacy-module2-co2-o2");
    let mut view = Value::Null;
    let mut cal = Vec::new();
    for (step, range, known) in M2_CAL {
        view = reading(&engine, &id, step, range);
        let (mean, n) = hand_mean(range, M44);
        let read = &view["steps"][step]["reading"]["values"]["m44"];
        assert_close(&read["value"], mean, step);
        assert_eq!(read["n"], n, "{step}");
        cal.push((mean, known));
    }
    let (slope, intercept) = hand_line(&cal);
    let fit = &view["fits"]["co2"];
    assert_eq!(
        (fit["n"].clone(), fit["missing"].clone()),
        (json!(4), json!([]))
    );
    assert_close(
        &view["parameters"]["co2_ul_per_mv"]["value"],
        slope,
        "slope",
    );
    assert_close(
        &view["parameters"]["co2_cal_intercept_ul"]["value"],
        intercept,
        "intercept in µl (B1)",
    );
    let pct_per_mv = slope / 28.0;
    let computed = &view["parameters"]["co2_pct_per_mv"];
    assert_close(&computed["value"], pct_per_mv, "%CO2/mV");
    assert_eq!(computed["source"], "computed");
    let legacy = 0.000_628_510_3;
    assert!(
        (pct_per_mv - legacy).abs() < 0.005 * legacy,
        "{pct_per_mv} is near the legacy mean-of-steps value"
    );
    let xy = &view["xy"]["co2_cal"]["series"][0];
    assert_eq!(xy["points"].as_array().unwrap().len(), 4);
    assert_close(&xy["points"][3][0], cal[3].0, "3 µl point x");
    assert!(xy["line"].is_array(), "the fit line is drawn");

    let zero = reading(&engine, &id, "co2_zero", M2_CAL[0].1);
    let (zero_mv, _) = hand_mean(M2_CAL[0].1, M44);
    assert_close(&zero["parameters"]["co2_zero_mv"]["value"], zero_mv, "zero");

    let charts = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    let pressure = chart_points(&charts, "pressure", 0);
    let first = &sample().rows[0];
    assert_eq!(
        pressure[0][0], 0.105,
        "rows before the calibration are recomputed (B13)"
    );
    assert_close(
        &pressure[0][1],
        pct_per_mv * (first.masses[M44] - zero_mv) * 9200.0,
        "µbar of the first row",
    );
    let derivative = chart_points(&charts, "pressure_derivative", 0);
    let start = derivative[0][0].as_f64().unwrap();
    assert!(
        (5.105..5.3).contains(&start),
        "the rate starts with the first full 5 s window, at {start}"
    );
    let rising = points_between(derivative, 905.0, 910.0);
    let falling = points_between(derivative, 1104.0, 1108.0);
    assert!(
        !rising.is_empty() && rising.iter().all(|d| *d > 0.0),
        "{rising:?}"
    );
    assert!(
        !falling.is_empty() && falling.iter().all(|d| *d < 0.0),
        "{falling:?}"
    );
}

#[test]
fn module2_adds_a_sample_row_with_co2_and_o2_from_the_entered_temperature() {
    let (engine, _dir, id) = imported("legacy-module2-co2-o2");
    for (step, range, _) in M2_CAL {
        reading(&engine, &id, step, range);
    }
    reading(&engine, &id, "co2_zero", M2_CAL[0].1);
    reading(&engine, &id, "o2_zero", M2_CAL[0].1);
    reading(&engine, &id, "sample.co2", M2_SAMPLE);
    let partial = reading(&engine, &id, "sample.o2", M2_SAMPLE);
    assert_eq!(
        partial["drafts"]["sample"]["results"]["o2"],
        Value::Null,
        "no temperature yet, so no O2 (B19)"
    );
    assert_eq!(partial["parameters"]["o2_cal"]["source"], "unset");
    record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "temp_c", "value": 25}),
    );
    let view = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "sample"}),
    );

    let cal: Vec<(f64, f64)> = M2_CAL
        .iter()
        .map(|(_, range, known)| (hand_mean(*range, M44).0, *known))
        .collect();
    let pct_per_mv = hand_line(&cal).0 / 28.0;
    let (zero_mv, _) = hand_mean(M2_CAL[0].1, M44);
    let (o2_zero, _) = hand_mean(M2_CAL[0].1, M32);
    let (co2_mv, _) = hand_mean(M2_SAMPLE, M44);
    let (o2_mv, _) = hand_mean(M2_SAMPLE, M32);
    let pct = pct_per_mv * (co2_mv - zero_mv);
    let table = &view["tables"]["sample"];
    let keys: Vec<&Value> = table["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| &c["key"])
        .collect();
    assert_eq!(keys, ["pct_co2", "ubar_co2_sample", "o2"]);
    let row = &table["rows"][0]["results"];
    assert_close(&row["pct_co2"], pct, "%CO2");
    assert_close(&row["ubar_co2_sample"], pct * 9200.0, "µbar CO2");
    assert_close(&row["o2"], o2_air(25.0) / o2_zero * o2_mv, "O2");
    assert_eq!(table["rows"].as_array().unwrap().len(), 1);
}
