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

#[test]
fn module2_typed_zero_and_points_give_the_results_of_readings_with_those_means() {
    let (engine, _dir, read_id) = imported("legacy-module2-co2-o2");
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": "legacy-module2-co2-o2", "files": [{"role": "ms", "path": sample_path()}]}),
    );
    let typed_id = manifest["id"].as_str().unwrap();
    for (step, range, _) in M2_CAL {
        reading(&engine, &read_id, step, range);
        let (mean, _) = hand_mean(range, M44);
        let typed = json!({"action": "typed", "step": step, "values": {"m44": mean}});
        record(&engine, typed_id, typed);
    }
    let (zero_mv, _) = hand_mean(M2_CAL[0].1, M44);
    reading(&engine, &read_id, "co2_zero", M2_CAL[0].1);
    let typed = json!({"action": "typed", "step": "co2_zero", "values": {"co2_zero_mv": zero_mv}});
    record(&engine, typed_id, typed);
    let by_reading = reading(&engine, &read_id, "sample.co2", M2_SAMPLE);
    let by_typing = reading(&engine, typed_id, "sample.co2", M2_SAMPLE);

    assert_eq!(by_typing["steps"]["co2_zero"]["source"], "typed");
    assert_eq!(by_typing["steps"]["co2.ul3"]["source"], "typed");
    assert_eq!(by_typing["fits"], by_reading["fits"]);
    for name in [
        "co2_ul_per_mv",
        "co2_cal_intercept_ul",
        "co2_pct_per_mv",
        "co2_zero_mv",
    ] {
        let (typed, read) = (
            &by_typing["parameters"][name],
            &by_reading["parameters"][name],
        );
        assert_eq!(typed["value"], read["value"], "{name}");
        assert_eq!(typed["source"], read["source"], "{name}");
    }
    let results = &by_typing["drafts"]["sample"]["results"];
    assert_eq!(*results, by_reading["drafts"]["sample"]["results"]);
    assert!(results["pct_co2"].as_f64().unwrap() > 0.0, "{results}");
}

const M45: usize = 4;
const M47: usize = 6;
const M49: usize = 7;

/// Atom% 49 with negative masses counted as 0, as module 3 and the spreadsheet compute it.
fn atom49(m: &[f64; 8]) -> Option<f64> {
    let (m45, m47, m49) = (m[M45].max(0.0), m[M47].max(0.0), m[M49].max(0.0));
    let total = m45 + m47 + m49;
    (total != 0.0).then(|| 100.0 * m49 / total)
}

/// Per sample row, `(t_s, rate)`: the least-squares slope of ln(atom% 49) over the trailing
/// 12 s, once 12 s have been recorded and the window holds at least 60 values.
fn hand_log_rates() -> &'static [(f64, Option<f64>)] {
    static RATES: OnceLock<Vec<(f64, Option<f64>)>> = OnceLock::new();
    RATES.get_or_init(|| {
        let logs: Vec<(f64, Option<f64>)> = sample()
            .rows
            .iter()
            .map(|r| {
                let ln = atom49(&r.masses).filter(|a| *a > 0.0).map(f64::ln);
                (r.t_ms as f64 / 1000.0, ln)
            })
            .collect();
        let first = logs[0].0;
        let mut start = 0;
        logs.iter()
            .enumerate()
            .map(|(i, &(t, _))| {
                while logs[start].0 < t - 12.0 {
                    start += 1;
                }
                let window: Vec<(f64, f64)> = logs[start..=i]
                    .iter()
                    .filter_map(|&(t, v)| v.map(|v| (t, v)))
                    .collect();
                let full = first <= t - 12.0 && window.len() >= 60;
                (t, full.then(|| hand_line(&window).0))
            })
            .collect()
    })
}

fn row_index(t_s: &Value) -> usize {
    let t_ms = (t_s.as_f64().unwrap() * 1000.0).round() as i64;
    sample()
        .rows
        .binary_search_by_key(&t_ms, |r| r.t_ms)
        .unwrap_or_else(|_| panic!("no sample row at {t_s} s"))
}

#[test]
fn module3_plots_atom_percent_and_the_rate_of_its_log_from_every_stored_row() {
    let (engine, _dir, id) = imported("legacy-module3-atom49");
    let charts = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    let atom = chart_points(&charts, "atom49", 0);
    let first = atom[0][0].as_f64().unwrap();
    assert!(
        first < 5.0,
        "atom% plots from the first decimation bucket, at {first}"
    );
    for point in atom {
        let row = &sample().rows[row_index(&point[0])];
        assert_close(&point[1], atom49(&row.masses).unwrap(), "atom% 49 (B23)");
    }
    let rates = chart_points(&charts, "atom49_rate", 0);
    let first = rates[0][0].as_f64().unwrap();
    assert!(
        (12.105..12.3).contains(&first),
        "only full 12 s windows emit (B25), first at {first}"
    );
    for point in rates {
        let (_, rate) = hand_log_rates()[row_index(&point[0])];
        assert_close(&point[1], rate.unwrap(), "d ln(atom% 49)/dt");
    }
}

#[test]
fn module3_get_mean_averages_the_rate_over_the_selected_rows() {
    let (engine, _dir, id) = imported("legacy-module3-atom49");
    let range = [2000.0, 2100.0];
    let inside: Vec<f64> = hand_log_rates()
        .iter()
        .filter(|(t, _)| (range[0]..=range[1]).contains(t))
        .filter_map(|(_, rate)| *rate)
        .collect();
    let mean = inside.iter().sum::<f64>() / inside.len() as f64;

    let view = reading(&engine, &id, "rate_mean", range);
    let read = &view["steps"]["rate_mean"]["reading"]["values"]["mean_rate"];
    assert_close(&read["value"], mean, "Get Mean (B22)");
    assert_eq!(read["n"], inside.len());
    assert_close(
        &view["drafts"]["rate_mean"]["results"]["mean"],
        mean,
        "draft",
    );
    let added = record(
        &engine,
        &id,
        json!({"action": "add_row", "measurement": "rate_mean", "labels": {"sample_name": "leaf 1"}}),
    );
    let row = &added["tables"]["rate_mean"]["rows"][0];
    assert_eq!(row["labels"], json!({"sample_name": "leaf 1"}));
    assert_close(&row["results"]["mean"], mean, "table row");
}

fn hand_slope(range_s: [f64; 2], mass: usize) -> f64 {
    hand_line(&rows_in(range_s, |m| m[mass])).0
}

/// The first mass 44 staircase of the sample (about 7, 53, 96 and 137 mV), read as the
/// bicarbonate additions. The second staircase serves as the assay buffer CO2 injections.
const M1_BICARB: [(&str, [f64; 2], f64); 4] = [
    ("bicarb.zero", [480.0, 499.0], 0.0),
    ("bicarb.ul2", [520.0, 545.0], 33.3),
    ("bicarb.ul4", [568.0, 588.0], 66.6),
    ("bicarb.ul6", [612.0, 650.0], 99.9),
];
const M1_BLANK: [f64; 2] = [720.0, 765.0];
const M1_EXTRACTS: [[f64; 2]; 2] = [[4100.0, 4600.0], [6000.0, 6600.0]];

#[test]
fn module1_extract_rows_fill_the_velocity_chart_from_both_calibrations_and_the_blank() {
    let (engine, _dir, id) = imported("legacy-module1-rubisco");
    let zero_range = M2_CAL[0].1;
    reading(&engine, &id, "o2_zero", zero_range);
    record(
        &engine,
        &id,
        json!({"action": "entry", "parameter": "temp_c", "value": 25}),
    );
    let assay: Vec<(&str, [f64; 2], f64)> = M2_CAL
        .iter()
        .zip(["zero", "ul6", "ul12", "ul18"])
        .map(|((_, range, known), point)| (point, *range, known * 1000.0))
        .collect();
    for (point, range, _) in &assay {
        reading(&engine, &id, &format!("co2_assay.{point}"), *range);
    }
    for (step, range, _) in M1_BICARB {
        reading(&engine, &id, step, range);
    }
    reading(&engine, &id, "co2_zero", zero_range);
    let blanked = reading(&engine, &id, "blank", M1_BLANK);

    let line = |points: &[([f64; 2], f64)]| {
        let cal: Vec<(f64, f64)> = points
            .iter()
            .map(|(range, known)| (hand_mean(*range, M44).0, *known))
            .collect();
        hand_line(&cal)
    };
    let (co2_cal, co2_intercept) = line(&assay.iter().map(|a| (a.1, a.2)).collect::<Vec<_>>());
    let (bicarb_cal, _) = line(&M1_BICARB.map(|b| (b.1, b.2)));
    let params = &blanked["parameters"];
    assert_close(&params["co2_cal"]["value"], co2_cal, "CO2 cal");
    assert_close(
        &params["co2_cal_intercept"]["value"],
        co2_intercept,
        "intercept (B1)",
    );
    assert_close(&params["bicarb_cal"]["value"], bicarb_cal, "BiCarb cal");
    let ratio = co2_cal / bicarb_cal;
    assert_close(&params["bicarb_per_co2"]["value"], ratio, "BiCarb/CO2");
    let o2_cal = o2_air(25.0) / hand_mean(zero_range, M32).0;
    assert_close(&params["o2_cal"]["value"], o2_cal, "O2 calibration");
    let (co2_blank, o2_blank) = (hand_slope(M1_BLANK, M44), hand_slope(M1_BLANK, M32));
    assert_close(&params["co2_blank"]["value"], co2_blank, "CO2 blank (B8)");
    assert_close(&params["o2_blank"]["value"], o2_blank, "O2 blank (B8)");
    for chart in ["assay_buffer", "hcl"] {
        let series = &blanked["xy"][chart]["series"][0];
        assert_eq!(series["points"].as_array().unwrap().len(), 4, "{chart}");
        assert!(series["line"].is_array(), "{chart}");
    }

    let zero44 = hand_mean(zero_range, M44).0;
    let mut expected = Vec::new();
    let mut view = Value::Null;
    for range in M1_EXTRACTS {
        reading(&engine, &id, "extract", range);
        view = record(
            &engine,
            &id,
            json!({"action": "add_row", "measurement": "extract"}),
        );
        let o2_net = hand_slope(range, M32) - o2_blank;
        let co2_net = hand_slope(range, M44) - co2_blank;
        let v0 = -o2_net * o2_cal;
        let vc = -co2_net * co2_cal;
        let co2 = co2_cal * (hand_mean(range, M44).0 - zero44) / ratio;
        let o2 = o2_cal * hand_mean(range, M32).0;
        expected.push((v0, vc, co2, o2, co2_net, o2_net));
    }
    let rows = view["tables"]["extract"]["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let velocity = &view["xy"]["velocity"]["series"];
    for (i, (v0, vc, co2, o2, co2_net, o2_net)) in expected.into_iter().enumerate() {
        let row = &rows[i]["results"];
        assert_close(&row["co2_net"], co2_net, "CO2 net rate");
        assert_close(&row["o2_net"], o2_net, "O2 net rate");
        assert_close(&row["v0"], v0, "V0");
        assert_close(&row["vc"], vc, "Vc");
        assert_close(&row["co2_conc"], co2, "[CO2]");
        assert_close(&row["o2_conc"], o2, "[O2]");
        assert_eq!(velocity[0]["points"][i], json!([row["o2_conc"], row["v0"]]));
        assert_eq!(
            velocity[1]["points"][i],
            json!([row["co2_conc"], row["vc"]])
        );
    }
    assert_eq!(velocity[0]["name"], "V0 vs [O2]");
    assert_eq!(velocity[1]["name"], "Vc vs [CO2]");
}

fn wait_until(what: &str, mut done: impl FnMut() -> bool) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    while !done() {
        assert!(
            std::time::Instant::now() < deadline,
            "timed out waiting for {what}"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

#[test]
fn a_preset_role_offers_every_profile_whose_columns_cover_it_and_saves_with_one() {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), dir.path()).unwrap();
    let ids = |template: &str, role: &str| -> Vec<String> {
        let view = call(&engine, "get_template", json!({"template_id": template}));
        serde_json::from_value(view["compatible_instruments"][role].clone()).unwrap()
    };
    for preset in [
        "legacy-module1-rubisco",
        "legacy-module2-co2-o2",
        "legacy-module3-atom49",
    ] {
        assert_eq!(
            ids(preset, "ms"),
            ["ms-ezview-spool-masses", "ms-legacy-frames-replay"],
            "{preset}"
        );
    }
    assert_eq!(
        ids("jii-leaf-co2-fluorescence", "ms"),
        [
            "ms-ezview-spool-masses",
            "ms-legacy-frames-replay",
            "ms2-ezview",
            "ms2-ezview-simulated"
        ]
    );
    assert_eq!(
        ids("jii-leaf-co2-fluorescence", "light"),
        ["ambit-replay-150-pl1", "ambit-replay-150-pl2"]
    );

    let view = call(
        &engine,
        "get_template",
        json!({"template_id": "legacy-module2-co2-o2"}),
    );
    let mut data = view["data"].clone();
    data["roles"]["ms"]["instrument"] = json!("ms2-ezview");
    let refused = engine
        .call(
            "save_template",
            json!({"template_id": "legacy-module2-co2-o2", "data": data}),
        )
        .unwrap_err();
    assert!(
        refused
            .message
            .contains("Chart raw: 'm32' is not a column or derived value of ms"),
        "{}",
        refused.message
    );
    data["roles"]["ms"]["instrument"] = json!("ms-ezview-spool-masses");
    let saved = call(
        &engine,
        "save_template",
        json!({"template_id": "legacy-module2-co2-o2", "data": data}),
    );
    assert_eq!(saved["data"]["revision"], 2);
}

#[test]
fn module2_on_the_eight_mass_spool_profile_reads_a_spool_file_with_the_legacy_channels() {
    let dir = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), dir.path()).unwrap();
    let view = call(
        &engine,
        "get_template",
        json!({"template_id": "legacy-module2-co2-o2"}),
    );
    let mut data = view["data"].clone();
    data["roles"]["ms"]["instrument"] = json!("ms-ezview-spool-masses");
    call(
        &engine,
        "save_template",
        json!({"template_id": "legacy-module2-co2-o2", "data": data}),
    );
    let spool =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spool/packed.txt");
    let fast = engine
        .call(
            "start_run",
            json!({"template_id": "legacy-module2-co2-o2", "speed": 20.0, "sources": {"ms": spool}}),
        )
        .unwrap_err();
    assert!(fast.message.contains("real time"), "{}", fast.message);
    let manifest = call(
        &engine,
        "start_run",
        json!({"template_id": "legacy-module2-co2-o2", "speed": 1.0, "sources": {"ms": spool}}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    let ms = &manifest["captures"]["ms"];
    assert_eq!(ms["input_kind"], "hardware");
    assert_eq!(ms["readiness"]["ok"], true);
    assert_eq!(ms["clocks"][2]["column"], "t_legacy_ms");
    assert_eq!(ms["clocks"][2]["kind"], "elapsed");
    let live = || call(&engine, "session_live", json!({"session_id": id}));
    wait_until("the spool's frames", || {
        live()["captures"]["ms"]["rows"].as_array().unwrap().len() >= 3
    });
    let row = live()["captures"]["ms"]["rows"][0].clone();
    assert!(row["m44"].is_number() && row["m32"].is_number(), "{row}");
    call(&engine, "stop_session", json!({"session_id": id}));
    wait_until("the run to stop", || {
        !call(&engine, "get_session", json!({"session_id": id}))["live"]
            .as_bool()
            .unwrap()
    });
    let stored = call(
        &engine,
        "query_session",
        json!({"session_id": id, "sql":
        "SELECT m32 = ch5 AND m34 = ch2 AND m36 = ch4 AND m44 = ch3 AND m45 = ch1 \
         AND m46 = ch6 AND m47 = ch7 AND m49 = ch8 AND t_ms = t_legacy_ms AS mapped, \
         ch3 FROM \"cap:ms\" ORDER BY seq"}),
    );
    let stored = stored["rows"].as_array().unwrap();
    assert!(stored.len() >= 3);
    assert!(stored.iter().all(|r| r["mapped"] == true), "{stored:?}");
    assert!(stored.iter().any(|r| r["ch3"].as_f64() > Some(0.0)));
}
