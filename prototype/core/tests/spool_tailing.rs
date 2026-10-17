mod common;

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use chrono::{Local, NaiveDateTime};
use common::{CollectingSink, wait_until};
use cousinslab::contract::{Cell, InputKind, Instrument, StopSignal};
use cousinslab::schemas::spool_columns;
use cousinslab::spool::{EzViewSpool, SpoolSettings, legacy_ms};

fn packed_lines() -> Vec<String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spool/packed.txt");
    fs::read_to_string(path)
        .unwrap()
        .split_inclusive('\n')
        .map(String::from)
        .collect()
}

fn settings(spool_path: Option<PathBuf>) -> SpoolSettings {
    SpoolSettings {
        model: "MS2".into(),
        aliases: BTreeMap::from([("m44".into(), "ch3".into())]),
        poll_interval: Duration::from_millis(20),
        spool_path,
        input_kind: InputKind::Simulated,
    }
}

fn append(path: &Path, lines: &[String]) {
    let mut file = OpenOptions::new().append(true).open(path).unwrap();
    file.write_all(lines.concat().as_bytes()).unwrap();
}

fn source_time(row: &[Cell]) -> NaiveDateTime {
    match row[2] {
        Cell::TimeLocal(t) => t,
        ref other => panic!("t_source_local is {other:?}"),
    }
}

#[test]
fn tailing_keeps_frames_split_mid_line_and_stamps_each_poll_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spool.txt");
    let lines = packed_lines();
    let (head, tail) = lines[7].split_at(40);
    fs::write(&path, lines[..7].concat() + head).unwrap();

    let sink = CollectingSink::default();
    let stop = StopSignal::default();
    let mut adapter = EzViewSpool::new(settings(Some(path.clone())));
    let before = Local::now().naive_local();
    let run = {
        let (mut sink, stop) = (sink.clone(), stop.clone());
        thread::spawn(move || adapter.run(&mut sink, &stop))
    };
    wait_until("the first three frames", || sink.row_count() == 3);
    let after = Local::now().naive_local();
    append(&path, &[&[tail.to_string()], &lines[8..]].concat());
    wait_until("the last two frames", || sink.row_count() == 5);
    stop.set();
    run.join().unwrap().unwrap();

    let batches = sink.batches();
    assert_eq!(batches.iter().map(Vec::len).collect::<Vec<_>>(), [3, 2]);
    for batch in &batches {
        assert!(
            batch.iter().all(|row| row[1] == batch[0][1]),
            "one receipt time per poll"
        );
    }
    let rows: Vec<_> = batches.concat();
    let seqs: Vec<_> = rows.iter().map(|row| row[0].clone()).collect();
    assert_eq!(seqs, (0..5).map(Cell::Int).collect::<Vec<_>>());
    assert!(rows.iter().all(|row| row.len() == spool_columns().len()));
    assert_eq!(
        source_time(&rows[3]).to_string(),
        "2026-09-30 09:00:02.750137",
        "a frame split mid-line across end of file is finished on the next poll"
    );
    let Cell::Int(t_legacy_ms) = rows[0][3] else {
        panic!("t_legacy_ms is not an integer");
    };
    let source = source_time(&rows[0]);
    assert!((legacy_ms(source, after)..=legacy_ms(source, before)).contains(&t_legacy_ms));
}

#[test]
fn stop_ends_an_idle_tail() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spool.txt");
    fs::write(&path, "").unwrap();
    let stop = StopSignal::default();
    let mut adapter = EzViewSpool::new(settings(Some(path)));
    let run = {
        let stop = stop.clone();
        thread::spawn(move || adapter.run(&mut CollectingSink::default(), &stop))
    };
    thread::sleep(Duration::from_millis(50));
    stop.set();
    run.join().unwrap().unwrap();
}

#[test]
fn readiness_names_the_missing_piece() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("absent.txt");
    let present = dir.path().join("spool.txt");
    fs::write(&present, "").unwrap();
    let detail = |path: Option<PathBuf>| {
        let readiness = EzViewSpool::new(settings(path)).check_ready();
        (readiness.ok, readiness.detail)
    };
    assert_eq!(
        detail(None),
        (
            false,
            "No spool file configured. Set settings.spool_path in the instrument profile.".into()
        )
    );
    assert_eq!(
        detail(Some(missing.clone())),
        (
            false,
            format!(
                "Spool file not found: {}. Is EZView spooling?",
                missing.display()
            )
        )
    );
    assert_eq!(
        detail(Some(present)),
        (true, "Spool file present: spool.txt".into())
    );
}

#[test]
fn a_spool_that_vanishes_before_the_run_fails_like_python() {
    let path = PathBuf::from("/nonexistent/spool.txt");
    let error = EzViewSpool::new(settings(Some(path)))
        .run(&mut CollectingSink::default(), &StopSignal::default())
        .unwrap_err();
    assert_eq!(
        error.to_string(),
        "FileNotFoundError: [Errno 2] No such file or directory: '/nonexistent/spool.txt'"
    );
}

#[test]
fn describe_reports_the_spool_schema_and_aliases() {
    let info = EzViewSpool::new(settings(None)).describe();
    assert_eq!(
        (info.adapter.as_str(), info.model.as_str(), info.input_kind),
        ("ezview_spool", "MS2", InputKind::Simulated)
    );
    assert_eq!(info.columns, spool_columns());
    assert_eq!(info.column("m44").unwrap().name, "ch3");
    assert!(info.capabilities.contains("acquire"));
}
