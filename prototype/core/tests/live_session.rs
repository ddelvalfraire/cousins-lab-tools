//! A live session's DuckDB views, its events on the run clock, and its legacy frame export.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeDelta, TimeZone, Utc};
use cousinslab::contract::{Cell, Column, ColumnType, Event, InputKind};
use cousinslab::export::export_legacy_frames;
use cousinslab::query::{SessionDb, run_query, session_events};
use cousinslab::schemas::spool_columns;
use cousinslab::session::{
    Capture, CaptureStatus, Manifest, RunInfo, SegmentWriter, SessionKind, SessionStore,
    event_columns, event_row,
};
use cousinslab::spool::{decode_ascii, frame_row, read_frames};
use serde_json::json;

fn t0() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap()
}

fn capture(role: &str, columns: Vec<Column>, aliases: &[(&str, &str)]) -> Capture {
    Capture {
        role: role.into(),
        label: role.into(),
        instrument: None,
        adapter: Some("ezview_spool".into()),
        model: None,
        input_kind: InputKind::Simulated,
        input_note: String::new(),
        sources: Vec::new(),
        capabilities: None,
        columns,
        clocks: Vec::new(),
        aliases: aliases
            .iter()
            .map(|(a, c)| (a.to_string(), c.to_string()))
            .collect(),
        requested_delay_s: None,
        host_delay_s: None,
        on_failure: None,
        readiness: None,
        status: CaptureStatus::Completed,
        rows: 2,
        protocol_plan: None,
        start: None,
        ignored_columns: None,
        timing: None,
        requested_start_utc: None,
        start_command_utc: None,
        first_sample_utc: None,
        last_sample_utc: None,
        error: None,
        stopped_utc: None,
    }
}

fn event(kind: &str, label: &str, after_s: Option<f64>) -> Event {
    Event {
        kind: kind.into(),
        label: label.into(),
        t_host_utc: after_s.map(|s| t0() + TimeDelta::microseconds((s * 1e6) as i64)),
        clock: Some("t_host_utc".into()),
        t_native: None,
        value: None,
        payload: Default::default(),
    }
}

fn write(dir: &std::path::Path, columns: &[Column], rows: Vec<Vec<Cell>>) {
    let mut writer = SegmentWriter::new(dir, columns, usize::MAX, Duration::MAX).unwrap();
    writer.append(rows).unwrap();
    writer.flush().unwrap();
}

/// A run with an aliased MS capture, a light capture with events, and two operator markers.
fn run_session(store: &SessionStore) -> Manifest {
    let mut manifest = store
        .create(
            "events run",
            SessionKind::Run,
            json!({"id": "t", "revision": 1}),
        )
        .unwrap();
    manifest.run = Some(RunInfo {
        speed: 1.0,
        note: String::new(),
        group_start_utc: Some(t0()),
        stopped_utc: None,
    });
    let ms_columns = vec![
        Column::new("seq", ColumnType::Int64, "", ""),
        Column::new("ch3", ColumnType::Float64, "V", ""),
    ];
    manifest.captures.insert(
        "ms".into(),
        capture("ms", ms_columns.clone(), &[("m44", "ch3")]),
    );
    manifest
        .captures
        .insert("light".into(), capture("light", ms_columns.clone(), &[]));
    store.save(&manifest).unwrap();
    let dir = store.path(&manifest.id);
    write(
        &dir.join("captures/ms/samples"),
        &ms_columns,
        vec![
            vec![Cell::Int(0), Cell::Float(0.25)],
            vec![Cell::Int(1), Cell::Float(0.5)],
        ],
    );
    let light_events = [
        event("sat_flash", "Saturation flash 2", Some(2.0)),
        event("sat_flash", "Saturation flash 1", Some(1.0)),
        event("note", "No receipt time", None),
    ];
    write(
        &dir.join("captures/light/events"),
        &event_columns(),
        (0..)
            .zip(&light_events)
            .map(|(i, e)| event_row(i, e))
            .collect(),
    );
    for (seq, marker) in [event("closed_system", "Needle out", Some(0.5))]
        .iter()
        .enumerate()
    {
        write(
            &dir.join("markers"),
            &event_columns(),
            vec![event_row(seq as i64, marker)],
        );
    }
    manifest
}

#[test]
fn views_exist_only_for_directories_with_parts_and_carry_aliases() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let manifest = run_session(&store);
    let db = SessionDb::open(&store.path(&manifest.id), &manifest).unwrap();
    assert_eq!(
        db.views().collect::<Vec<_>>(),
        ["cap:ms", "ev:light", "markers"]
    );
    let aliased: Vec<(f64, f64)> = db
        .connection()
        .prepare(r#"SELECT ch3, m44 FROM "cap:ms" ORDER BY seq"#)
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(aliased, [(0.25, 0.25), (0.5, 0.5)]);
}

#[test]
fn run_events_are_ordered_on_the_run_clock_with_unreceived_ones_last() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let manifest = run_session(&store);
    let events = session_events(&store.path(&manifest.id), &manifest).unwrap();
    let order: Vec<(&str, &str, Option<f64>)> = events
        .iter()
        .map(|e| (e.source.as_str(), e.label.as_str(), e.x_run_s))
        .collect();
    assert_eq!(
        order,
        [
            ("operator", "Needle out", Some(0.5)),
            ("light", "Saturation flash 1", Some(1.0)),
            ("light", "Saturation flash 2", Some(2.0)),
            ("light", "No receipt time", None),
        ]
    );
    assert_eq!(
        serde_json::to_string(&events[0]).unwrap(),
        serde_json::to_string(&json!({
            "source": "operator", "kind": "closed_system", "label": "Needle out",
            "t_host_utc": "2026-10-16T22:09:52.500000+00:00", "clock": "t_host_utc",
            "t_native": null, "value": null, "x_run_s": 0.5
        }))
        .unwrap(),
        "Python's keys, in Python's order"
    );
}

fn locked_db() -> (tempfile::TempDir, SessionDb) {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let manifest = run_session(&store);
    let db = SessionDb::open(&store.path(&manifest.id), &manifest).unwrap();
    (data, db)
}

#[test]
fn a_session_connection_reaches_no_file_outside_the_session() {
    let (_data, db) = locked_db();
    let con = db.connection();
    let count: i64 = con
        .query_row(r#"SELECT count(*) FROM "cap:ms""#, [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 2, "views over the session still answer");

    let outside = tempfile::tempdir().unwrap();
    let escape = outside.path().join("escape.csv");
    let copy = con.execute_batch(&format!("COPY (SELECT 1) TO '{}'", escape.display()));
    assert!(copy.unwrap_err().to_string().contains("Permission Error"));
    assert!(!escape.exists());

    let read = con.query_row("SELECT count(*) FROM read_csv('/etc/passwd')", [], |r| {
        r.get::<_, i64>(0)
    });
    assert!(read.unwrap_err().to_string().contains("Permission Error"));

    for unlock in [
        "SET enable_external_access = true",
        "SET allowed_directories = ['/']",
        "SET lock_configuration = false",
    ] {
        assert!(con.execute_batch(unlock).is_err(), "{unlock}");
    }
}

#[test]
fn a_session_connection_never_installs_or_loads_an_extension() {
    let (_data, db) = locked_db();
    let con = db.connection();
    for statement in [
        "INSTALL icu",
        "LOAD icu",
        "SET autoload_known_extensions = true",
    ] {
        assert!(con.execute_batch(statement).is_err(), "{statement}");
    }
    // A function only ICU defines. With autoloading on, DuckDB tries to install ICU here.
    let message = con
        .query_row("SELECT icu_sort_key('a', 'en')", [], |r| {
            r.get::<_, String>(0)
        })
        .unwrap_err()
        .to_string();
    assert!(
        message.starts_with(
            "Catalog Error: Scalar Function with name \"icu_sort_key\" is not in the catalog"
        ),
        "{message}"
    );
}

fn frozen_start() -> NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 9, 30)
        .unwrap()
        .and_hms_opt(9, 0, 0)
        .unwrap()
}

fn spool_fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/spool")
        .join(name)
}

#[test]
fn legacy_frames_of_a_stored_spool_capture_match_the_legacy_reader() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let mut manifest = run_session(&store);
    let bytes = fs::read(spool_fixture("separated.txt")).unwrap();
    let frames = read_frames(decode_ascii(&bytes).unwrap()).unwrap();
    let rows = (0..)
        .zip(&frames)
        .map(|(seq, f)| frame_row(f, seq, t0(), frozen_start()))
        .collect();
    let mut spool = capture("ms", spool_columns(), &[("m44", "ch3")]);
    spool.rows = frames.len() as u64;
    manifest.captures.insert("spool".into(), spool);
    store.save(&manifest).unwrap();
    let dir = store.path(&manifest.id);
    write(&dir.join("captures/spool/samples"), &spool_columns(), rows);

    let export = export_legacy_frames(&dir, &manifest, "spool").unwrap();
    assert_eq!(export.folder, dir.join("exports/legacy-frames-spool"));
    assert_eq!(export.files, 5);
    for k in 0..5 {
        let name = format!("{k}.csv");
        assert_eq!(
            fs::read_to_string(export.folder.join(&name)).unwrap(),
            fs::read_to_string(spool_fixture("legacy-separated").join(&name)).unwrap(),
            "{name}"
        );
    }
}

#[test]
fn legacy_frames_apply_only_to_spool_captures() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let mut manifest = run_session(&store);
    manifest.captures["light"].adapter = Some("ambit_replay".into());
    for cid in ["light", "nope"] {
        let error = export_legacy_frames(&store.path(&manifest.id), &manifest, cid).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Legacy frame export applies to EZView spool captures"
        );
    }
}

#[test]
fn query_rows_write_times_as_python_str_did() {
    let data = tempfile::tempdir().unwrap();
    let store = SessionStore::new(data.path()).unwrap();
    let manifest = run_session(&store);
    let result = run_query(
        &store.path(&manifest.id),
        &manifest,
        None,
        "SELECT label, t_host_utc, t_host_utc::TIMESTAMP AS naive, t_native FROM markers",
    )
    .unwrap();
    assert_eq!(
        serde_json::to_string(&result.rows).unwrap(),
        serde_json::to_string(&json!([{
            "label": "Needle out",
            "t_host_utc": "2026-10-16 22:09:52.500000+00:00",
            "naive": "2026-10-16 22:09:52.500000",
            "t_native": null
        }]))
        .unwrap()
    );
}
