use std::path::{Path, PathBuf};

use cousinslab::legacy_frames::{FrameSource, FramesError, MissingFrames, read_frames};

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
