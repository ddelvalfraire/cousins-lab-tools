//! The spool decoder must write what the legacy reader wrote.
//!
//! The goldens in `fixtures/spool` came from the unchanged legacy reader run on two layouts:
//! - separated: a blank line follows each frame. The legacy reader reads and discards one line
//!   after every frame's terminating line, which is harmless here.
//! - packed: frames back to back. The discarded line is the next frame's first line, so the
//!   legacy reader loses frames. The new reader keeps them.

use std::fs;
use std::path::PathBuf;

use chrono::{NaiveDate, NaiveDateTime, TimeDelta};
use cousinslab::spool::{
    SpoolFrame, SpoolFramer, decode_ascii, legacy_frame_csv, legacy_ms, read_frames,
};

const FRAME_COUNT: usize = 5;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/spool")
        .join(name)
}

fn frozen_start() -> NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 9, 30)
        .unwrap()
        .and_hms_opt(9, 0, 0)
        .unwrap()
}

fn frames(name: &str) -> Vec<SpoolFrame> {
    let bytes = fs::read(fixture(name)).unwrap();
    read_frames(decode_ascii(&bytes).unwrap()).unwrap()
}

fn new_reader_csvs(name: &str) -> Vec<String> {
    frames(name)
        .iter()
        .map(|f| legacy_frame_csv(f, legacy_ms(f.source_time, frozen_start())))
        .collect()
}

fn legacy_csvs(folder: &str) -> Vec<String> {
    let count = fs::read_dir(fixture(folder)).unwrap().count();
    (0..count)
        .map(|k| fs::read_to_string(fixture(&format!("{folder}/{k}.csv"))).unwrap())
        .collect()
}

#[test]
fn separated_layout_is_byte_identical_to_legacy() {
    let legacy = legacy_csvs("legacy-separated");
    assert_eq!(legacy.len(), FRAME_COUNT);
    assert_eq!(new_reader_csvs("separated.txt"), legacy);
}

#[test]
fn packed_layout_new_reader_keeps_frames_legacy_drops() {
    let ours = new_reader_csvs("packed.txt");
    assert_eq!(ours.len(), FRAME_COUNT);
    assert_eq!(
        legacy_csvs("legacy-packed"),
        ours[..1],
        "legacy decodes the first frame, then loses every frame whose first line it discarded"
    );
}

#[test]
fn source_timestamps_are_preserved() {
    let stamps: Vec<NaiveDateTime> = (0..FRAME_COUNT as i64)
        .map(|i| {
            frozen_start() + TimeDelta::milliseconds(1250 + 500 * i) + TimeDelta::microseconds(137)
        })
        .collect();
    let times: Vec<NaiveDateTime> = frames("packed.txt").iter().map(|f| f.source_time).collect();
    assert_eq!(times, stamps);
}

#[test]
fn full_precision_values_survive_alongside_legacy_rounding() {
    let first = &frames("packed.txt")[0];
    assert!((first.value(3).unwrap() - 0.8387536992994).abs() <= 20.0 / 234800968.0);
    assert_eq!((first.value(9), first.value(10)), (None, None));
    let csv = legacy_frame_csv(first, legacy_ms(first.source_time, frozen_start()));
    assert_eq!(csv.split(',').nth(4), Some("0.839"));
}

#[test]
fn frame_split_across_end_of_file_is_kept() {
    let text = fs::read_to_string(fixture("packed.txt")).unwrap();
    let mut lines = text.split_inclusive('\n');
    let mut framer = SpoolFramer::default();
    assert_eq!(framer.feed(lines.next().unwrap()).unwrap(), None);
    let frame = framer.feed(lines.next().unwrap()).unwrap().unwrap();
    assert_eq!(
        frame.source_time,
        frozen_start() + TimeDelta::microseconds(1_250_137)
    );
}

/// module1's viewer (`file.py`) reads a frame file with `pd.read_csv(header=None)`, takes x from
/// the first column relative to the first file, and the column means without the time column.
#[test]
fn legacy_viewer_file_reader_accepts_exported_frames() {
    let first = &frames("packed.txt")[0];
    let exported = legacy_frame_csv(first, legacy_ms(first.source_time, frozen_start()));
    assert_eq!(exported, legacy_csvs("legacy-packed")[0]);
    let cells: Vec<f64> = exported
        .trim_end()
        .split(',')
        .map(|c| c.parse().unwrap())
        .collect();
    let x = cells[0] / 1000.0 - cells[0] / 1000.0;
    let means = &cells[1..];
    assert_eq!(x, 0.0);
    assert_eq!(
        (means[3], means[4]),
        (0.839, 0.008),
        "viewer slots m44 and m45 hold ch3 and ch1"
    );
}
