//! Recorded files imported into a session, so they can be aligned and analysed like captures.
//!
//! An imported capture keeps only the clocks its file contains. The workbook has elapsed
//! seconds and the Ambit CSVs the device counter. Neither has clock time, so they can be
//! compared from their own starts or from a shared event, never on the wall clock.

use std::collections::BTreeSet;
use std::fmt;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::Duration;

use indexmap::IndexMap;
use sha2::{Digest, Sha256};

use crate::ambit::{detect_events, read_ambit_csv, sample_row, timing_summary};
use crate::contract::{Column, Event, InputKind, InstrumentError, Row};
use crate::legacy_frames::{frame_row, missing_frames_event, read_frames};
use crate::ms_workbook::{RAW_SHEET, read_raw_sheet};
use crate::pycompat::str_repr;
use crate::schemas::{
    ambit_columns, ambit_import_clocks, legacy_frames_columns, legacy_frames_extra_columns,
    legacy_frames_import_clocks, ms_import_clocks, ms_import_columns,
};
use crate::session::{
    Capture, CaptureStatus, Manifest, SegmentWriter, SessionError, SessionKind, SessionStatus,
    SessionStore, Source, event_columns, event_row, sha256, slug,
};
use crate::templates::Template;

#[derive(Clone, Debug, PartialEq)]
pub struct ImportFile {
    pub role: String,
    pub path: PathBuf,
    /// Names the capture; the file stem when absent or empty.
    pub label: Option<String>,
}

#[derive(Debug)]
pub enum ImportError {
    FileNotFound(PathBuf),
    UnknownRole(String),
    UnknownImporter(String),
    /// Two files would become the same capture: same role, same label.
    DuplicateCapture(String),
    Read(InstrumentError),
    Session(SessionError),
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ImportError::FileNotFound(path) => write!(f, "File not found: {}", path.display()),
            ImportError::UnknownRole(role) => write!(f, "Not found: {}", str_repr(role)),
            ImportError::UnknownImporter(importer) => write!(f, "Unknown importer {importer}"),
            ImportError::DuplicateCapture(id) => write!(
                f,
                "Two files would both become capture {id}; give them different labels"
            ),
            ImportError::Read(e) => write!(f, "{e}"),
            ImportError::Session(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ImportError {}

impl From<SessionError> for ImportError {
    fn from(e: SessionError) -> Self {
        ImportError::Session(e)
    }
}

impl From<serde_json::Error> for ImportError {
    fn from(e: serde_json::Error) -> Self {
        ImportError::Session(e.into())
    }
}

impl From<std::io::Error> for ImportError {
    fn from(e: std::io::Error) -> Self {
        ImportError::Session(e.into())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Importer {
    MsWorkbook,
    AmbitCsv,
    LegacyFrames,
}

struct Planned<'a> {
    file: &'a ImportFile,
    importer: Importer,
    label: String,
    capture_id: String,
}

/// Checks every file before the session exists, so a bad request leaves no half-made session.
fn plan<'a>(template: &Template, files: &'a [ImportFile]) -> Result<Vec<Planned<'a>>, ImportError> {
    let mut ids = BTreeSet::new();
    files
        .iter()
        .map(|file| {
            let role = template
                .roles()
                .get(&file.role)
                .ok_or_else(|| ImportError::UnknownRole(file.role.clone()))?;
            let importer = match role.get("import").and_then(|v| v.as_str()) {
                Some("ms_workbook") => Importer::MsWorkbook,
                Some("ambit_csv") => Importer::AmbitCsv,
                Some("legacy_frames") => Importer::LegacyFrames,
                other => {
                    return Err(ImportError::UnknownImporter(
                        other.unwrap_or("None").to_string(),
                    ));
                }
            };
            let folder_ok = importer == Importer::LegacyFrames && file.path.is_dir();
            if !file.path.is_file() && !folder_ok {
                return Err(ImportError::FileNotFound(file.path.clone()));
            }
            let label = match file.label.as_deref() {
                Some(label) if !label.is_empty() => label.to_string(),
                _ => stem(&file.path),
            };
            let capture_id = format!("{}-{}", file.role, slug(&label));
            if !ids.insert(capture_id.clone()) {
                return Err(ImportError::DuplicateCapture(capture_id));
            }
            Ok(Planned {
                file,
                importer,
                label,
                capture_id,
            })
        })
        .collect()
}

fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Copies the source into `raw/`, keeping its modification time as `shutil.copy2` does. A
/// folder's files are copied into `raw/<folder>/`; its subfolders are not read, so they are
/// not copied.
fn copy_raw(source: &Path, raw: &Path) -> Result<(), ImportError> {
    fs::create_dir_all(raw)?;
    let target = raw.join(source.file_name().unwrap_or_default());
    if source.is_dir() {
        for file in folder_files(source)? {
            copy_raw(&file, &target)?;
        }
        return Ok(());
    }
    fs::copy(source, &target)?;
    let modified = fs::metadata(source)?.modified()?;
    File::options()
        .write(true)
        .open(&target)?
        .set_modified(modified)?;
    Ok(())
}

/// The regular files directly inside `dir`, in name order.
fn folder_files(dir: &Path) -> Result<Vec<PathBuf>, ImportError> {
    let mut files = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            files.push(entry.path());
        }
    }
    files.sort();
    Ok(files)
}

/// A file's hash and size; for a folder, the SHA-256 of the lines `<sha256>  <name>\n` that
/// `sha256sum` prints for its files in name order, and their total size.
fn fingerprint(source: &Path) -> Result<(String, u64), ImportError> {
    if !source.is_dir() {
        return Ok((sha256(source)?, fs::metadata(source)?.len()));
    }
    let (mut listing, mut bytes) = (String::new(), 0);
    for file in folder_files(source)? {
        listing.push_str(&format!("{}  {}\n", sha256(&file)?, file_name(&file)));
        bytes += fs::metadata(&file)?.len();
    }
    let digest = Sha256::digest(listing.as_bytes());
    let hex = digest.iter().map(|b| format!("{b:02x}")).collect();
    Ok((hex, bytes))
}

fn write_segment(dir: &Path, columns: &[Column], rows: Vec<Row>) -> Result<(), SessionError> {
    let mut writer = SegmentWriter::new(dir, columns, usize::MAX, Duration::MAX)?;
    writer.append(rows)?;
    writer.flush()
}

/// A new session of kind `import`, one capture per file, saved with status `imported`.
pub fn import_session(
    store: &SessionStore,
    template: &Template,
    name: &str,
    files: &[ImportFile],
) -> Result<Manifest, ImportError> {
    let planned = plan(template, files)?;
    let mut manifest = store.create(name, SessionKind::Import, template.data().clone())?;
    for item in planned {
        let source = &item.file.path;
        let cdir = store.capture_dir(&manifest.id, &item.capture_id);
        copy_raw(source, &cdir.join("raw"))?;
        let name = file_name(source);
        let (digest, bytes) = fingerprint(source)?;
        let mut capture = Capture {
            role: item.file.role.clone(),
            label: item.label,
            instrument: None,
            adapter: None,
            model: None,
            input_kind: InputKind::Import,
            input_note: format!("{}: {name}", InputKind::Import.label()),
            sources: vec![Source {
                path: source.to_string_lossy().into_owned(),
                name,
                sha256: Some(digest),
                bytes: Some(bytes),
            }],
            capabilities: None,
            columns: Vec::new(),
            clocks: Vec::new(),
            aliases: IndexMap::new(),
            requested_delay_s: None,
            host_delay_s: None,
            on_failure: None,
            readiness: None,
            status: CaptureStatus::Imported,
            rows: 0,
            protocol_plan: None,
            ignored_columns: None,
            timing: None,
            requested_start_utc: None,
            start_command_utc: None,
            first_sample_utc: None,
            last_sample_utc: None,
            error: None,
            stopped_utc: None,
        };
        let (rows, events): (Vec<Row>, Vec<Event>) = match item.importer {
            Importer::MsWorkbook => {
                let series = read_raw_sheet(source, RAW_SHEET).map_err(ImportError::Read)?;
                capture.columns = ms_import_columns();
                capture.clocks = ms_import_clocks();
                (series.rows(), Vec::new())
            }
            Importer::AmbitCsv => {
                let recording = read_ambit_csv(source).map_err(ImportError::Read)?;
                let role = &capture.role;
                let plan = template.protocol_plan(role);
                let device_ms: Vec<i64> = recording.rows.iter().map(|r| r.t_ms).collect();
                capture.columns = ambit_columns();
                capture.clocks = ambit_import_clocks();
                capture.ignored_columns = Some(recording.ignored_columns);
                capture.timing = Some(serde_json::to_value(timing_summary(&device_ms, plan))?);
                capture.protocol_plan = plan.map(serde_json::to_value).transpose()?;
                let events = detect_events(&recording.rows, template.flash_red_level(role));
                let rows = (0..)
                    .zip(&recording.rows)
                    .map(|(seq, sample)| sample_row(seq, None, sample))
                    .collect();
                (rows, events)
            }
            Importer::LegacyFrames => {
                let recording = read_frames(source).map_err(|e| ImportError::Read(e.into()))?;
                capture.columns = legacy_frames_columns();
                capture
                    .columns
                    .extend(legacy_frames_extra_columns(&recording.extra));
                capture.clocks = legacy_frames_import_clocks();
                let rows = (0..)
                    .zip(&recording.rows)
                    .map(|(seq, row)| frame_row(seq, None, row))
                    .collect();
                let events = recording
                    .missing
                    .iter()
                    .map(|gap| missing_frames_event(gap, None))
                    .collect();
                (rows, events)
            }
        };
        capture.rows = rows.len() as u64;
        write_segment(&cdir.join("samples"), &capture.columns, rows)?;
        let events = (0..).zip(&events).map(|(i, e)| event_row(i, e)).collect();
        write_segment(&cdir.join("events"), &event_columns(), events)?;
        manifest.captures.insert(item.capture_id, capture);
    }
    manifest.status = SessionStatus::Imported;
    store.save(&manifest)?;
    Ok(manifest)
}
