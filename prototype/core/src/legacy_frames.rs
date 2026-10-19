//! Legacy EZView frame exports: a folder or a zip of `<n>.csv` files, one file per frame.
//!
//! Each file holds a few rows of `t_ms,m32,m34,m36,m44,m45,m46,m47,m49` with no header, and
//! `t_ms` runs on across files from the acquisition start. readEZView.py writes two more
//! fields, EZView channels 11 and 12 (readEZView.py:102-117), and its time column as a float
//! such as `1250.0`. Downloads lose files, so frames absent from the numbered sequence are
//! reported, not treated as an error.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, SubsecRound, Utc};
use serde_json::{Map, json};
use zip::ZipArchive;
use zip::result::ZipError;

use crate::contract::{
    Cell, Event, InputKind, Instrument, InstrumentError, InstrumentInfo, Readiness, Row, Sink,
    StopSignal,
};
use crate::pycompat::{format_g, os_error};
use crate::schemas::{legacy_frames_clocks, legacy_frames_columns, legacy_frames_extra_columns};
use crate::spool::LEGACY_FRAME_CHANNELS;

pub const MASSES: [&str; 8] = ["m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49"];
const FIELDS: usize = 1 + MASSES.len();

#[derive(Clone, Debug, PartialEq)]
pub struct FrameRow {
    pub frame: i64,
    pub t_ms: i64,
    /// In the order of [`MASSES`].
    pub masses: [f64; 8],
    /// The fields after the masses, in the order of [`FrameRecording::extra`].
    pub extra: Vec<f64>,
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
    /// Names of the fields after the masses; empty for nine-field files. Every row of a
    /// recording has the same fields.
    pub extra: Vec<String>,
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
                write!(
                    f,
                    "No frame files (<n>.csv) with rows in {}",
                    path.display()
                )
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
    let mut width = None;
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
                add_frame(&mut frames, &mut width, frame, name, &bytes)?;
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
                add_frame(&mut frames, &mut width, frame, name, &bytes)?;
            }
        }
        FrameSource::Zip(path.to_path_buf())
    };
    if frames.values().all(|(_, rows)| rows.is_empty()) {
        return Err(FramesError::NoFrames(path.to_path_buf()));
    }
    let missing = missing_runs(frames.values().map(|(_, rows)| rows.as_slice()));
    Ok(FrameRecording {
        rows: frames.into_values().flat_map(|(_, rows)| rows).collect(),
        missing,
        source,
        extra: extra_names(width.unwrap_or(FIELDS) - FIELDS),
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
    cells.extend(row.extra.iter().copied().map(Cell::Float));
    cells
}

/// `ch11` and `ch12` for the two fields readEZView.py writes after the masses, then
/// `field12`, `field13` and so on for fields no known writer produces.
pub fn extra_names(count: usize) -> Vec<String> {
    (0..count)
        .map(|k| match LEGACY_FRAME_CHANNELS.get(MASSES.len() + k) {
            Some(channel) => format!("ch{channel}"),
            None => format!("field{}", FIELDS + k + 1),
        })
        .collect()
}

/// The event kind of a run of missing frames; every time chart of the capture's role shows it.
pub const MISSING_FRAMES: &str = "missing_frames";

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
        kind: MISSING_FRAMES.into(),
        label,
        t_host_utc,
        clock: Some("t_ms".into()),
        t_native: Some(gap.after_t_ms as f64 / 1000.0),
        value: Some((gap.last - gap.first + 1) as f64),
        payload,
    }
}

pub const DEFAULT_MODEL: &str = "Legacy EZView frame export";

#[derive(Clone, Debug, PartialEq)]
pub struct FramesReplaySettings {
    pub model: String,
    /// A zip or a folder of frame files.
    pub path: PathBuf,
    pub speed: f64,
}

/// Replays frame files at their own `t_ms` spacing divided by `speed`. The files are read
/// when the replay is built, so its columns include any fields after the masses and an
/// unreadable source is not ready.
pub struct FramesReplay {
    settings: FramesReplaySettings,
    recording: Result<FrameRecording, FramesError>,
}

impl FramesReplay {
    pub fn new(settings: FramesReplaySettings) -> Self {
        let recording = read_frames(&settings.path);
        FramesReplay {
            settings,
            recording,
        }
    }
}

impl Instrument for FramesReplay {
    fn describe(&self) -> InstrumentInfo {
        let mut columns = legacy_frames_columns();
        if let Ok(recording) = &self.recording {
            columns.extend(legacy_frames_extra_columns(&recording.extra));
        }
        InstrumentInfo {
            adapter: "legacy_frames_replay".into(),
            model: self.settings.model.clone(),
            input_kind: InputKind::Replay,
            capabilities: BTreeSet::from(["acquire".to_string()]),
            columns,
            clocks: legacy_frames_clocks(),
            aliases: BTreeMap::new(),
        }
    }

    fn check_ready(&self) -> Readiness {
        let path = &self.settings.path;
        if !path.exists() {
            return Readiness {
                ok: false,
                detail: format!("Recording not found: {}", path.display()),
            };
        }
        if let Err(e) = &self.recording {
            return Readiness {
                ok: false,
                detail: format!("Recording cannot be read: {e}"),
            };
        }
        Readiness {
            ok: true,
            detail: format!(
                "Replaying {} at {}x",
                path.file_name().unwrap_or_default().to_string_lossy(),
                format_g(self.settings.speed)
            ),
        }
    }

    /// Each row gets its own receipt time; a gap's event goes out after the row before it.
    fn run(&mut self, sink: &mut dyn Sink, stop: &StopSignal) -> Result<(), InstrumentError> {
        let reread;
        let recording = match &self.recording {
            Ok(recording) => recording,
            Err(_) => {
                reread = read_frames(&self.settings.path)?;
                &reread
            }
        };
        let mut gaps = recording.missing.iter().peekable();
        let mut previous_t = recording.rows[0].t_ms;
        for (seq, row) in recording.rows.iter().enumerate() {
            let delay = (row.t_ms - previous_t) as f64 / 1000.0 / self.settings.speed;
            if stop.wait(Duration::try_from_secs_f64(delay.max(0.0)).unwrap_or(Duration::MAX)) {
                return Ok(());
            }
            previous_t = row.t_ms;
            let received = Utc::now().trunc_subsecs(6);
            sink.rows(vec![frame_row(seq as i64, Some(received), row)]);
            while let Some(gap) = gaps.next_if(|g| g.after_t_ms <= row.t_ms) {
                sink.event(missing_frames_event(gap, Some(received)));
            }
        }
        Ok(())
    }

    fn cancel(&self) {}
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
    width: &mut Option<usize>,
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
    let rows = parse_frame(frame, &name, bytes, width)?;
    frames.insert(frame, (name, rows));
    Ok(())
}

/// `width` is the field count of the first row read in the recording; every later row must
/// match it.
fn parse_frame(
    frame: i64,
    name: &str,
    bytes: &[u8],
    width: &mut Option<usize>,
) -> Result<Vec<FrameRow>, FramesError> {
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
        let expected = width.unwrap_or(FIELDS);
        if fields.len() != expected && (width.is_some() || fields.len() < FIELDS) {
            return Err(row_error(format!(
                "expected {expected} fields, found {}",
                fields.len()
            )));
        }
        *width = Some(fields.len());
        let t_ms = whole_ms(fields[0]).ok_or_else(|| {
            row_error(format!(
                "t_ms {:?} is not a whole number of milliseconds",
                fields[0]
            ))
        })?;
        let number = |field: &str, what: &str| {
            field
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
                .ok_or_else(|| row_error(format!("{what} {field:?} is not a number")))
        };
        let mut masses = [0.0; 8];
        for ((value, field), mass) in masses.iter_mut().zip(&fields[1..]).zip(MASSES) {
            *value = number(field, mass)?;
        }
        let names = extra_names(fields.len() - FIELDS);
        let extra = fields[FIELDS..]
            .iter()
            .zip(&names)
            .map(|(field, name)| number(field, name))
            .collect::<Result<_, _>>()?;
        rows.push(FrameRow {
            frame,
            t_ms,
            masses,
            extra,
        });
    }
    Ok(rows)
}

/// `1250` or `1250.0`: pandas wrote the legacy time column as a float.
fn whole_ms(field: &str) -> Option<i64> {
    field.parse().ok().or_else(|| {
        let value: f64 = field.parse().ok()?;
        (value.is_finite() && value.fract() == 0.0 && value.abs() < 2f64.powi(53))
            .then_some(value as i64)
    })
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
                extra: Vec::new(),
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
    fn fields_after_the_masses_are_named_by_the_legacy_channel_layout() {
        assert!(extra_names(0).is_empty());
        assert_eq!(extra_names(3), ["ch11", "ch12", "field12"]);
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
            &mut None,
        )
        .unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].masses[2], -3.5);
        assert_eq!((parsed[1].t_ms, parsed[1].masses[3]), (210, -0.807));
        let error = |text: &[u8]| {
            parse_frame(4, "4.csv", text, &mut None)
                .unwrap_err()
                .to_string()
        };
        assert_eq!(
            error(b"105,1,2,3,4,5,6,7,8\r\n105,1,2\r\n"),
            "4.csv line 2: expected 9 fields, found 3"
        );
        let float_time = parse_frame(4, "4.csv", b"1250.0,1,2,3,4,5,6,7,8\n", &mut None).unwrap();
        assert_eq!(float_time[0].t_ms, 1250);
        let mut width = None;
        let eleven = parse_frame(4, "4.csv", b"105,1,2,3,4,5,6,7,8,9.5,10\n", &mut width).unwrap();
        assert_eq!(
            (eleven[0].extra.as_slice(), width),
            (&[9.5, 10.0][..], Some(11))
        );
        assert_eq!(
            error(b"105,1,2,3,4,5,6,7,8,9,10\n105,1,2,3,4,5,6,7,8\n"),
            "4.csv line 2: expected 11 fields, found 9"
        );
        assert_eq!(
            error(b"105,1,2,3,4,5,6,7,8,x\n"),
            "4.csv line 1: ch11 \"x\" is not a number"
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
