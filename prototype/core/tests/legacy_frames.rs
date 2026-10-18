mod common;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use common::{CollectingSink, wait_until};
use cousinslab::api::Engine;
use cousinslab::contract::{Cell, InputKind, Instrument, StopSignal};
use cousinslab::legacy_frames::{
    FrameSource, FramesError, FramesReplay, FramesReplaySettings, MissingFrames, read_frames,
};
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

#[test]
fn eleven_field_files_from_the_legacy_ezview_reader_keep_channels_11_and_12() {
    let recording = read_frames(&fixture("legacy-frames-ezview/Acquisition0")).unwrap();
    assert_eq!(recording.extra, ["ch11", "ch12"]);
    let rows: Vec<(i64, i64, f64, f64, &[f64])> = recording
        .rows
        .iter()
        .map(|r| {
            (
                r.frame,
                r.t_ms,
                r.masses[0],
                r.masses[3],
                r.extra.as_slice(),
            )
        })
        .collect();
    assert_eq!(
        rows,
        [
            (0, 1250, 0.512, 4.81, &[0.118, 0.236][..]),
            (1, 1350, 0.513, 4.79, &[0.119, 0.237][..]),
            (3, 1550, 0.511, 4.775, &[0.12, 0.235][..]),
        ]
    );
    assert_eq!(
        recording.missing,
        [MissingFrames {
            after_t_ms: 1350,
            first: 2,
            last: 2
        }]
    );
    let nine = read_frames(&fixture("legacy-frames.zip")).unwrap();
    assert!(nine.extra.is_empty());
    assert!(nine.rows.iter().all(|r| r.extra.is_empty()));
}

#[test]
fn a_recording_whose_files_disagree_on_their_fields_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("0.csv"), "1250.0,1,2,3,4,5,6,7,8,9,10\n").unwrap();
    std::fs::write(dir.path().join("1.csv"), "1350.0,1,2,3,4,5,6,7,8\n").unwrap();
    let error = read_frames(dir.path()).unwrap_err().to_string();
    assert!(
        [
            "0.csv line 1: expected 9 fields, found 11",
            "1.csv line 1: expected 11 fields, found 9"
        ]
        .contains(&error.as_str()),
        "{error}"
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

fn frames_template(engine: &Engine, instrument: &str) {
    let data = json!({
        "id": "legacy-frames-test",
        "revision": 1,
        "name": "Legacy frames",
        "roles": {"ms": {"instrument": instrument, "import": "legacy_frames"}},
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
    frames_template(&engine, "ms-legacy-frames-replay");
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

#[test]
fn a_folder_of_eleven_field_files_imports_with_its_extra_channels_and_a_listing_hash() {
    let data = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), data.path()).unwrap();
    frames_template(&engine, "ms-legacy-frames-replay");
    let folder = fixture("legacy-frames-ezview/Acquisition0");
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": "legacy-frames-test", "files": [{"role": "ms", "path": folder}]}),
    );
    let id = manifest["id"].as_str().unwrap();
    let capture = &manifest["captures"]["ms-acquisition0"];
    assert_eq!(capture["rows"], 3);
    let names: Vec<&str> = capture["columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    assert_eq!(names[11..], ["m49", "ch11", "ch12"]);
    assert_eq!(
        capture["sources"],
        json!([{"path": folder, "name": "Acquisition0", "bytes": 195,
                "sha256": "00eeeb3bbcf1b3bc4fdaf394e63ef40e3abba45884d9873b9099401fc9ba7605"}])
    );
    let raw = data
        .path()
        .join("sessions")
        .join(id)
        .join("captures/ms-acquisition0/raw/Acquisition0/3.csv");
    assert_eq!(
        std::fs::read(raw).unwrap(),
        std::fs::read(folder.join("3.csv")).unwrap()
    );
    let stored = call(
        &engine,
        "query_session",
        json!({"session_id": id, "sql":
            "SELECT t_ms, frame, m44, ch11, ch12 FROM \"cap:ms-acquisition0\" ORDER BY seq"}),
    );
    assert_eq!(
        stored["rows"][2],
        json!({"t_ms": 1550, "frame": 3, "m44": 4.775, "ch11": 0.12, "ch12": 0.235})
    );
}

#[test]
fn a_folder_of_nine_field_files_imports_the_same_rows_as_its_zip() {
    let data = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), data.path()).unwrap();
    frames_template(&engine, "ms-legacy-frames-replay");
    let import = |path: PathBuf| {
        let manifest = call(
            &engine,
            "import_files",
            json!({"template_id": "legacy-frames-test",
                   "files": [{"role": "ms", "path": path, "label": "x"}]}),
        );
        let id = manifest["id"].as_str().unwrap().to_string();
        let rows = call(
            &engine,
            "query_session",
            json!({"session_id": id, "sql": "SELECT * FROM \"cap:ms-x\" ORDER BY seq"}),
        );
        (
            manifest["captures"]["ms-x"]["columns"].clone(),
            rows["rows"].clone(),
        )
    };
    let folder = import(fixture("legacy-frames/Acquisition-1"));
    assert_eq!(folder, import(fixture("legacy-frames.zip")));
    assert_eq!(folder.0.as_array().unwrap().len(), 12);
    let missing = engine
        .call(
            "import_files",
            json!({"template_id": "legacy-frames-test",
                   "files": [{"role": "ms", "path": fixture("no-such-folder")}]}),
        )
        .unwrap_err();
    assert!(
        missing.message.starts_with("File not found: "),
        "{}",
        missing.message
    );
}

fn replay(speed: f64) -> FramesReplay {
    FramesReplay::new(FramesReplaySettings {
        model: "Frames".into(),
        path: fixture("legacy-frames.zip"),
        speed,
    })
}

#[test]
fn a_replay_paces_rows_by_t_ms_and_reports_each_gap_after_the_row_before_it() {
    let mut sink = CollectingSink::default();
    let started = Instant::now();
    replay(10.0).run(&mut sink, &StopSignal::default()).unwrap();
    let elapsed = started.elapsed();
    assert!(
        (Duration::from_millis(290)..Duration::from_secs(3)).contains(&elapsed),
        "3045 ms of t_ms at 10x took {elapsed:?}"
    );
    let batches = sink.batches();
    assert!(batches.iter().all(|batch| batch.len() == 1));
    let rows = batches.concat();
    assert_eq!(rows.len(), 16);
    assert_eq!(
        rows[7][..4],
        [
            Cell::Int(7),
            rows[7][1].clone(),
            Cell::Int(840),
            Cell::Int(3)
        ]
    );
    let received = |row: &[Cell]| match row[1] {
        Cell::TimeUtc(t) => t,
        ref other => panic!("t_host_utc is {other:?}"),
    };
    let events = sink.events();
    let summary: Vec<_> = events
        .iter()
        .map(|e| {
            (
                e.label.as_str(),
                e.clock.as_deref(),
                e.t_native,
                e.t_host_utc,
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            (
                "Frames 4 to 6 missing",
                Some("t_ms"),
                Some(0.84),
                Some(received(&rows[7]))
            ),
            (
                "Frame 9 missing",
                Some("t_ms"),
                Some(2.415),
                Some(received(&rows[12]))
            ),
        ]
    );
    let info = replay(1.0).describe();
    assert_eq!(
        (info.adapter.as_str(), info.input_kind, info.clocks.len()),
        ("legacy_frames_replay", InputKind::Replay, 2)
    );
}

#[test]
fn a_replay_of_eleven_field_files_stores_channels_11_and_12_after_the_masses() {
    let mut eleven = FramesReplay::new(FramesReplaySettings {
        model: "Frames".into(),
        path: fixture("legacy-frames-ezview/Acquisition0"),
        speed: 100.0,
    });
    let names: Vec<String> = eleven
        .describe()
        .columns
        .into_iter()
        .map(|c| c.name)
        .collect();
    assert_eq!(
        names[4..],
        [
            "m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49", "ch11", "ch12"
        ]
    );
    assert!(eleven.check_ready().ok);
    let mut sink = CollectingSink::default();
    eleven.run(&mut sink, &StopSignal::default()).unwrap();
    let rows = sink.batches().concat();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[2][2..4], [Cell::Int(1550), Cell::Int(3)]);
    assert_eq!(rows[2][12..], [Cell::Float(0.12), Cell::Float(0.235)]);
    assert_eq!(replay(1.0).describe().columns.len(), 12);
}

#[test]
fn a_replay_of_files_it_cannot_parse_is_not_ready_and_says_why() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("1.csv"), "105,1,2\n").unwrap();
    let replay = FramesReplay::new(FramesReplaySettings {
        model: "Frames".into(),
        path: dir.path().to_path_buf(),
        speed: 1.0,
    });
    let readiness = replay.check_ready();
    assert!(!readiness.ok);
    assert_eq!(
        readiness.detail,
        "Recording cannot be read: 1.csv line 1: expected 9 fields, found 3"
    );
}

/// The built-in profile with its path pointed at the fixture, beside the other profiles.
fn engine_replaying_the_fixture(data: &Path) -> Engine {
    let defaults = Paths::default();
    let instruments = data.join("instruments");
    std::fs::create_dir_all(&instruments).unwrap();
    for entry in std::fs::read_dir(&defaults.instruments).unwrap() {
        let path = entry.unwrap().path();
        let text = std::fs::read_to_string(&path).unwrap().replace(
            "${repo}/module2/SampleData.zip",
            &fixture("legacy-frames.zip").to_string_lossy(),
        );
        std::fs::write(instruments.join(path.file_name().unwrap()), text).unwrap();
    }
    let paths = Paths {
        instruments,
        ..defaults
    };
    Engine::open(paths, &data.join("data")).unwrap()
}

#[test]
fn a_replay_run_ends_with_the_source_and_stores_t_ms_unchanged() {
    let data = tempfile::tempdir().unwrap();
    let engine = engine_replaying_the_fixture(data.path());
    frames_template(&engine, "ms-legacy-frames-replay");
    let manifest = call(
        &engine,
        "start_run",
        json!({"template_id": "legacy-frames-test", "speed": 100.0}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    assert_eq!(
        manifest["captures"]["ms"]["input_note"],
        "Replay of a recording: legacy-frames.zip at 100x. \
         Rows and t_ms are recorded values; host times are this replay's."
    );
    let session = || call(&engine, "get_session", json!({"session_id": id}));
    let status = || session()["manifest"]["captures"]["ms"]["status"].clone();
    wait_until("the replay to reach its end", || status() == "source_ended");
    call(&engine, "stop_session", json!({"session_id": id}));
    wait_until("the run to stop", || !session()["live"].as_bool().unwrap());
    assert_eq!(status(), "source_ended");
    let stored = call(
        &engine,
        "query_session",
        json!({"session_id": id, "sql": "SELECT t_ms, frame, t_host_utc IS NOT NULL AS received \
               FROM \"cap:ms\" ORDER BY seq"}),
    );
    let t_ms: Vec<i64> = stored["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            assert_eq!(r["received"], true);
            r["t_ms"].as_i64().unwrap()
        })
        .collect();
    let recorded: Vec<i64> = read_frames(&fixture("legacy-frames.zip"))
        .unwrap()
        .rows
        .iter()
        .map(|r| r.t_ms)
        .collect();
    assert_eq!(t_ms, recorded);
    let events = call(&engine, "session_events", json!({"session_id": id}));
    let gaps: Vec<&str> = events
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "missing_frames")
        .map(|e| e["label"].as_str().unwrap())
        .collect();
    assert_eq!(gaps, ["Frames 4 to 6 missing", "Frame 9 missing"]);
}

#[test]
fn the_import_dialog_is_offered_the_module2_sample_zip() {
    let data = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), data.path()).unwrap();
    let recordings = call(&engine, "list_recordings", json!({}));
    let sample = Paths::default().repo.join("module2").join("SampleData.zip");
    assert_eq!(
        recordings["legacy_frames"],
        json!([sample.display().to_string()])
    );
    assert_eq!(recordings["ms_workbook"].as_array().unwrap().len(), 1);
}

#[test]
fn an_imported_zip_plots_on_t_ms_and_computes_slopes_over_it() {
    let data = tempfile::tempdir().unwrap();
    let engine = Engine::open(Paths::default(), data.path()).unwrap();
    let template = json!({
        "id": "legacy-frames-test",
        "revision": 1,
        "name": "Legacy frames",
        "roles": {"ms": {"instrument": "ms-legacy-frames-replay", "import": "legacy_frames"}},
        "derived": {"d44": {"role": "ms", "slope": {"of": "m44", "window_s": 0.3, "min_points": 3}}},
        "charts": [{"id": "rate", "title": "Rate", "unit": "mV/s", "x": "source",
                    "series": [{"role": "ms", "value": "d44"}]}],
    });
    call(
        &engine,
        "save_template",
        json!({"template_id": "legacy-frames-test", "data": template}),
    );
    let manifest = call(
        &engine,
        "import_files",
        json!({"template_id": "legacy-frames-test",
               "files": [{"role": "ms", "path": fixture("legacy-frames.zip")}]}),
    );
    let preview = call(
        &engine,
        "preview_alignment",
        json!({"session_id": manifest["id"], "reference": "elapsed"}),
    );
    let points = preview["charts"][0]["series"][0]["points"]
        .as_array()
        .unwrap();
    let xs: Vec<f64> = points.iter().map(|p| p[0].as_f64().unwrap()).collect();
    assert_eq!(
        xs,
        [0.42, 0.525, 0.63, 0.735, 0.84, 2.205, 2.31, 2.415, 3.15]
    );
    for p in points {
        let rate = p[1].as_f64().unwrap();
        assert!((rate - -20.25 / 0.105).abs() < 1e-9, "{p}");
    }
}

#[test]
fn an_entry_during_a_replay_recomputes_the_live_points() {
    let data = tempfile::tempdir().unwrap();
    let engine = engine_replaying_the_fixture(data.path());
    let template = json!({
        "id": "legacy-frames-test",
        "revision": 1,
        "name": "Legacy frames",
        "roles": {"ms": {"instrument": "ms-legacy-frames-replay", "import": "legacy_frames"}},
        "parameters": {"gain": {"entry": true}},
        "derived": {"scaled": {"role": "ms", "expr": "m44 * gain"}},
        "charts": [{"id": "scaled", "title": "Scaled", "unit": "mV", "x": "source",
                    "series": [{"role": "ms", "value": "scaled"}, {"role": "ms", "value": "m44"}]}],
    });
    call(
        &engine,
        "save_template",
        json!({"template_id": "legacy-frames-test", "data": template}),
    );
    let manifest = call(
        &engine,
        "start_run",
        json!({"template_id": "legacy-frames-test", "speed": 1.0}),
    );
    let id = manifest["id"].as_str().unwrap().to_string();
    let live = || call(&engine, "session_live", json!({"session_id": id}));
    wait_until("a few rows", || {
        live()["captures"]["ms"]["rows"].as_array().unwrap().len() >= 3
    });
    let before = live();
    assert_eq!(before["params_rev"], 0);
    assert!(
        before["captures"]["ms"]["rows"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["scaled"].is_null())
    );
    call(
        &engine,
        "record_analysis",
        json!({"session_id": id, "action": "entry", "parameter": "gain", "value": 2}),
    );
    let after = live();
    assert_eq!(after["params_rev"], 1);
    let rows = after["captures"]["ms"]["rows"].as_array().unwrap();
    assert!(rows.len() >= 3);
    for row in rows {
        assert_eq!(
            row["scaled"].as_f64(),
            Some(row["m44"].as_f64().unwrap() * 2.0),
            "{row}"
        );
    }
    call(&engine, "stop_session", json!({"session_id": id}));
    wait_until("the run to stop", || {
        !call(&engine, "get_session", json!({"session_id": id}))["live"]
            .as_bool()
            .unwrap()
    });
}
