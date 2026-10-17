mod common;

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use chrono::{NaiveDate, NaiveDateTime, TimeDelta};
use common::{CollectingSink, wait_until};
use cousinslab::contract::{Cell, InputKind, Instrument, StopSignal};
use cousinslab::simulate::{
    ChannelValues, SimulatedFrame, SpoolSimulator, encode_frame, spool_lines,
};
use cousinslab::spool::{EzViewSpool, SpoolSettings};

fn parity_frames() -> Vec<ChannelValues> {
    vec![
        BTreeMap::from([(3, 0.8387536992994), (1, 0.0078532281596)]),
        BTreeMap::from([
            (3, 0.8425176963779),
            (1, 0.0078895786891),
            (5, 0.5),
            (2, 12.3456),
        ]),
        BTreeMap::from([
            (3, 0.29397470695265),
            (1, 0.00164190367733),
            (11, 1.1),
            (12, 0.000999),
        ]),
        BTreeMap::new(),
        BTreeMap::from([(3, 0.5), (1, 0.005), (4, 0.0999)]),
    ]
}

fn stamp(i: i64) -> NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 9, 30)
        .unwrap()
        .and_hms_opt(9, 0, 0)
        .unwrap()
        + TimeDelta::milliseconds(1250 + 500 * i)
        + TimeDelta::microseconds(137)
}

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/spool")
        .join(name);
    fs::read_to_string(path).unwrap()
}

#[test]
fn encoder_writes_the_python_spool_layout_byte_for_byte() {
    for (name, separator) in [("packed.txt", ""), ("separated.txt", "\n")] {
        let written: String = parity_frames()
            .iter()
            .zip(0..)
            .map(|(values, i)| {
                spool_lines(stamp(i), &encode_frame(values, "2a7").unwrap()) + separator
            })
            .collect();
        assert_eq!(written, fixture(name), "{name}");
    }
}

fn simulated(times_s: &[f64]) -> Vec<SimulatedFrame> {
    times_s
        .iter()
        .enumerate()
        .map(|(i, &t_s)| SimulatedFrame {
            t_s,
            values: BTreeMap::from([(3, 0.1 * i as f64), (1, 0.001)]),
        })
        .collect()
}

#[test]
fn simulated_frames_reach_the_spool_adapter_at_the_requested_speed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("raw").join("simulated-ezview-spool.txt");
    let times: Vec<f64> = (0..6).map(|i| 0.5 * i as f64).collect();
    let mut simulator = SpoolSimulator::new(path.clone(), simulated(&times), 25.0);
    let started = Instant::now();
    simulator.start().unwrap();

    let mut adapter = EzViewSpool::new(SpoolSettings {
        model: "MS".into(),
        aliases: BTreeMap::new(),
        poll_interval: Duration::from_millis(5),
        spool_path: Some(path),
        input_kind: InputKind::Simulated,
    });
    assert!(adapter.check_ready().ok, "start creates the spool file");
    let (sink, stop) = (CollectingSink::default(), StopSignal::default());
    let run = {
        let (mut sink, stop) = (sink.clone(), stop.clone());
        thread::spawn(move || adapter.run(&mut sink, &stop))
    };
    wait_until("six simulated frames", || sink.row_count() == 6);
    let elapsed = started.elapsed();
    simulator.close().unwrap();
    stop.set();
    run.join().unwrap().unwrap();

    assert_eq!(simulator.frames_written(), 6);
    assert!(
        elapsed >= Duration::from_millis(100),
        "2.5 s at 25x is 100 ms, took {elapsed:?}"
    );
    let ch3: Vec<f64> = sink
        .batches()
        .concat()
        .iter()
        .map(|row| match row[7] {
            Cell::Float(v) => v,
            ref other => panic!("ch3 is {other:?}"),
        })
        .collect();
    for (i, value) in ch3.iter().enumerate() {
        assert!(
            (value - 0.1 * i as f64).abs() < 20.0 / 234800968.0,
            "frame {i}: {value}"
        );
    }
}

#[test]
fn close_stops_the_writer_early_and_joins_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("spool.txt");
    let mut simulator = SpoolSimulator::new(path.clone(), simulated(&[0.0, 60.0]), 1.0);
    simulator.start().unwrap();
    wait_until("the first frame", || simulator.frames_written() == 1);
    let closing = Instant::now();
    simulator.close().unwrap();
    assert!(closing.elapsed() < Duration::from_secs(5));
    assert_eq!(simulator.frames_written(), 1);
    assert_eq!(fs::read_to_string(path).unwrap().lines().count(), 2);
    simulator.close().unwrap();
}

#[test]
fn a_value_that_cannot_be_encoded_is_reported_on_close() {
    let dir = tempfile::tempdir().unwrap();
    let frames = vec![SimulatedFrame {
        t_s: 0.0,
        values: BTreeMap::from([(5, -404.404)]),
    }];
    let mut simulator = SpoolSimulator::new(dir.path().join("spool.txt"), frames, 1.0);
    simulator.start().unwrap();
    wait_until("the writer to stop", || !simulator.is_running());
    assert_eq!(
        simulator.close().unwrap_err().message,
        "ch5=-404.404 cannot be represented: the decoder zeroes the first hex digit"
    );
}
