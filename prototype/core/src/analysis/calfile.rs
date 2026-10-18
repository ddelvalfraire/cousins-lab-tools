//! Calibration files: a session's calibration state written as CSV, and such a file loaded
//! back into a session of the same template as typed values and entries that name the file.
//! A module 1 session also loads the legacy module 1 file.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use indexmap::IndexMap;
use serde::Serialize;

use crate::pycompat::float_repr;
use crate::query::AnalysisError;
use crate::session::Manifest;
use crate::templates::{Template, from_snapshot};

use super::carry::{Applied, Carried, action_for, apply, calibration_state};
use super::fold::fold;
use super::legacy_calfile;
use super::store::{Provenance, RecordId, load_records};
use super::view::view_of;

const HEADER: [&str; 8] = [
    "template", "kind", "name", "reading", "value", "label", "source", "record",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CalibrationExport {
    pub csv: PathBuf,
}

fn invalid(message: impl Into<String>) -> AnalysisError {
    AnalysisError::Invalid(message.into())
}

/// Writes the calibration state as the log stands to
/// `exports/calibrations-<last record>/calibrations.csv`, one row per step reading and per
/// entered parameter. The same log always gives the same file.
pub fn export_calibrations(
    session_dir: &Path,
    manifest: &Manifest,
) -> Result<CalibrationExport, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let log = load_records(session_dir)?;
    let carried = calibration_state(&template, &log);
    if carried.is_empty() {
        return Err(invalid("This session has no calibrations to export"));
    }
    let through = RecordId::new(fold(template.analysis(), &log).rev);
    let out = session_dir
        .join("exports")
        .join(format!("calibrations-{through}"));
    let export = CalibrationExport {
        csv: out.join("calibrations.csv"),
    };
    if export.csv.is_file() {
        return Ok(export);
    }
    let view = view_of(&template, &log);
    let mut csv = csv::Writer::from_writer(Vec::new());
    csv.write_record(HEADER).map_err(io::Error::from)?;
    for c in &carried {
        let rows: Vec<[String; 8]> = match c {
            Carried::Step {
                step,
                values,
                record,
            } => {
                let shown = &view.steps[step];
                values
                    .iter()
                    .map(|(reading, value)| {
                        [
                            template.id().to_string(),
                            "step".into(),
                            step.clone(),
                            reading.clone(),
                            float_repr(*value),
                            shown.label.clone(),
                            shown.source.unwrap_or_default().into(),
                            record.to_string(),
                        ]
                    })
                    .collect()
            }
            Carried::Entry {
                parameter,
                value,
                record,
            } => vec![[
                template.id().to_string(),
                "parameter".into(),
                parameter.clone(),
                String::new(),
                float_repr(*value),
                view.parameters[parameter].label.clone(),
                "entered".into(),
                record.to_string(),
            ]],
        };
        for row in rows {
            csv.write_record(&row).map_err(io::Error::from)?;
        }
    }
    let bytes = csv.into_inner().map_err(|e| e.into_error())?;
    fs::create_dir_all(&out)?;
    fs::write(&export.csv, bytes)?;
    Ok(export)
}

/// The non-blank rows of a CSV file, every field trimmed.
fn rows_of(text: &str) -> Result<Vec<Vec<String>>, AnalysisError> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.trim_start_matches('\u{feff}').as_bytes());
    let mut rows = Vec::new();
    for row in reader.records() {
        let row = row.map_err(|e| invalid(format!("Not a readable CSV file: {e}")))?;
        let fields: Vec<String> = row.iter().map(|f| f.trim().to_string()).collect();
        if fields.iter().any(|f| !f.is_empty()) {
            rows.push(fields);
        }
    }
    Ok(rows)
}

fn number(text: &str) -> Option<f64> {
    text.parse::<f64>().ok().filter(|v| v.is_finite())
}

/// The values of a file this app exported, refused unless it was exported for `template`.
/// The file carries no records, so every value gets record 0.
fn exported_values(
    template: &Template,
    rows: &[Vec<String>],
) -> Result<Vec<Carried>, AnalysisError> {
    let mut steps: IndexMap<String, IndexMap<String, f64>> = IndexMap::new();
    let mut entries = Vec::new();
    for (i, row) in rows.iter().enumerate().skip(1) {
        let place = format!("Row {}", i + 1);
        let [id, kind, name, reading, value, ..] = row.as_slice() else {
            return Err(invalid(format!(
                "{place} has {} fields; an exported calibration file has {}",
                row.len(),
                HEADER.len()
            )));
        };
        if id != template.id() {
            return Err(invalid(format!(
                "The file holds calibrations of template {id}; this session uses {}",
                template.id()
            )));
        }
        let value = number(value)
            .ok_or_else(|| invalid(format!("{place} holds {value:?}, not a number")))?;
        match kind.as_str() {
            "step" => {
                steps
                    .entry(name.clone())
                    .or_default()
                    .insert(reading.clone(), value);
            }
            "parameter" => entries.push((name.clone(), value)),
            other => {
                return Err(invalid(format!(
                    "{place}: kind must be step or parameter, not {other:?}"
                )));
            }
        }
    }
    let record = RecordId::new(0);
    let steps = steps.into_iter().map(|(step, values)| Carried::Step {
        step,
        values,
        record: record.clone(),
    });
    let entries = entries
        .into_iter()
        .map(|(parameter, value)| Carried::Entry {
            parameter,
            value,
            record: record.clone(),
        });
    Ok(steps.chain(entries).collect())
}

/// Loads a calibration file into the session, each value as a typed or entry record that
/// names the file. Steps and parameters the template revision lacks are left out with a note.
pub fn load_calibrations(
    session_dir: &Path,
    manifest: &Manifest,
    path: &Path,
    request_id: Option<String>,
) -> Result<Applied, AnalysisError> {
    if !path.is_file() {
        return Err(invalid(format!("No file {}", path.display())));
    }
    let template = from_snapshot(manifest.template.clone())?;
    let bytes = fs::read(path)?;
    let rows = rows_of(&String::from_utf8_lossy(&bytes))?;
    let header = rows.first().map(Vec::as_slice).unwrap_or_default();
    let (carried, mut notes) = if header == HEADER {
        (exported_values(&template, &rows)?, Vec::new())
    } else if legacy_calfile::is_module1_header(header) {
        legacy_calfile::module1_values(template.id(), &rows)?
    } else {
        let legacy = if template.id() == legacy_calfile::MODULE1_TEMPLATE {
            format!(
                ", or the legacy header {}",
                legacy_calfile::module1_header()
            )
        } else {
            String::new()
        };
        return Err(invalid(format!(
            "{} is not a calibration file this template reads: it should start with the header {}{legacy}",
            path.display(),
            HEADER.join(",")
        )));
    };
    if carried.is_empty() {
        return Err(invalid(format!(
            "The file holds no calibrations{}",
            notes.iter().map(|n| format!(". {n}")).collect::<String>()
        )));
    }
    let file = path.display().to_string();
    let from = |_: &RecordId| Some(Provenance::File { file: file.clone() });
    let mut actions = Vec::new();
    for c in carried {
        match action_for(&template, c, from) {
            Ok(action) => actions.push(action),
            Err(why) => notes.push(format!("{why}; not loaded")),
        }
    }
    if actions.is_empty() {
        return Err(invalid(format!(
            "Nothing in the file fits this template revision: {}",
            notes.join(" ")
        )));
    }
    apply(session_dir, &template, request_id, actions, notes)
}
