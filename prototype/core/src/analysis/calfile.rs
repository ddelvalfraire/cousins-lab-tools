//! Calibration files: a session's calibration state written as CSV.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::pycompat::float_repr;
use crate::query::AnalysisError;
use crate::session::Manifest;
use crate::templates::from_snapshot;

use super::carry::{Carried, calibration_state};
use super::fold::fold;
use super::store::{RecordId, load_records};
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
