mod common;

use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use common::{CollectingSink, wait_until};
use cousinslab::ambit::{AmbitReplay, ReplaySettings};
use cousinslab::contract::{Cell, InputKind, Instrument, StopSignal};
use cousinslab::schemas::ambit_columns;

fn settings(csv_path: PathBuf, speed: f64) -> ReplaySettings {
    ReplaySettings {
        model: "Ambit".into(),
        csv_path,
        speed,
        flash_red_level: 2500,
    }
}

const FLASH_RECORDING: &str = "T,S,R,F,B,ACT,Blue,Red\n\
    0,1,1,1,1,0,0,225\n\
    100,2,1,1,1,0,0,225\n\
    200,3,1,1,1,250,0,2500\n\
    300,4,1,1,1,0,0,0\n";

#[test]
fn rows_arrive_one_at_a_time_and_events_carry_their_row_receipt_time() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("flash.csv");
    fs::write(&path, FLASH_RECORDING).unwrap();
    let mut sink = CollectingSink::default();
    let started = Instant::now();
    AmbitReplay::new(settings(path, 10.0))
        .run(&mut sink, &StopSignal::default())
        .unwrap();
    let elapsed = started.elapsed();
    assert!(
        (Duration::from_millis(30)..Duration::from_millis(250)).contains(&elapsed),
        "300 ms of device time at 10x took {elapsed:?}"
    );

    let batches = sink.batches();
    assert!(batches.iter().all(|batch| batch.len() == 1));
    let rows: Vec<_> = batches.concat();
    assert_eq!(
        rows[2][..4],
        [
            Cell::Int(2),
            rows[2][1].clone(),
            Cell::Int(200),
            Cell::Int(3)
        ]
    );
    assert!(rows.iter().all(|row| row.len() == ambit_columns().len()));
    let Cell::TimeUtc(flash_row_received) = rows[2][1] else {
        panic!("t_host_utc is {:?}", rows[2][1]);
    };

    let events = sink.events();
    let labels: Vec<_> = events.iter().map(|e| e.label.as_str()).collect();
    assert_eq!(
        labels,
        [
            "Red 225 to 2500",
            "ACT 0 to 250",
            "Saturation flash 1",
            "Red 2500 to 0",
            "ACT 250 to 0"
        ]
    );
    assert!(
        events[..3]
            .iter()
            .all(|e| e.t_host_utc == Some(flash_row_received))
    );
    assert_eq!(events[2].t_native, Some(0.2));
}

#[test]
fn stop_ends_a_replay_early() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../reference/instruments/ambit/Ambit raw data_sample_150_pl1.csv");
    let (sink, stop) = (CollectingSink::default(), StopSignal::default());
    let mut replay = AmbitReplay::new(settings(path, 100.0));
    let run = {
        let (mut sink, stop) = (sink.clone(), stop.clone());
        thread::spawn(move || replay.run(&mut sink, &stop))
    };
    wait_until("replayed rows", || sink.row_count() >= 20);
    stop.set();
    run.join().unwrap().unwrap();
    assert!(sink.row_count() < 7956);
}

#[test]
fn readiness_names_the_recording_and_speed_as_python_formats_them() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("flash.csv");
    fs::write(&path, FLASH_RECORDING).unwrap();
    let detail = |path: &PathBuf, speed: f64| {
        let readiness = AmbitReplay::new(settings(path.clone(), speed)).check_ready();
        (readiness.ok, readiness.detail)
    };
    assert_eq!(
        detail(&path, 20.0),
        (true, "Replaying flash.csv at 20x".into())
    );
    assert_eq!(
        detail(&path, 0.5),
        (true, "Replaying flash.csv at 0.5x".into())
    );
    let missing = dir.path().join("absent.csv");
    assert_eq!(
        detail(&missing, 1.0),
        (false, format!("Recording not found: {}", missing.display()))
    );
}

#[test]
fn a_recording_without_rows_fails_like_python() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty.csv");
    fs::write(&path, "T,S,R,F,B,ACT,Blue,Red\n").unwrap();
    let error = AmbitReplay::new(settings(path, 1.0))
        .run(&mut CollectingSink::default(), &StopSignal::default())
        .unwrap_err();
    assert_eq!(error.to_string(), "IndexError: list index out of range");
}

#[test]
fn describe_reports_a_replay_with_the_ambit_schema() {
    let info = AmbitReplay::new(settings(PathBuf::from("x.csv"), 1.0)).describe();
    assert_eq!(
        (info.adapter.as_str(), info.model.as_str(), info.input_kind),
        ("ambit_replay", "Ambit", InputKind::Replay)
    );
    assert_eq!(info.columns, ambit_columns());
    assert_eq!(info.clocks[0].column, "t_device_ms");
}
