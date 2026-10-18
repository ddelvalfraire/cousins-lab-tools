//! Real recorded files, imported and aligned the way the researcher aligned them in Excel.
//!
//! The workbook's sheets 150-pl1 and 150-pl2 re-zero the mass-spec time at rows 7405 and
//! 9683 (3701.772 s and 4840.772 s) and compute ubar CO2 = (m44 - mzero) * 1831.11 with
//! mzero 0.303 and 0.302. Entering those as explicit event times and trial parameters must
//! reproduce both sheets, while the stored data keeps its original times.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use cousinslab::alignment::{
    Alignment, Inputs, Member, Series, Unaligned, aligned_sql, chart_data, create_aligned_view,
    list_alignments, load_alignment, metric_series, propose, save_alignment,
};
use cousinslab::calc::Program;
use cousinslab::export::export_aligned;
use cousinslab::importing::{ImportError, ImportFile, import_session};
use cousinslab::ms_workbook::read_sample_sheet;
use cousinslab::query::{AnalysisError, SessionDb, run_query, session_events};
use cousinslab::session::{Manifest, SessionStore, segment_rows, segments, sha256};
use cousinslab::templates::{Paths, Template, TemplateStore, from_snapshot};
use serde_json::{Value, json};
use sha2::Digest;

const TEMPLATE: &str = "jii-leaf-co2-fluorescence";

fn reference(path: &str) -> PathBuf {
    Paths::default()
        .repo
        .join("reference/instruments")
        .join(path)
}

fn workbook() -> PathBuf {
    reference("mass-spec/Raw data-mass spec.xlsx")
}

fn files() -> Vec<ImportFile> {
    let file = |role: &str, path: PathBuf, label: &str| ImportFile {
        role: role.into(),
        path,
        label: Some(label.into()),
    };
    vec![
        file("ms", workbook(), "workbook"),
        file(
            "light",
            reference("ambit/Ambit raw data_sample_150_pl1.csv"),
            "150-pl1",
        ),
        file(
            "light",
            reference("ambit/Ambit raw data_sample_150_pl2.csv"),
            "150-pl2",
        ),
    ]
}

fn template(data_dir: &Path) -> Template {
    TemplateStore::new(Paths::default(), data_dir)
        .get(TEMPLATE, None)
        .unwrap()
}

struct Imported {
    store: SessionStore,
    manifest: Manifest,
}

impl Imported {
    fn session_dir(&self) -> PathBuf {
        self.store.path(&self.manifest.id)
    }
}

/// One import shared by every test: reading the workbook is the slow part.
fn imported() -> &'static Imported {
    static IMPORTED: OnceLock<Imported> = OnceLock::new();
    IMPORTED.get_or_init(|| {
        let data = Path::new(env!("CARGO_TARGET_TMPDIR")).join("import_alignment");
        let _ = fs::remove_dir_all(&data);
        let store = SessionStore::new(&data).unwrap();
        let manifest =
            import_session(&store, &template(&data), "Sample 150 import", &files()).unwrap();
        Imported { store, manifest }
    })
}

#[test]
fn imported_captures_match_what_the_python_engine_recorded() {
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/python-import-captures.json");
    let repo = Paths::default().repo;
    let python: Value = serde_json::from_str(
        &fs::read_to_string(fixture)
            .unwrap()
            .replace("${repo}", &repo.to_string_lossy()),
    )
    .unwrap();
    let ours = serde_json::to_value(&imported().manifest.captures).unwrap();
    assert_eq!(ours, python);
    assert_eq!(
        serde_json::to_string(&ours).unwrap(),
        serde_json::to_string(&python).unwrap(),
        "keys in Python's order"
    );
}

#[test]
fn ambit_requested_versus_recorded_timing() {
    let timing = imported().manifest.captures["light-150-pl1"]
        .timing
        .clone()
        .unwrap();
    assert_eq!(
        (
            &timing["requested_samples"],
            &timing["recorded_samples"],
            &timing["missing_samples"]
        ),
        (&Value::from(8010), &Value::from(7956), &Value::from(54))
    );
    assert_eq!(timing["requested_s"], 755.5);
    assert!((timing["device_span_s"].as_f64().unwrap() - 756.109).abs() < 1e-9);
}

#[test]
fn each_capture_is_one_sample_part_with_its_source_copied() {
    let imported = imported();
    for (cid, capture) in &imported.manifest.captures {
        let cdir = imported.store.capture_dir(&imported.manifest.id, cid);
        let parts = segments(&cdir.join("samples")).unwrap();
        assert_eq!(parts.len(), 1, "{cid}");
        assert_eq!(segment_rows(&parts[0]).unwrap(), capture.rows, "{cid}");
        let source = &capture.sources[0];
        let copy = cdir.join("raw").join(&source.name);
        assert_eq!(sha256(&copy).ok(), source.sha256, "{cid}");
        assert_eq!(
            fs::metadata(&copy).unwrap().modified().unwrap(),
            fs::metadata(&source.path).unwrap().modified().unwrap(),
            "{cid}"
        );
        let events = segments(&cdir.join("events")).unwrap();
        assert_eq!(events.len(), usize::from(capture.role == "light"), "{cid}");
    }
    assert_eq!(
        imported.store.load(&imported.manifest.id).unwrap(),
        imported.manifest
    );
}

#[test]
fn a_bad_file_list_creates_no_session() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let template = template(data.path());
    let attempt = |files: &[ImportFile]| {
        import_session(&store, &template, "bad", files)
            .unwrap_err()
            .to_string()
    };
    let mut missing = files();
    missing[1].path = reference("ambit/no such file.csv");
    assert_eq!(
        attempt(&missing),
        format!("File not found: {}", missing[1].path.display())
    );
    let mut unknown = files();
    unknown[0].role = "spectrometer".into();
    assert_eq!(attempt(&unknown), "Not found: 'spectrometer'");
    let mut twice = files();
    twice[2].label = Some("150 pl1".into());
    assert!(matches!(
        import_session(&store, &template, "bad", &twice),
        Err(ImportError::DuplicateCapture(id)) if id == "light-150-pl1"
    ));
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn an_empty_label_falls_back_to_the_file_stem() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let pl1 = ImportFile {
        label: Some(String::new()),
        ..files()[1].clone()
    };
    let manifest = import_session(&store, &template(data.path()), "stem", &[pl1]).unwrap();
    let (cid, capture) = manifest.captures.first().unwrap();
    assert_eq!(cid, "light-ambit-raw-data-sample-150-pl1");
    assert_eq!(capture.label, "Ambit raw data_sample_150_pl1");
}

#[test]
fn original_timestamps_are_stored_unchanged() {
    let imported = imported();
    let db = SessionDb::open(&imported.session_dir(), &imported.manifest).unwrap();
    let con = db.connection();
    let ms: (f64, f64, i64) = con
        .query_row(
            r#"SELECT min(t_elapsed_s), max(t_elapsed_s), count(*) FROM "cap:ms-workbook""#,
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(ms, (0.272, 13429.272, 26859));
    let light: (i64, i64) = con
        .query_row(
            r#"SELECT min(t_device_ms), max(t_device_ms) FROM "cap:light-150-pl1""#,
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(light, (9, 756118));
}

#[test]
fn imported_events_keep_their_native_time_and_have_no_run_clock() {
    let imported = imported();
    let events = session_events(&imported.session_dir(), &imported.manifest).unwrap();
    let flashes: Vec<_> = events.iter().filter(|e| e.kind == "sat_flash").collect();
    let sources: std::collections::BTreeSet<&str> =
        flashes.iter().map(|e| e.source.as_str()).collect();
    assert_eq!(sources, ["light-150-pl1", "light-150-pl2"].into());
    assert!(
        flashes
            .iter()
            .all(|e| e.x_run_s.is_none() && e.t_host_utc.is_none() && e.t_native.unwrap() > 0.0)
    );
    for cid in sources {
        let times: Vec<f64> = flashes
            .iter()
            .filter(|e| e.source == cid)
            .map(|e| e.t_native.unwrap())
            .collect();
        assert_eq!(times.len(), 14, "{cid}");
        assert!(times.is_sorted(), "{cid}");
    }
    assert_eq!(
        events.len(),
        252,
        "every light change and flash, as Python lists them"
    );
}

fn inputs(reference: &str, entered: bool) -> Inputs {
    let mut inputs = json!({"reference": reference, "manual": {}, "trial_params": {}});
    if entered {
        inputs["manual"] = json!({
            "light-150-pl1": {"ms-workbook": {"clock": "t_elapsed_s", "zero": 3701.772, "method": "Workbook 150-pl1 zero (row 7405)"}},
            "light-150-pl2": {"ms-workbook": {"clock": "t_elapsed_s", "zero": 4840.772, "method": "Workbook 150-pl2 zero (row 9683)"}},
        });
        inputs["trial_params"] = json!({"light-150-pl2": {"co2_zero_mv": 0.302}});
    }
    serde_json::from_value(inputs).unwrap()
}

fn proposal(reference: &str, entered: bool) -> Alignment {
    let imported = imported();
    propose(
        &imported.session_dir(),
        &imported.manifest,
        inputs(reference, entered),
    )
    .unwrap()
}

fn aligned_db(alignment: &Alignment) -> SessionDb {
    let imported = imported();
    let mut db = SessionDb::open(&imported.session_dir(), &imported.manifest).unwrap();
    create_aligned_view(&mut db, &imported.manifest, alignment).unwrap();
    db
}

/// `pytest.approx(expected, rel, abs)`.
fn approx(got: f64, expected: f64, rel: f64, abs: f64) -> bool {
    (got - expected).abs() <= (rel * expected.abs()).max(abs)
}

/// Sheet times are exact half seconds; `+ 0.0` turns -0.0 into the key 0.0 has.
fn half_second_key(x: f64) -> u64 {
    ((x * 2.0).round_ties_even() / 2.0 + 0.0).to_bits()
}

#[test]
fn event_alignment_reproduces_both_workbook_sheets() {
    let imported = imported();
    let alignment = save_alignment(&imported.session_dir(), proposal("event", true)).unwrap();
    assert_eq!(alignment.unaligned, []);
    let db = aligned_db(&alignment);
    for (trial, sheet) in [("light-150-pl1", "150-pl1"), ("light-150-pl2", "150-pl2")] {
        let expected: HashMap<u64, f64> = read_sample_sheet(&workbook(), sheet)
            .unwrap()
            .into_iter()
            .map(|(x, ubar)| (half_second_key(x), ubar))
            .collect();
        let got: Vec<(f64, f64)> = db
            .connection()
            .prepare(
                "SELECT x_s, ubar_co2 FROM aligned WHERE trial = ? AND role = 'ms' ORDER BY x_s",
            )
            .unwrap()
            .query_map([trial], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(
            approx(got[0].0, -320.0, 0.0, 1e-9),
            "{trial} starts at {}",
            got[0].0
        );
        assert!(approx(got[got.len() - 1].0, 438.5, 0.0, 1e-9), "{trial}");
        assert_eq!(got.len(), 1518, "{trial}");
        for (x, ubar) in got {
            let want = expected[&half_second_key(x)];
            assert!(
                approx(ubar, want, 1e-12, 1e-9),
                "{trial} x={x}: {ubar} vs {want}"
            );
        }
    }
}

#[test]
fn ambit_zero_is_the_detected_fourth_flash_on_the_device_clock() {
    let alignment = proposal("event", true);
    let light: HashMap<&str, &Member> = alignment
        .trials
        .iter()
        .flat_map(|t| &t.members)
        .filter(|m| m.role == "light")
        .map(|m| (m.capture.as_str(), m))
        .collect();
    assert!(approx(light["light-150-pl1"].zero, 312.231, 1e-6, 1e-12));
    assert!(approx(light["light-150-pl2"].zero, 304.387, 1e-6, 1e-12));
    assert_eq!(light["light-150-pl1"].clock.column, "t_device_ms");
    assert!(light["light-150-pl1"].method.contains("Saturation flash 4"));
    assert!(approx(
        light["light-150-pl1"].uncertainty_s.unwrap(),
        0.1,
        0.0,
        0.002
    ));
}

#[test]
fn without_entered_event_times_the_mass_spec_is_left_unaligned() {
    let alignment = proposal("event", false);
    let reasons: HashMap<(&str, &str), &Unaligned> = alignment
        .unaligned
        .iter()
        .map(|u| ((u.trial.as_str(), u.capture.as_str()), u))
        .collect();
    let mut keys: Vec<_> = reasons.keys().copied().collect();
    keys.sort();
    assert_eq!(
        keys,
        [
            ("light-150-pl1", "ms-workbook"),
            ("light-150-pl2", "ms-workbook")
        ]
    );
    assert!(reasons.values().all(|u| u.needs_event_time));
    assert!(
        alignment
            .trials
            .iter()
            .flat_map(|t| &t.members)
            .all(|m| m.role == "light")
    );
}

#[test]
fn clock_alignment_is_refused_when_no_clock_time_was_recorded() {
    let alignment = proposal("clock", false);
    assert_eq!(alignment.trials[0].members, []);
    assert_eq!(alignment.unaligned.len(), 3);
    assert!(
        alignment
            .unaligned
            .iter()
            .all(|u| u.reason.contains("Records no clock time"))
    );
}

#[test]
fn elapsed_alignment_uses_each_instruments_own_start() {
    let alignment = proposal("elapsed", false);
    let zeros: HashMap<&str, (f64, &str)> = alignment
        .trials
        .iter()
        .flat_map(|t| &t.members)
        .map(|m| (m.capture.as_str(), (m.zero, m.clock.column.as_str())))
        .collect();
    assert_eq!(zeros["ms-workbook"], (0.0, "t_elapsed_s"));
    assert_eq!(zeros["light-150-pl1"], (0.0, "t_device_ms"));
}

#[test]
fn a_saved_alignment_loads_back_into_the_same_aligned_view() {
    let imported = imported();
    let saved = save_alignment(&imported.session_dir(), proposal("event", true)).unwrap();
    let loaded = load_alignment(&imported.session_dir(), saved.id.as_deref().unwrap()).unwrap();
    assert_eq!(loaded, saved);
    let n: i64 = aligned_db(&loaded)
        .connection()
        .query_row("SELECT count(*) FROM aligned WHERE role = 'ms'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(n, 2 * 1518);
    assert!(
        list_alignments(&imported.session_dir())
            .unwrap()
            .contains(&saved)
    );
}

/// Python's proposals with integers written as floats: the window [-320, 438.5] is the only
/// place the two engines write a number differently.
fn as_floats(value: Value) -> Value {
    match value {
        Value::Number(n) => n.as_f64().map_or(Value::Number(n), Value::from),
        Value::Array(items) => Value::Array(items.into_iter().map(as_floats).collect()),
        Value::Object(map) => {
            Value::Object(map.into_iter().map(|(k, v)| (k, as_floats(v))).collect())
        }
        other => other,
    }
}

#[test]
fn proposals_match_the_python_engine_key_for_key() {
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/python-proposals.json");
    let python: Value = serde_json::from_str(&fs::read_to_string(fixture).unwrap()).unwrap();
    for (name, reference, entered) in [
        ("event", "event", true),
        ("event_without_entered_times", "event", false),
        ("clock", "clock", false),
        ("elapsed", "elapsed", false),
    ] {
        let ours = as_floats(serde_json::to_value(proposal(reference, entered)).unwrap());
        let theirs = as_floats(python[name].clone());
        assert_eq!(
            serde_json::to_string(&ours).unwrap(),
            serde_json::to_string(&theirs).unwrap(),
            "{name}"
        );
    }
}

/// The view's text is pinned so that its column order, which the aligned CSV header follows,
/// cannot move by accident. The fixture began as the Python engine's SQL and now holds ours,
/// with derived values read from the `calc:` tables instead of inlined arithmetic.
#[test]
fn aligned_sql_is_pinned_byte_for_byte() {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/python-aligned.sql");
    let expected = fs::read_to_string(fixture).unwrap();
    let alignment = Alignment {
        id: Some("aln-20261017-044254-event".into()),
        ..proposal("event", true)
    };
    assert_eq!(
        aligned_sql(&imported().manifest, &alignment).unwrap(),
        expected.trim_end()
    );
}

/// SHA-256 of Python's `chart_data` for the entered-zero event alignment, as compact JSON.
const PYTHON_CHARTS_SHA256: &str =
    "b66160425b6e2901f7a21875735cedf46e6e1191b948b0e672211153dd9208fe";

#[test]
fn chart_data_is_pythons_point_for_point() {
    let imported = imported();
    let alignment = proposal("event", true);
    let charts = chart_data(&imported.session_dir(), &imported.manifest, &alignment).unwrap();
    let shape: Vec<(&str, Vec<usize>, usize)> = charts
        .iter()
        .map(|c| {
            (
                c.id.as_str(),
                c.series.iter().map(|s| s.points.len()).collect(),
                c.markers.len(),
            )
        })
        .collect();
    assert_eq!(
        shape,
        [
            ("co2", vec![1518, 1518], 0),
            ("fluorescence", vec![4000, 4000], 28),
            ("mass44", vec![1518, 1518], 0)
        ]
    );
    let json = serde_json::to_string(&charts).unwrap();
    let digest = sha2::Sha256::digest(json.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(hex, PYTHON_CHARTS_SHA256);
}

#[test]
fn metric_values_are_served_on_the_same_axis_as_the_charts() {
    let imported = imported();
    let alignment = proposal("event", true);
    let charts = chart_data(&imported.session_dir(), &imported.manifest, &alignment).unwrap();
    let values = metric_series(&imported.session_dir(), &imported.manifest, &alignment).unwrap();
    let names: Vec<&String> = values.keys().collect();
    assert_eq!(names, ["fluorescence", "ubar_co2"]);
    let co2 = charts.iter().find(|c| c.id == "co2").unwrap();
    let points = |series: &[Series]| series.iter().map(|s| s.points.clone()).collect::<Vec<_>>();
    assert_eq!(points(&values["ubar_co2"]), points(&co2.series));
    let trials: Vec<&str> = values["fluorescence"]
        .iter()
        .map(|s| s.trial.as_str())
        .collect();
    assert_eq!(trials, ["light-150-pl1", "light-150-pl2"]);
}

/// SHA-256 of the `aligned.csv` the Python engine exported for this import and these inputs,
/// with its alignment id replaced by `ALN`. Both engines run DuckDB 1.5.6's CSV writer.
const PYTHON_ALIGNED_CSV_SHA256: &str =
    "5742c5c588a8f0cf789e44281e433c4cbd4d484c3d7a8a84c9e938e337be801f";

#[test]
fn aligned_export_writes_pythons_csv_and_a_sidecar() {
    let imported = imported();
    let session_dir = imported.session_dir();
    let saved = save_alignment(&session_dir, proposal("event", true)).unwrap();
    let id = saved.id.clone().unwrap();
    let export = export_aligned(&session_dir, &imported.manifest, &saved).unwrap();
    assert_eq!(
        export.csv,
        session_dir.join("exports").join(&id).join("aligned.csv")
    );

    let csv = fs::read_to_string(&export.csv).unwrap();
    assert_eq!(
        csv.lines().next().unwrap(),
        "alignment_id,trial,capture,role,x_s,x_uncertainty_s,ubar_co2,seq,t_elapsed_s,m32,m44,m45,\
         fluorescence,t_host_utc,t_device_ms,S,R,F,B,ACT,Blue,Red"
    );
    let normalized = csv.replace(&format!("\n{id},"), "\nALN,");
    let digest = sha2::Sha256::digest(normalized.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(hex, PYTHON_ALIGNED_CSV_SHA256);

    let sidecar: Value =
        serde_json::from_str(&fs::read_to_string(&export.metadata).unwrap()).unwrap();
    let keys: Vec<&String> = sidecar.as_object().unwrap().keys().collect();
    assert_eq!(
        keys,
        [
            "session",
            "template",
            "alignment",
            "captures",
            "columns",
            "notes"
        ]
    );
    assert_eq!(sidecar["alignment"], serde_json::to_value(&saved).unwrap());
    assert_eq!(sidecar["template"], json!({"id": TEMPLATE, "revision": 1}));
    let fixture =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/python-aligned-columns.json");
    let python = fs::read_to_string(fixture)
        .unwrap()
        .replace(r#""type": "DECIMAL(2,1)""#, r#""type": "DOUBLE""#);
    let python: Value = serde_json::from_str(&python).unwrap();
    assert_eq!(
        sidecar["columns"], python,
        "Python's columns, with x_uncertainty_s a DOUBLE"
    );
}

#[test]
fn a_query_sees_the_aligned_view_and_stops_at_the_row_limit() {
    let imported = imported();
    let dir = imported.session_dir();
    let saved = save_alignment(&dir, proposal("event", true)).unwrap();
    let all = run_query(
        &dir,
        &imported.manifest,
        Some(&saved),
        r#"SELECT * FROM "cap:ms-workbook""#,
    )
    .unwrap();
    assert_eq!(
        all.views,
        [
            "aligned",
            "cap:light-150-pl1",
            "cap:light-150-pl2",
            "cap:ms-workbook",
            "ev:light-150-pl1",
            "ev:light-150-pl2"
        ]
    );
    assert_eq!((all.rows.len(), all.truncated), (500, true));
    let keys: Vec<&String> = all.rows[0].keys().collect();
    assert_eq!(keys, ["seq", "t_elapsed_s", "m32", "m44", "m45"]);

    let few = run_query(
        &dir,
        &imported.manifest,
        Some(&saved),
        "SELECT trial, count(*) AS n, max(x_uncertainty_s) AS u FROM aligned WHERE role = 'ms' GROUP BY trial ORDER BY trial;  ",
    )
    .unwrap();
    assert!(!few.truncated);
    assert_eq!(
        serde_json::to_value(&few.rows).unwrap(),
        json!([
            {"trial": "light-150-pl1", "n": 1518, "u": 0.5},
            {"trial": "light-150-pl2", "n": 1518, "u": 0.5}
        ])
    );
}

#[test]
fn a_query_cannot_reach_outside_its_session_or_run_a_second_statement() {
    let imported = imported();
    let dir = imported.session_dir();
    let outside = tempfile::tempdir().unwrap();
    for target in [outside.path().join("escape.csv"), dir.join("escape.csv")] {
        let sql = format!(
            "SELECT 1) t; COPY (SELECT 1) TO '{}'; SELECT * FROM (SELECT 1",
            target.display()
        );
        let error = run_query(&dir, &imported.manifest, None, &sql).unwrap_err();
        assert!(matches!(error, AnalysisError::Query(_)), "{error}");
        assert!(!target.exists(), "{}", target.display());
    }
    let error = run_query(
        &dir,
        &imported.manifest,
        None,
        "SELECT * FROM read_csv('/etc/passwd')",
    )
    .unwrap_err();
    assert!(
        error
            .to_string()
            .starts_with("PermissionException: Permission Error"),
        "{error}"
    );
    let error = run_query(&dir, &imported.manifest, None, "SELEC 1").unwrap_err();
    assert!(
        error
            .to_string()
            .starts_with("ParserException: Parser Error"),
        "{error}"
    );
}

#[test]
fn evaluating_a_program_over_stored_rows_matches_eval_row_for_row() {
    let imported = imported();
    let template = from_snapshot(imported.manifest.template.clone()).unwrap();
    let program = Program::for_role(&template, "ms");
    let params = template.params();
    let db = SessionDb::open(&imported.session_dir(), &imported.manifest).unwrap();
    let computed = db.evaluate(&program, &params, "ms-workbook").unwrap();

    let mut stmt = db
        .connection()
        .prepare("SELECT seq, m44 FROM \"cap:ms-workbook\" ORDER BY seq")
        .unwrap();
    let stored: Vec<(i64, Option<f64>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let ubar = &template.derived()[0].expr;
    assert_eq!(computed.len(), stored.len());
    assert!(computed.len() > 10_000);
    for (row, (seq, m44)) in computed.iter().zip(&stored) {
        let expected = ubar.eval(&params, |n| (n == "m44").then_some(*m44).flatten());
        assert_eq!((row.seq, row.values.as_slice()), (*seq, &[expected][..]));
    }
    assert!(computed.iter().any(|row| row.values[0].is_some()));
}
