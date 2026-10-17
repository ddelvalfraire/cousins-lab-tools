//! Real recorded files, imported and aligned the way the researcher aligned them in Excel.
//!
//! The workbook's sheets 150-pl1 and 150-pl2 re-zero the mass-spec time at rows 7405 and
//! 9683 (3701.772 s and 4840.772 s) and compute ubar CO2 = (m44 - mzero) * 1831.11 with
//! mzero 0.303 and 0.302. Entering those as explicit event times and trial parameters must
//! reproduce both sheets, while the stored data keeps its original times.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use cousinslab::importing::{ImportError, ImportFile, import_session};
use cousinslab::query::{SessionDb, session_events};
use cousinslab::session::{Manifest, SessionStore, segment_rows, segments, sha256};
use cousinslab::templates::{Paths, Template, TemplateStore};
use serde_json::Value;

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

/// One import shared by every test, as the Python module fixture is: reading the workbook is
/// the slow part.
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
