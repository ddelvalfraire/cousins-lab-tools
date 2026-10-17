//! Legacy EZView frame exports: a folder or a zip of `<n>.csv` files, one file per frame.
//!
//! Each file holds a few rows of `t_ms,m32,m34,m36,m44,m45,m46,m47,m49` with no header, and
//! `t_ms` runs on across files from the acquisition start. Downloads lose files, so frames
//! absent from the numbered sequence are reported, not treated as an error.

use std::collections::BTreeMap;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::{Map, json};
use zip::ZipArchive;
use zip::result::ZipError;

use crate::contract::{Cell, Event, InstrumentError, Row};
use crate::pycompat::os_error;

pub const MASSES: [&str; 8] = ["m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49"];

#[derive(Clone, Debug, PartialEq)]
pub struct FrameRow {
    pub frame: i64,
    pub t_ms: i64,
    /// In the order of [`MASSES`].
    pub masses: [f64; 8],
}

/// Frames `first..=last` have no rows; the last row before them is at `after_t_ms`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MissingFrames {
    pub after_t_ms: i64,
    pub first: i64,
    pub last: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FrameSource {
    Zip(PathBuf),
    Folder(PathBuf),
}

#[derive(Clone, Debug, PartialEq)]
pub struct FrameRecording {
    /// Numeric frame order, rows in file order within a frame.
    pub rows: Vec<FrameRow>,
    pub missing: Vec<MissingFrames>,
    pub source: FrameSource,
}

#[derive(Debug)]
pub enum FramesError {
    Io {
        path: PathBuf,
        error: io::Error,
    },
    Zip {
        path: PathBuf,
        error: ZipError,
    },
    Row {
        file: String,
        line: u64,
        message: String,
    },
    DuplicateFrame {
        frame: i64,
        first: String,
        second: String,
    },
    NoFrames(PathBuf),
}

impl fmt::Display for FramesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FramesError::Io { path, error } => write!(f, "{}: {error}", path.display()),
            FramesError::Zip { path, error } => {
                write!(f, "{} is not a readable zip: {error}", path.display())
            }
            FramesError::Row {
                file,
                line,
                message,
            } => write!(f, "{file} line {line}: {message}"),
            FramesError::DuplicateFrame {
                frame,
                first,
                second,
            } => write!(f, "Frame {frame} appears twice, as {first} and {second}"),
            FramesError::NoFrames(path) => {
                write!(f, "No frame files (<n>.csv) in {}", path.display())
            }
        }
    }
}

impl std::error::Error for FramesError {}

impl From<FramesError> for InstrumentError {
    fn from(e: FramesError) -> Self {
        match &e {
            FramesError::Io { path, error } => os_error(error, path),
            _ => InstrumentError::new("ValueError", e.to_string()),
        }
    }
}

/// Reads a folder's `<n>.csv` files, or a zip's at any depth. Other entries are skipped.
pub fn read_frames(path: &Path) -> Result<FrameRecording, FramesError> {
    let io_error = |error| FramesError::Io {
        path: path.to_path_buf(),
        error,
    };
    let mut frames = BTreeMap::new();
    let source = if path.is_dir() {
        for entry in fs::read_dir(path).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.file_type().map_err(io_error)?.is_file()
                && let Some(frame) = frame_number(&name)
            {
                let bytes = fs::read(entry.path()).map_err(|error| FramesError::Io {
                    path: entry.path(),
                    error,
                })?;
                add_frame(&mut frames, frame, name, &bytes)?;
            }
        }
        FrameSource::Folder(path.to_path_buf())
    } else {
        let zip_error = |error| FramesError::Zip {
            path: path.to_path_buf(),
            error,
        };
        let mut archive =
            ZipArchive::new(File::open(path).map_err(io_error)?).map_err(zip_error)?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(zip_error)?;
            let name = entry.name().to_string();
            if entry.is_file()
                && let Some(frame) = frame_number(&name)
            {
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).map_err(io_error)?;
                add_frame(&mut frames, frame, name, &bytes)?;
            }
        }
        FrameSource::Zip(path.to_path_buf())
    };
    if frames.is_empty() {
        return Err(FramesError::NoFrames(path.to_path_buf()));
    }
    let missing = missing_runs(frames.values().map(|(_, rows)| rows.as_slice()));
    Ok(FrameRecording {
        rows: frames.into_values().flat_map(|(_, rows)| rows).collect(),
        missing,
        source,
    })
}

/// A row as stored, in the order of [`crate::schemas::legacy_frames_columns`].
pub fn frame_row(seq: i64, t_host_utc: Option<DateTime<Utc>>, row: &FrameRow) -> Row {
    let mut cells = vec![
        Cell::Int(seq),
        t_host_utc.map_or(Cell::Null, Cell::TimeUtc),
        Cell::Int(row.t_ms),
        Cell::Int(row.frame),
    ];
    cells.extend(row.masses.map(Cell::Float));
    cells
}

/// One `missing_frames` event per run, placed at the last row before it on the `t_ms` clock.
pub fn missing_frames_event(gap: &MissingFrames, t_host_utc: Option<DateTime<Utc>>) -> Event {
    let label = if gap.first == gap.last {
        format!("Frame {} missing", gap.first)
    } else {
        format!("Frames {} to {} missing", gap.first, gap.last)
    };
    let mut payload = Map::new();
    payload.insert("first".into(), json!(gap.first));
    payload.insert("last".into(), json!(gap.last));
    Event {
        kind: "missing_frames".into(),
        label,
        t_host_utc,
        clock: Some("t_ms".into()),
        t_native: Some(gap.after_t_ms as f64 / 1000.0),
        value: Some((gap.last - gap.first + 1) as f64),
        payload,
    }
}

/// `12` for `Acquisition-3510/12.csv`; None for anything that is not a numbered CSV.
fn frame_number(entry: &str) -> Option<i64> {
    let base = entry.rsplit(['/', '\\']).next()?;
    let (stem, extension) = base.rsplit_once('.')?;
    if !extension.eq_ignore_ascii_case("csv") || !stem.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    stem.parse().ok()
}

fn add_frame(
    frames: &mut BTreeMap<i64, (String, Vec<FrameRow>)>,
    frame: i64,
    name: String,
    bytes: &[u8],
) -> Result<(), FramesError> {
    if let Some((first, _)) = frames.get(&frame) {
        return Err(FramesError::DuplicateFrame {
            frame,
            first: first.clone(),
            second: name,
        });
    }
    let rows = parse_frame(frame, &name, bytes)?;
    frames.insert(frame, (name, rows));
    Ok(())
}

fn parse_frame(frame: i64, name: &str, bytes: &[u8]) -> Result<Vec<FrameRow>, FramesError> {
    let mut rows = Vec::new();
    for (index, line) in String::from_utf8_lossy(bytes).lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let row_error = |message: String| FramesError::Row {
            file: name.to_string(),
            line: index as u64 + 1,
            message,
        };
        let fields: Vec<&str> = line.split(',').map(str::trim).collect();
        if fields.len() != 1 + MASSES.len() {
            return Err(row_error(format!(
                "expected 9 fields, found {}",
                fields.len()
            )));
        }
        let t_ms = fields[0].parse().map_err(|_| {
            row_error(format!(
                "t_ms {:?} is not a whole number of milliseconds",
                fields[0]
            ))
        })?;
        let mut masses = [0.0; 8];
        for ((value, field), mass) in masses.iter_mut().zip(&fields[1..]).zip(MASSES) {
            *value = field
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
                .ok_or_else(|| row_error(format!("{mass} {field:?} is not a number")))?;
        }
        rows.push(FrameRow {
            frame,
            t_ms,
            masses,
        });
    }
    Ok(rows)
}

/// Runs of frame numbers between frames that have rows. A file with no rows counts as missing.
fn missing_runs<'a>(frames: impl Iterator<Item = &'a [FrameRow]>) -> Vec<MissingFrames> {
    let present: Vec<&FrameRow> = frames.filter_map(<[FrameRow]>::last).collect();
    present
        .windows(2)
        .filter(|pair| pair[1].frame > pair[0].frame + 1)
        .map(|pair| MissingFrames {
            after_t_ms: pair[0].t_ms,
            first: pair[0].frame + 1,
            last: pair[1].frame - 1,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(frame: i64, t_ms: &[i64]) -> Vec<FrameRow> {
        t_ms.iter()
            .map(|&t_ms| FrameRow {
                frame,
                t_ms,
                masses: [0.0; 8],
            })
            .collect()
    }

    #[test]
    fn only_numbered_csv_entries_are_frames() {
        assert_eq!(frame_number("Acquisition-3510/12.csv"), Some(12));
        assert_eq!(frame_number("dir\\7.CSV"), Some(7));
        assert_eq!(frame_number("0012.csv"), Some(12));
        for name in [
            "___All_Errors.txt",
            "Mar 08,2023_CO2Compensation7812Data.xlsx",
            "Acquisition-3510/",
            "a12.csv",
            ".csv",
            "-3.csv",
            "12.csv.bak",
        ] {
            assert_eq!(frame_number(name), None, "{name}");
        }
    }

    #[test]
    fn gaps_between_frames_with_rows_are_reported_as_runs() {
        let frames = [
            rows(1, &[105, 210]),
            rows(2, &[315]),
            rows(3, &[]),
            rows(5, &[1000]),
            rows(9, &[2000, 2105]),
            rows(10, &[2210]),
        ];
        assert_eq!(
            missing_runs(frames.iter().map(Vec::as_slice)),
            [
                MissingFrames {
                    after_t_ms: 315,
                    first: 3,
                    last: 4
                },
                MissingFrames {
                    after_t_ms: 1000,
                    first: 6,
                    last: 8
                },
            ]
        );
    }

    #[test]
    fn rows_parse_with_crlf_and_negatives_and_bad_cells_name_their_line() {
        let parsed = parse_frame(
            4,
            "4.csv",
            b"105,1,2,-3.5,4,5,6,7,8\r\n\r\n210, 1,2,3,-0.807,5,6,7,8\r\n",
        )
        .unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].masses[2], -3.5);
        assert_eq!((parsed[1].t_ms, parsed[1].masses[3]), (210, -0.807));
        let error = |text: &[u8]| parse_frame(4, "4.csv", text).unwrap_err().to_string();
        assert_eq!(
            error(b"105,1,2,3,4,5,6,7,8\r\n105,1,2\r\n"),
            "4.csv line 2: expected 9 fields, found 3"
        );
        assert_eq!(
            error(b"10.5,1,2,3,4,5,6,7,8\r\n"),
            "4.csv line 1: t_ms \"10.5\" is not a whole number of milliseconds"
        );
        assert_eq!(
            error(b"105,1,2,3,nan,5,6,7,8\r\n"),
            "4.csv line 1: m44 \"nan\" is not a number"
        );
    }
}
