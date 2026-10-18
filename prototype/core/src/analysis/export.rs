//! A results table as CSV with a JSON sidecar, in `exports/table-<measurement>-<record>/`.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Value, json};

use crate::pycompat::float_repr;
use crate::query::AnalysisError;
use crate::session::{Manifest, iso};
use crate::templates::from_snapshot;

use super::fold::fold;
use super::store::{Action, RecordId, load_records};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TableExport {
    pub csv: PathBuf,
    pub metadata: PathBuf,
}

const NOTE: &str = "Each row keeps the results and the parameters it was added with; \
    calibrations taken later do not change it. Retracted rows are left out.";

/// Writes the table as the log stands. The folder is named after the last record, so the
/// same log always exports to the same folder and an existing export is returned as it is.
pub fn export_table(
    session_dir: &Path,
    manifest: &Manifest,
    measurement: &str,
) -> Result<TableExport, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let m = template
        .analysis()
        .measurements
        .get(measurement)
        .ok_or_else(|| AnalysisError::Invalid(format!("No measurement {measurement}")))?;
    let log = load_records(session_dir)?;
    let state = fold(template.analysis(), &log);
    let rows = &state.tables[measurement];
    if rows.is_empty() {
        return Err(AnalysisError::Invalid(format!(
            "Table {measurement} has no rows to export"
        )));
    }
    let through = RecordId::new(state.rev);
    let out = session_dir
        .join("exports")
        .join(format!("table-{measurement}-{through}"));
    let export = TableExport {
        csv: out.join("table.csv"),
        metadata: out.join("table.json"),
    };
    if export.csv.is_file() && export.metadata.is_file() {
        return Ok(export);
    }

    let mut csv = csv::Writer::from_writer(Vec::new());
    let mut header = vec!["record".to_string(), "created_utc".into()];
    header.extend(m.labels.keys().cloned());
    header.extend(m.results.keys().cloned());
    csv.write_record(&header).map_err(io::Error::from)?;
    let mut details = Vec::new();
    for row in rows {
        let mut fields = vec![row.record.to_string(), iso(row.created_utc)];
        fields.extend(m.labels.keys().map(|k| row.labels[k].clone()));
        fields.extend(
            m.results
                .keys()
                .map(|k| row.results[k].map_or_else(String::new, float_repr)),
        );
        csv.write_record(&fields).map_err(io::Error::from)?;
        let added = log.iter().find(|r| r.id == row.record);
        if let Some(Action::AddRow {
            readings, params, ..
        }) = added.map(|r| &r.action)
        {
            details.push(json!({"record": row.record, "readings": readings, "params": params}));
        }
    }
    let bytes = csv.into_inner().map_err(|e| e.into_error())?;

    let columns: Vec<Value> = m
        .labels
        .iter()
        .map(|(key, label)| json!({"key": key, "label": label, "unit": "", "kind": "label"}))
        .chain(m.results.iter().map(|(key, r)| {
            json!({"key": key, "label": r.label, "unit": r.unit, "kind": "result",
                   "expr": r.expr.text()})
        }))
        .collect();
    let sidecar = json!({
        "session": {"id": manifest.id, "name": manifest.name},
        "template": {"id": template.id(), "revision": template.revision()},
        "measurement": {"id": measurement, "label": m.label},
        "through_record": through,
        "columns": columns,
        "rows": details,
        "notes": [NOTE],
    });
    fs::create_dir_all(&out)?;
    fs::write(&export.csv, bytes)?;
    fs::write(&export.metadata, serde_json::to_string_pretty(&sidecar)?)?;
    Ok(export)
}
