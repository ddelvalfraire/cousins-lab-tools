//! Ambit fluorometer: recorded-file reader, flash detection, and timing against the protocol.
//!
//! Facts from `Python script to control Ambit system.ipynb`: the host sends `G` for each
//! sample and the device answers `T:<ms>,S:..,R:..,F:..,B:..`. The host appends the light
//! state it last commanded (ACT, Blue, Red). T is the device's millisecond counter; the CSV
//! carries no clock time because START_TIME stayed in `data.attrs`. Serial control is not
//! implemented here: running commands against the instrument needs explicit authorization.

use std::path::Path;

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Map;

use crate::contract::{Cell, Event, InstrumentError, Row};
use crate::protocol::ProtocolPlan;
use crate::pycompat::{os_error, round, str_repr, strip};

pub const FIELDS: [&str; 8] = ["T", "S", "R", "F", "B", "ACT", "Blue", "Red"];
pub const HEADER_ALIASES: [(&str, &str); 1] = [("T (ms)", "T")];

/// One recorded sample: the device's answer and the light state the host last commanded.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AmbitSample {
    pub t_ms: i64,
    pub s: i64,
    pub r: i64,
    pub f: i64,
    pub b: i64,
    pub act: i64,
    pub blue: i64,
    pub red: i64,
}

impl AmbitSample {
    fn from_fields([t_ms, s, r, f, b, act, blue, red]: [i64; 8]) -> Self {
        AmbitSample {
            t_ms,
            s,
            r,
            f,
            b,
            act,
            blue,
            red,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct AmbitRecording {
    pub rows: Vec<AmbitSample>,
    /// Non-empty headers the reader did not use, such as computed `Fluorescence` columns.
    pub ignored_columns: Vec<String>,
}

/// Reads notebook exports and their spreadsheet-edited copies by header name.
pub fn read_ambit_csv(path: &Path) -> Result<AmbitRecording, InstrumentError> {
    let csv_error = |error: csv::Error| match error.kind() {
        csv::ErrorKind::Io(io) => os_error(io, path),
        csv::ErrorKind::Utf8 { .. } => {
            InstrumentError::new("UnicodeDecodeError", error.to_string())
        }
        _ => InstrumentError::new("Error", error.to_string()),
    };
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_path(path)
        .map_err(csv_error)?;
    let mut records = reader.records();
    let header: Vec<String> = records
        .next()
        .ok_or_else(|| InstrumentError::new("StopIteration", ""))?
        .map_err(csv_error)?
        .iter()
        .map(|h| {
            let h = strip(h);
            HEADER_ALIASES
                .iter()
                .find(|(alias, _)| *alias == h)
                .map_or(h, |(_, name)| name)
                .to_string()
        })
        .collect();
    let mut index = [0; 8];
    for (slot, name) in index.iter_mut().zip(FIELDS) {
        *slot = header.iter().position(|h| h == name).ok_or_else(|| {
            InstrumentError::new("ValueError", format!("{} is not in list", str_repr(name)))
        })?;
    }
    let ignored_columns = header
        .iter()
        .enumerate()
        .filter(|(i, h)| !h.is_empty() && !index.contains(i))
        .map(|(_, h)| h.clone())
        .collect();
    let mut rows = Vec::new();
    for record in records {
        let record = record.map_err(csv_error)?;
        if record.get(0).is_none_or(|first| strip(first).is_empty()) {
            continue;
        }
        let mut fields = [0; 8];
        for (value, &i) in fields.iter_mut().zip(&index) {
            let cell = record
                .get(i)
                .ok_or_else(|| InstrumentError::new("IndexError", "list index out of range"))?;
            *value = int_of_float(cell)?;
        }
        rows.push(AmbitSample::from_fields(fields));
    }
    Ok(AmbitRecording {
        rows,
        ignored_columns,
    })
}

/// `int(float(cell))`: parses any float text, then truncates toward zero.
fn int_of_float(cell: &str) -> Result<i64, InstrumentError> {
    let value: f64 = strip(cell).parse().map_err(|_| {
        InstrumentError::new(
            "ValueError",
            format!("could not convert string to float: {}", str_repr(cell)),
        )
    })?;
    if value.is_nan() {
        return Err(InstrumentError::new(
            "ValueError",
            "cannot convert float NaN to integer",
        ));
    }
    if value.is_infinite() {
        return Err(InstrumentError::new(
            "OverflowError",
            "cannot convert float infinity to integer",
        ));
    }
    let truncated = value.trunc();
    if !(i64::MIN as f64..i64::MAX as f64).contains(&truncated) {
        return Err(InstrumentError::new(
            "OverflowError",
            format!("{} does not fit a 64-bit integer", str_repr(cell)),
        ));
    }
    Ok(truncated as i64)
}

/// A sample as a stored row, in the order of [`crate::schemas::ambit_columns`].
pub fn sample_row(seq: i64, t_host_utc: Option<DateTime<Utc>>, sample: &AmbitSample) -> Row {
    let mut row = vec![Cell::Int(seq), t_host_utc.map_or(Cell::Null, Cell::TimeUtc)];
    row.extend(
        [
            sample.t_ms,
            sample.s,
            sample.r,
            sample.f,
            sample.b,
            sample.act,
            sample.blue,
            sample.red,
        ]
        .map(Cell::Int),
    );
    row
}

struct Light {
    key: &'static str,
    kind: &'static str,
    level: fn(&AmbitSample) -> i64,
}

/// The commanded lights, in the order their changes are reported for one row.
const LIGHTS: [Light; 3] = [
    Light {
        key: "Red",
        kind: "red_led",
        level: |s| s.red,
    },
    Light {
        key: "ACT",
        kind: "ambit_actinic",
        level: |s| s.act,
    },
    Light {
        key: "Blue",
        kind: "blue_led",
        level: |s| s.blue,
    },
];

fn device_event(kind: &str, label: String, sample: &AmbitSample, value: i64) -> Event {
    Event {
        kind: kind.into(),
        label,
        t_host_utc: None,
        clock: Some("t_device_ms".into()),
        t_native: Some(sample.t_ms as f64 / 1000.0),
        value: Some(value as f64),
        payload: Map::new(),
    }
}

/// Light changes in the recorded host state, and saturation flashes numbered from 1.
pub fn detect_events(rows: &[AmbitSample], flash_red_level: i64) -> Vec<Event> {
    let mut events = Vec::new();
    let mut flash = 0;
    for pair in rows.windows(2) {
        let (previous, row) = (&pair[0], &pair[1]);
        for Light { key, kind, level } in LIGHTS {
            let (old, new) = (level(previous), level(row));
            if new != old {
                events.push(device_event(
                    kind,
                    format!("{key} {old} to {new}"),
                    row,
                    new,
                ));
            }
        }
        if row.red == flash_red_level && previous.red != flash_red_level {
            flash += 1;
            let label = format!("Saturation flash {flash}");
            events.push(device_event("sat_flash", label, row, flash));
        }
    }
    events
}

/// How a recording's device timing compares with what its protocol requested. Serializes
/// with the Python keys in the Python order.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TimingSummary {
    pub recorded_samples: usize,
    pub device_span_s: f64,
    pub first_device_ms: Option<i64>,
    pub gaps_over_150ms: usize,
    pub largest_gap_ms: i64,
    #[serde(flatten)]
    pub requested: Option<RequestedTiming>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RequestedTiming {
    pub requested_samples: u64,
    pub requested_s: f64,
    pub missing_samples: i64,
    pub device_span_minus_requested_s: f64,
}

/// Timing of the device counter `T` in milliseconds, one value per sample in recorded order.
pub fn timing_summary(device_ms: &[i64], plan: Option<&ProtocolPlan>) -> TimingSummary {
    let deltas: Vec<i64> = device_ms.windows(2).map(|w| w[1] - w[0]).collect();
    let span_s = match (device_ms.first(), device_ms.last()) {
        (Some(first), Some(last)) => (last - first) as f64 / 1000.0,
        _ => 0.0,
    };
    TimingSummary {
        recorded_samples: device_ms.len(),
        device_span_s: span_s,
        first_device_ms: device_ms.first().copied(),
        gaps_over_150ms: deltas.iter().filter(|&&d| d > 150).count(),
        largest_gap_ms: deltas.iter().copied().max().unwrap_or(0),
        requested: plan.map(|plan| RequestedTiming {
            requested_samples: plan.samples,
            requested_s: plan.nominal_s,
            missing_samples: plan.samples as i64 - device_ms.len() as i64,
            device_span_minus_requested_s: round(span_s - plan.nominal_s, 3),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn sample(t_ms: i64, act: i64, blue: i64, red: i64) -> AmbitSample {
        AmbitSample {
            t_ms,
            s: 0,
            r: 0,
            f: 0,
            b: 0,
            act,
            blue,
            red,
        }
    }

    #[test]
    fn changes_are_reported_red_then_actinic_then_blue_then_the_flash() {
        let rows = [sample(0, 0, 0, 225), sample(1500, 250, 7, 2500)];
        let events = detect_events(&rows, 2500);
        let summary: Vec<_> = events
            .iter()
            .map(|e| (e.kind.as_str(), e.label.as_str(), e.value))
            .collect();
        assert_eq!(
            summary,
            [
                ("red_led", "Red 225 to 2500", Some(2500.0)),
                ("ambit_actinic", "ACT 0 to 250", Some(250.0)),
                ("blue_led", "Blue 0 to 7", Some(7.0)),
                ("sat_flash", "Saturation flash 1", Some(1.0)),
            ]
        );
        assert!(events.iter().all(|e| e.t_native == Some(1.5)
            && e.clock.as_deref() == Some("t_device_ms")
            && e.t_host_utc.is_none()));
    }

    #[test]
    fn only_a_rising_edge_to_the_flash_level_counts_as_a_flash() {
        let rows = [
            sample(0, 0, 0, 2500),
            sample(1, 0, 0, 2500),
            sample(2, 0, 0, 0),
            sample(3, 0, 0, 2500),
        ];
        let flashes: Vec<_> = detect_events(&rows, 2500)
            .into_iter()
            .filter(|e| e.kind == "sat_flash")
            .map(|e| e.label)
            .collect();
        assert_eq!(flashes, ["Saturation flash 1"]);
    }

    #[test]
    fn timing_of_no_rows_matches_python() {
        assert_eq!(
            serde_json::to_string(&timing_summary(&[], None)).unwrap(),
            r#"{"recorded_samples":0,"device_span_s":0.0,"first_device_ms":null,"gaps_over_150ms":0,"largest_gap_ms":0}"#
        );
        let plan = crate::protocol::plan(&json!({"steps": [["M", 3, 0.1, 0]]})).unwrap();
        let summary = timing_summary(&[10, 120, 400], Some(&plan));
        assert_eq!((summary.gaps_over_150ms, summary.largest_gap_ms), (1, 280));
        assert_eq!(
            summary.requested.unwrap().device_span_minus_requested_s,
            0.09
        );
    }

    #[test]
    fn the_first_column_with_a_name_wins_and_unused_headers_are_listed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.csv");
        fs::write(
            &path,
            "T (ms),S,R,F,B,ACT,Blue,Red,,S,Note\n1,2,3,4,5,6,7,8,,99,x\n",
        )
        .unwrap();
        let recording = read_ambit_csv(&path).unwrap();
        assert_eq!((recording.rows[0].t_ms, recording.rows[0].s), (1, 2));
        assert_eq!(recording.ignored_columns, ["S", "Note"]);
    }

    #[test]
    fn malformed_cells_fail_with_the_python_messages() {
        let dir = tempfile::tempdir().unwrap();
        let read = |text: &str| {
            let path = dir.path().join("a.csv");
            fs::write(&path, text).unwrap();
            read_ambit_csv(&path)
                .map(|r| r.rows.len())
                .map_err(|e| e.to_string())
        };
        let header = "T,S,R,F,B,ACT,Blue,Red\n";
        assert_eq!(read(&format!("{header}1,2,3,4,5,6,7,8\n,\n  ,x\n")), Ok(1));
        assert_eq!(
            read(&format!("{header}1,2,3,4,5,6,7,abc\n")),
            Err("ValueError: could not convert string to float: 'abc'".into())
        );
        assert_eq!(
            read(&format!("{header}1,2,3\n")),
            Err("IndexError: list index out of range".into())
        );
        assert_eq!(
            read(&format!("{header}1,2,3,4,5,6,7,nan\n")),
            Err("ValueError: cannot convert float NaN to integer".into())
        );
        assert_eq!(
            read(&format!("{header}1,2,3,4,5,6,7,inf\n")),
            Err("OverflowError: cannot convert float infinity to integer".into())
        );
        assert_eq!(read(""), Err("StopIteration: ".into()));
        assert_eq!(
            read("T,S,R,F,B,ACT,Blue\n"),
            Err("ValueError: 'Red' is not in list".into())
        );
        assert_eq!(read(&format!("{header} 9.9 ,2,3,4,5,6,7,1e3\n")), Ok(1));
    }
}
