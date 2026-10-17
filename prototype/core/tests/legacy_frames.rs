use std::path::{Path, PathBuf};

use cousinslab::api::Engine;
use cousinslab::legacy_frames::{FrameSource, FramesError, MissingFrames, read_frames};
use cousinslab::templates::Paths;
use serde_json::{Value, json};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

#[test]
fn a_zip_reads_in_numeric_frame_order_and_reports_the_missing_runs() {
    let recording = read_frames(&fixture("legacy-frames.zip")).unwrap();
    let frames: Vec<i64> = recording.rows.iter().map(|r| r.frame).collect();
    assert_eq!(frames, [1, 1, 1, 2, 2, 2, 3, 3, 7, 7, 7, 8, 8, 10, 10, 10]);
    let t_ms: Vec<i64> = recording.rows.iter().map(|r| r.t_ms).collect();
    assert_eq!(
        t_ms,
        [
            105, 210, 315, 420, 525, 630, 735, 840, 1995, 2100, 2205, 2310, 2415, 2940, 3045, 3150
        ]
    );
    assert_eq!(
        recording.rows[0].masses,
        [
            114.293, 52.447, -7.302, 231.942, 6.729, 59.397, 15.17, 1.983
        ]
    );
    assert_eq!(recording.rows[15].masses[3], -355.308);
    assert_eq!(
        recording.missing,
        [
            MissingFrames {
                after_t_ms: 840,
                first: 4,
                last: 6
            },
            MissingFrames {
                after_t_ms: 2415,
                first: 9,
                last: 9
            },
        ]
    );
    assert_eq!(
        recording.source,
        FrameSource::Zip(fixture("legacy-frames.zip"))
    );
}

#[test]
fn a_folder_reads_the_same_rows_as_its_zip() {
    let folder = read_frames(&fixture("legacy-frames/Acquisition-1")).unwrap();
    let zip = read_frames(&fixture("legacy-frames.zip")).unwrap();
    assert_eq!((&folder.rows, &folder.missing), (&zip.rows, &zip.missing));
    assert_eq!(
        folder.source,
        FrameSource::Folder(fixture("legacy-frames/Acquisition-1"))
    );
}

#[test]
fn a_source_without_frames_or_with_a_frame_twice_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("___All_Errors.txt"), "none\r\n").unwrap();
    assert!(matches!(
        read_frames(dir.path()),
        Err(FramesError::NoFrames(_))
    ));
    std::fs::write(dir.path().join("3.csv"), "105,1,2,3,4,5,6,7,8\r\n").unwrap();
    std::fs::write(dir.path().join("003.csv"), "210,1,2,3,4,5,6,7,8\r\n").unwrap();
    let error = read_frames(dir.path()).unwrap_err();
    assert!(
        matches!(error, FramesError::DuplicateFrame { frame: 3, .. }),
        "{error}"
    );
    let missing = read_frames(&dir.path().join("absent.zip")).unwrap_err();
    assert!(
        cousinslab::contract::InstrumentError::from(missing)
            .to_string()
            .starts_with("FileNotFoundError: [Errno 2]")
    );
}

/// The lab's sample export: 10001 files, 84,665 rows, and the 1228 frames the download lost,
/// exactly the names `___All_Errors.txt` lists.
#[test]
fn the_module2_sample_zip_reads_with_its_four_missing_runs() {
    let paths = cousinslab::templates::Paths::default();
    let recording = read_frames(&paths.repo.join("module2/SampleData.zip")).unwrap();
    assert_eq!(recording.rows.len(), 84_665);
    let runs: Vec<(i64, i64)> = recording
        .missing
        .iter()
        .map(|m| (m.first, m.last))
        .collect();
    assert_eq!(runs, [(9, 9), (89, 99), (890, 999), (8894, 9999)]);
    let (first, last) = (&recording.rows[0], recording.rows.last().unwrap());
    assert_eq!((first.frame, first.t_ms), (1, 105));
    assert_eq!((last.frame, last.t_ms), (11229, 9_966_004));
    assert!(recording.rows.windows(2).all(|w| w[0].t_ms < w[1].t_ms));
}

fn call(engine: &Engine, command: &str, args: Value) -> Value {
    engine
        .call(command, args)
        .unwrap_or_else(|e| panic!("{command} failed: {e:?}"))
}

fn frames_template(engine: &Engine) {
    let data = json!({
        "id": "legacy-frames-test",
        "revision": 1,
        "name": "Legacy frames",
        "roles": {"ms": {"instrument": "ms2-ezview", "import": "legacy_frames"}},
        "charts": [{
            "id": "raw", "title": "Raw", "unit": "mV",
            "series": [{"role": "ms", "value": "m44"}],
            "markers": {"role": "ms", "kind": "missing_frames"},
        }],
    });
    call(
        engine,
        "save_template",
        json!({"template_id": "legacy-frames-test", "data": data}),
    );
}

#[test]
fn an_imported_zip_keeps_its_rows_and_aligns_on_t_ms() {
    let data = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), data.path()).unwrap();
    frames_template(&engine);
    let zip = fixture("legacy-frames.zip");
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": "legacy-frames-test", "files": [{"role": "ms", "path": zip}]}),
    );
    let id = manifest["id"].as_str().unwrap();
    let capture = &manifest["captures"]["ms-legacy-frames"];
    assert_eq!(capture["rows"], 16);
    assert_eq!(capture["input_kind"], "import");
    assert_eq!(
        capture["clocks"],
        json!([{"column": "t_ms", "kind": "elapsed", "seconds_per_unit": 0.001,
                "description": "Acquisition elapsed time from the frame files"}])
    );
    let columns: Vec<(&str, &str, &str)> = capture["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            let text = |key: &str| c[key].as_str().unwrap();
            (text("name"), text("type"), text("unit"))
        })
        .collect();
    let mut expected = vec![
        ("seq", "int64", ""),
        ("t_host_utc", "timestamp_utc", ""),
        ("t_ms", "int64", "ms"),
        ("frame", "int64", ""),
    ];
    expected.extend(
        ["m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49"].map(|m| (m, "float64", "mV")),
    );
    assert_eq!(columns, expected);
    assert_eq!(
        capture["sources"][0]["sha256"],
        "941ebc6ed4b0f5d34c04a9c4bfc3a0eb14c0df46add25e19bd69aa0d47d4ff6e"
    );

    let stored = call(
        &engine,
        "query_session",
        json!({"session_id": id, "sql":
            "SELECT seq, t_host_utc, t_ms, frame, m44 FROM \"cap:ms-legacy-frames\" ORDER BY seq"}),
    );
    let rows = stored["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 16);
    assert_eq!(
        rows[13],
        json!({"seq": 13, "t_host_utc": null, "t_ms": 2940, "frame": 10, "m44": -314.808})
    );
    assert!(rows.iter().all(|r| r["t_host_utc"].is_null()));

    let events = call(&engine, "session_events", json!({"session_id": id}));
    let events: Vec<(&str, &str, f64, f64)> = events
        .as_array()
        .unwrap()
        .iter()
        .map(|e| {
            let text = |key: &str| e[key].as_str().unwrap();
            (
                text("kind"),
                text("label"),
                e["t_native"].as_f64().unwrap(),
                e["value"].as_f64().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        events,
        [
            ("missing_frames", "Frames 4 to 6 missing", 0.84, 3.0),
            ("missing_frames", "Frame 9 missing", 2.415, 1.0),
        ]
    );

    let preview = call(
        &engine,
        "preview_alignment",
        json!({"session_id": id, "reference": "elapsed"}),
    );
    let chart = &preview["charts"][0];
    let points = chart["series"][0]["points"].as_array().unwrap();
    assert_eq!(points.len(), 16);
    for (point, row) in points.iter().zip(rows) {
        assert_eq!(
            point[0].as_f64(),
            Some(row["t_ms"].as_i64().unwrap() as f64 / 1000.0)
        );
        assert_eq!(point[1], row["m44"]);
    }
    let markers: Vec<f64> = chart["markers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["x"].as_f64().unwrap())
        .collect();
    assert_eq!(markers, [0.84, 2.415]);
}
