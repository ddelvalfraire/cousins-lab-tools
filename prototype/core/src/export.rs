//! CSV exports: aligned analysis data with a JSON sidecar, and legacy frame folders.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Value, json};

use crate::alignment::{Alignment, aligned_sql};
use crate::query::{AnalysisError, SessionDb, ident, sql_string};
use crate::session::{Manifest, iso};
use crate::spool::{SpoolFrame, legacy_frame_csv};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AlignedExport {
    pub csv: PathBuf,
    pub metadata: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LegacyFrames {
    pub folder: PathBuf,
    pub files: usize,
}

const NOTES: [&str; 2] = [
    "x_s is computed from the named clock column minus the member's zero; original time columns are unchanged.",
    "Rows from different captures are not resampled onto a common grid.",
];

/// `exports/<alignment id>/aligned.csv` with one header row and the original time columns
/// beside `x_s`, and `aligned.json` with the metadata rather than comment lines in the CSV.
pub fn export_aligned(
    session_dir: &Path,
    manifest: &Manifest,
    alignment: &Alignment,
) -> Result<AlignedExport, AnalysisError> {
    let id = alignment
        .id
        .as_deref()
        .ok_or_else(|| AnalysisError::Invalid("Only a saved alignment can be exported".into()))?;
    let out = session_dir.join("exports").join(id);
    fs::create_dir_all(&out)?;
    let mut db = SessionDb::open(session_dir, manifest)?;
    db.create_view("aligned", &aligned_sql(manifest, alignment)?)?;
    let csv = out.join("aligned.csv");
    db.connection().execute_batch(&format!(
        "COPY (SELECT * FROM aligned ORDER BY trial, capture, x_s) TO {} (HEADER, DELIMITER ',')",
        sql_string(&csv.to_string_lossy())
    ))?;
    let described: Vec<(String, String)> = db
        .connection()
        .prepare("SELECT column_name, column_type FROM (DESCRIBE aligned)")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;

    let mut units: HashMap<String, String> = HashMap::new();
    for capture in manifest.captures.values() {
        units.extend(
            capture
                .columns
                .iter()
                .map(|c| (c.name.clone(), c.unit.clone())),
        );
    }
    let template = &manifest.template;
    for (name, d) in template["derived"].as_object().into_iter().flatten() {
        units.insert(name.clone(), d["unit"].as_str().unwrap_or_default().into());
    }
    let event = alignment
        .event
        .as_ref()
        .map_or(String::new(), |e| format!(" '{e}'"));
    units.insert(
        "x_s".into(),
        format!("s relative to {}{event}", alignment.reference.name()),
    );
    units.insert("x_uncertainty_s".into(), "s".into());

    let captures: serde_json::Map<String, Value> = manifest
        .captures
        .iter()
        .map(|(cid, c)| {
            let fields = json!({
                "role": c.role,
                "label": c.label,
                "input_kind": c.input_kind,
                "input_note": c.input_note,
                "sources": c.sources,
                "clocks": c.clocks,
            });
            (cid.clone(), fields)
        })
        .collect();
    let columns: Vec<Value> = described
        .iter()
        .map(|(name, ty)| {
            let unit = units.get(name).cloned().unwrap_or_default();
            json!({"name": name, "type": ty, "unit": unit})
        })
        .collect();
    let sidecar = json!({
        "session": {
            "id": manifest.id,
            "name": manifest.name,
            "kind": manifest.kind,
            "created_utc": iso(manifest.created_utc),
            "host": manifest.host,
        },
        "template": {"id": template["id"], "revision": template["revision"]},
        "alignment": alignment,
        "captures": captures,
        "columns": columns,
        "notes": NOTES,
    });
    let metadata = out.join("aligned.json");
    fs::write(&metadata, serde_json::to_string_pretty(&sidecar)?)?;
    Ok(AlignedExport { csv, metadata })
}

/// Headerless one-frame CSVs that modules 1-3 can open, as readEZView.py wrote them, in
/// `exports/legacy-frames-<capture>/<k>.csv`.
pub fn export_legacy_frames(
    session_dir: &Path,
    manifest: &Manifest,
    capture_id: &str,
) -> Result<LegacyFrames, AnalysisError> {
    let is_spool = manifest
        .captures
        .get(capture_id)
        .is_some_and(|c| c.adapter.as_deref() == Some("ezview_spool"));
    if !is_spool {
        return Err(AnalysisError::Invalid(
            "Legacy frame export applies to EZView spool captures".into(),
        ));
    }
    let folder = session_dir
        .join("exports")
        .join(format!("legacy-frames-{capture_id}"));
    fs::create_dir_all(&folder)?;
    let db = SessionDb::open(session_dir, manifest)?;
    let view = format!("cap:{capture_id}");
    if !db.has_view(&view) {
        return Ok(LegacyFrames { folder, files: 0 });
    }
    let counts: Vec<String> = (1..=12).map(|ch| format!("ch{ch}_counts")).collect();
    let mut stmt = db.connection().prepare(&format!(
        "SELECT t_source_local, t_legacy_ms, gain, {} FROM {} ORDER BY seq",
        counts.join(", "),
        ident(&view)
    ))?;
    let mut rows = stmt.query([])?;
    let mut files = 0;
    while let Some(row) = rows.next()? {
        let mut frame = SpoolFrame {
            source_time: row.get(0)?,
            counts: [0; 12],
            gain: row.get(2)?,
        };
        for (i, count) in frame.counts.iter_mut().enumerate() {
            *count = row.get(3 + i)?;
        }
        let csv = legacy_frame_csv(&frame, row.get(1)?);
        fs::write(folder.join(format!("{files}.csv")), csv)?;
        files += 1;
    }
    Ok(LegacyFrames { folder, files })
}
