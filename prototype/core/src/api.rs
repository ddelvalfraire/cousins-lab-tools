//! The engine's commands as one typed table. The desktop window and the development server
//! both call [`Engine::call`], so the UI sees the same contract in either. Arguments are parsed
//! here, at the boundary, and every failure becomes an [`ApiError`] whose kind the UI can tell
//! apart.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::alignment::{
    self, Alignment, Inputs, Manual, Reference, TrialParams, chart_data, list_alignments,
    load_alignment, metric_series, propose,
};
use crate::export::{export_aligned, export_legacy_frames};
use crate::importing::{ImportError, ImportFile, import_session};
use crate::query::{AnalysisError, run_query, session_events};
use crate::run::{Cursors, GroupRun, RunError};
use crate::schemas;
use crate::session::{Manifest, SessionError, SessionStatus, SessionStore, iso};
use crate::templates::{Paths, StoreError, Template, TemplateStore, load_profiles};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The named template, session, alignment or file does not exist.
    NotFound,
    /// The request is malformed or breaks a rule; the message says which.
    Invalid,
    /// The session is not in a state that allows the request, such as stopping a finished run.
    Conflict,
    /// The engine failed; the message is the underlying error.
    Internal,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ApiError {
    pub kind: ErrorKind,
    pub message: String,
}

impl ApiError {
    fn new(kind: ErrorKind, message: impl fmt::Display) -> Self {
        ApiError {
            kind,
            message: message.to_string(),
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ApiError {}

type Result<T> = std::result::Result<T, ApiError>;

impl From<StoreError> for ApiError {
    fn from(e: StoreError) -> Self {
        let kind = match e {
            StoreError::NotFound(_) => ErrorKind::NotFound,
            StoreError::IdChanged | StoreError::Invalid(_) => ErrorKind::Invalid,
            StoreError::File(_) => ErrorKind::Internal,
        };
        ApiError::new(kind, e)
    }
}

impl From<RunError> for ApiError {
    fn from(e: RunError) -> Self {
        let kind = match e {
            RunError::Invalid(_) => ErrorKind::Invalid,
            RunError::UnknownInstrument(_) => ErrorKind::NotFound,
            RunError::NotRunning => ErrorKind::Conflict,
            RunError::Instrument(_) | RunError::Session(_) => ErrorKind::Internal,
        };
        ApiError::new(kind, e)
    }
}

impl From<ImportError> for ApiError {
    fn from(e: ImportError) -> Self {
        let kind = match e {
            ImportError::FileNotFound(_)
            | ImportError::UnknownRole(_)
            | ImportError::UnknownImporter(_)
            | ImportError::DuplicateCapture(_) => ErrorKind::Invalid,
            ImportError::Read(_) | ImportError::Session(_) => ErrorKind::Internal,
        };
        ApiError::new(kind, e)
    }
}

impl From<AnalysisError> for ApiError {
    fn from(e: AnalysisError) -> Self {
        let kind = match e {
            AnalysisError::AlignmentNotFound(_) => ErrorKind::NotFound,
            AnalysisError::Invalid(_) | AnalysisError::Query(_) => ErrorKind::Invalid,
            AnalysisError::Db(_) | AnalysisError::Session(_) | AnalysisError::Template(_) => {
                ErrorKind::Internal
            }
        };
        ApiError::new(kind, e)
    }
}

impl From<SessionError> for ApiError {
    fn from(e: SessionError) -> Self {
        ApiError::new(ErrorKind::Internal, e)
    }
}

/// What each adapter can do, for the instruments page.
fn adapter_info(adapter: &str) -> Option<(Value, &'static str)> {
    let (columns, clocks, control) = match adapter {
        "ezview_spool" => (
            schemas::spool_columns(),
            schemas::spool_clocks(),
            "None. EZView owns the instrument; the app reads its spool file.",
        ),
        "ambit_replay" => (
            schemas::ambit_columns(),
            schemas::ambit_clocks(),
            "Deferred. Serial protocol control (G, A, E; pulser DAC/LED) is documented but not implemented.",
        ),
        _ => return None,
    };
    Some((json!({"columns": columns, "clocks": clocks}), control))
}

const DEFAULT_SPEED: f64 = 10.0;

pub struct Engine {
    paths: Paths,
    data_dir: PathBuf,
    templates: TemplateStore,
    sessions: Arc<SessionStore>,
    runs: Mutex<HashMap<String, GroupRun>>,
    interrupted: HashSet<String>,
}

impl Engine {
    /// Opens the data directory and marks sessions a crash left unfinished as interrupted.
    pub fn open(paths: Paths, data_dir: &Path) -> Result<Engine> {
        let sessions = Arc::new(SessionStore::new(data_dir)?);
        let interrupted = sessions.mark_interrupted()?.into_iter().collect();
        Ok(Engine {
            templates: TemplateStore::new(paths.clone(), data_dir),
            paths,
            data_dir: data_dir.to_path_buf(),
            sessions,
            runs: Mutex::new(HashMap::new()),
            interrupted,
        })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Runs one command by name with its JSON arguments.
    pub fn call(&self, command: &str, args: Value) -> Result<Value> {
        match command {
            "engine_info" => reply(json!({
                "data_dir": self.data_dir,
                "version": env!("CARGO_PKG_VERSION"),
            })),
            "list_templates" => reply(self.list_templates()?),
            "get_template" => {
                let a: TemplateRef = parse(args)?;
                reply(self.template_view(&self.templates.get(&a.template_id, a.revision)?)?)
            }
            "save_template" => reply(self.save_template(parse(args)?)?),
            "list_instruments" => reply(self.list_instruments()?),
            "list_recordings" => reply(self.list_recordings()),
            "list_sessions" => reply(self.list_sessions()?),
            "start_run" => reply(self.start_run(parse(args)?)?),
            "import_files" => reply(self.import_files(parse(args)?)?),
            "get_session" => reply(self.get_session(&parse::<SessionRef>(args)?.session_id)?),
            "session_live" => {
                let a: LiveArgs = parse(args)?;
                let run = self.run(&a.session_id).ok_or_else(|| {
                    ApiError::new(
                        ErrorKind::Conflict,
                        "This session is not running in this engine process",
                    )
                })?;
                reply(run.live(&a.cursors))
            }
            "session_events" => {
                let id = parse::<SessionRef>(args)?.session_id;
                reply(session_events(
                    &self.session_dir(&id)?,
                    &self.manifest(&id)?,
                )?)
            }
            "stop_session" => {
                let a: StopArgs = parse(args)?;
                let run = self.running(&a.session_id, "This session is not running")?;
                run.stop(a.cancel)?;
                reply(json!({"status": "stopping"}))
            }
            "mark_session" => {
                let a: MarkArgs = parse(args)?;
                let run = self.running(
                    &a.session_id,
                    "Markers can only be added while the run is going",
                )?;
                reply(run.mark(&a.event)?)
            }
            "preview_alignment" => {
                let a: AlignArgs = parse(args)?;
                let mut alignment = self.propose(&a)?;
                alignment.id = Some("preview".into());
                reply(self.aligned_view(&a.session_id, alignment)?)
            }
            "save_alignment" => {
                let a: AlignArgs = parse(args)?;
                let alignment = self.propose(&a)?;
                reply(alignment::save_alignment(
                    &self.session_dir(&a.session_id)?,
                    alignment,
                )?)
            }
            "alignment_charts" => {
                let a: AlignmentRef = parse(args)?;
                let alignment = load_alignment(&self.session_dir(&a.session_id)?, &a.alignment_id)?;
                reply(self.aligned_view(&a.session_id, alignment)?)
            }
            "export_alignment" => {
                let a: AlignmentRef = parse(args)?;
                let dir = self.session_dir(&a.session_id)?;
                let alignment = load_alignment(&dir, &a.alignment_id)?;
                reply(export_aligned(
                    &dir,
                    &self.manifest(&a.session_id)?,
                    &alignment,
                )?)
            }
            "export_legacy_frames" => {
                let a: LegacyArgs = parse(args)?;
                let dir = self.session_dir(&a.session_id)?;
                reply(export_legacy_frames(
                    &dir,
                    &self.manifest(&a.session_id)?,
                    &a.capture,
                )?)
            }
            "query_session" => {
                let a: QueryArgs = parse(args)?;
                let dir = self.session_dir(&a.session_id)?;
                let alignment = match &a.alignment_id {
                    Some(id) if !id.is_empty() => Some(load_alignment(&dir, id)?),
                    _ => None,
                };
                reply(run_query(
                    &dir,
                    &self.manifest(&a.session_id)?,
                    alignment.as_ref(),
                    &a.sql,
                )?)
            }
            other => Err(ApiError::new(
                ErrorKind::NotFound,
                format!("No command {other}"),
            )),
        }
    }

    /// Whether `path` lies inside the data directory, for commands that open files.
    pub fn owns_path(&self, path: &Path) -> bool {
        match (path.canonicalize(), self.data_dir.canonicalize()) {
            (Ok(path), Ok(root)) => path.starts_with(root),
            _ => false,
        }
    }

    fn list_templates(&self) -> Result<Vec<Value>> {
        self.templates
            .list()?
            .iter()
            .map(|t| self.template_view(t))
            .collect()
    }

    fn template_view(&self, t: &Template) -> Result<Value> {
        let plans: Map<String, Value> = t
            .roles()
            .keys()
            .map(|role| (role.clone(), json!(t.protocol_plan(role))))
            .collect();
        let yaml =
            serde_norway::to_string(t.data()).map_err(|e| ApiError::new(ErrorKind::Internal, e))?;
        Ok(json!({
            "data": t.data(),
            "yaml": yaml,
            "revisions": self.templates.revisions(t.id())?,
            "charts": t.charts(),
            "protocol_plans": plans,
            "enabled_roles": t.enabled_roles().into_iter().map(|(role, _)| role).collect::<Vec<_>>(),
            "layout": t.layout(),
            "hidden_components": t.hidden_components(),
        }))
    }

    fn save_template(&self, a: SaveTemplate) -> Result<Value> {
        let saved = match (a.yaml, a.data) {
            (Some(text), _) => self.templates.save_yaml(&a.template_id, &text)?,
            (None, Some(data)) => self.templates.save_revision(&a.template_id, data)?,
            (None, None) => {
                return Err(ApiError::new(
                    ErrorKind::Invalid,
                    "Send the template as yaml or data",
                ));
            }
        };
        self.template_view(&saved)
    }

    fn list_instruments(&self) -> Result<Vec<Value>> {
        let profiles = load_profiles(&self.paths.instruments)
            .map_err(|e| ApiError::new(ErrorKind::Internal, e))?;
        let mut out = Vec::new();
        for profile in profiles.values() {
            let mut entry = profile.as_object().cloned().unwrap_or_default();
            let adapter = profile["adapter"].as_str().unwrap_or_default();
            if let Some((schema, control)) = adapter_info(adapter) {
                entry.insert("capabilities".into(), json!(["acquire"]));
                entry.insert("control".into(), json!(control));
                entry.insert("columns".into(), schema["columns"].clone());
                entry.insert("clocks".into(), schema["clocks"].clone());
            }
            out.push(Value::Object(entry));
        }
        Ok(out)
    }

    /// Reference recordings the import dialog offers, from `reference/instruments`.
    fn list_recordings(&self) -> Value {
        let mut files = Vec::new();
        collect_files(
            &self.paths.repo.join("reference").join("instruments"),
            &mut files,
        );
        files.sort();
        let named = |keep: fn(&str) -> bool| -> Vec<String> {
            files
                .iter()
                .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(keep))
                .map(|p| p.display().to_string())
                .collect()
        };
        json!({
            "ms_workbook": named(|n| n.ends_with(".xlsx")),
            "ambit_csv": named(|n| n.starts_with("Ambit") && n.ends_with(".csv")),
        })
    }

    fn list_sessions(&self) -> Result<Vec<Value>> {
        Ok(self
            .sessions
            .list()?
            .into_iter()
            .map(|stored| {
                let m = self
                    .run(&stored.id)
                    .map_or(stored, |run| (*run.manifest()).clone());
                let inputs: BTreeSet<_> = m.captures.values().map(|c| c.input_kind).collect();
                json!({
                    "id": m.id,
                    "name": m.name,
                    "kind": m.kind,
                    "status": m.status,
                    "created_utc": iso(m.created_utc),
                    "template": format!(
                        "{} r{}",
                        m.template["name"].as_str().unwrap_or_default(),
                        m.template["revision"]
                    ),
                    "inputs": inputs,
                    "live": self.is_live(&m),
                })
            })
            .collect())
    }

    fn start_run(&self, a: StartRun) -> Result<Manifest> {
        let template = self.templates.get(&a.template_id, a.revision)?;
        let profiles = load_profiles(&self.paths.instruments)
            .map_err(|e| ApiError::new(ErrorKind::Internal, e))?;
        let run = GroupRun::start(
            self.sessions.clone(),
            &self.paths,
            template,
            &profiles,
            a.speed.unwrap_or(DEFAULT_SPEED),
            a.name.as_deref(),
        )?;
        let manifest = (*run.manifest()).clone();
        self.runs.lock().unwrap().insert(manifest.id.clone(), run);
        Ok(manifest)
    }

    fn import_files(&self, a: ImportArgs) -> Result<Manifest> {
        let template = self.templates.get(&a.template_id, a.revision)?;
        let files: Vec<ImportFile> = a
            .files
            .into_iter()
            .map(|f| ImportFile {
                role: f.role,
                path: f.path,
                label: f.label,
            })
            .collect();
        let name = a
            .name
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Imported recording".into());
        Ok(import_session(&self.sessions, &template, &name, &files)?)
    }

    fn get_session(&self, id: &str) -> Result<Value> {
        let dir = self.session_dir(id)?;
        let manifest = self.manifest(id)?;
        Ok(json!({
            "manifest": manifest,
            "alignments": list_alignments(&dir)?,
            "live": self.is_live(&manifest),
            "interrupted_at_startup": self.interrupted.contains(id),
        }))
    }

    fn propose(&self, a: &AlignArgs) -> Result<Alignment> {
        let inputs = Inputs {
            reference: a.reference.unwrap_or(Reference::Event),
            manual: a.manual.clone().unwrap_or_default(),
            trial_params: a.trial_params.clone().unwrap_or_default(),
        };
        Ok(propose(
            &self.session_dir(&a.session_id)?,
            &self.manifest(&a.session_id)?,
            inputs,
        )?)
    }

    fn aligned_view(&self, session_id: &str, alignment: Alignment) -> Result<Value> {
        let dir = self.session_dir(session_id)?;
        let manifest = self.manifest(session_id)?;
        Ok(json!({
            "charts": chart_data(&dir, &manifest, &alignment)?,
            "values": metric_series(&dir, &manifest, &alignment)?,
            "alignment": alignment,
        }))
    }

    fn session_dir(&self, id: &str) -> Result<PathBuf> {
        let dir = self.sessions.path(id);
        let safe = !id.is_empty()
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if safe && dir.join("session.json").is_file() {
            Ok(dir)
        } else {
            Err(ApiError::new(
                ErrorKind::NotFound,
                format!("No session {id}"),
            ))
        }
    }

    /// The live run's manifest while this process runs it, otherwise the saved one.
    fn manifest(&self, id: &str) -> Result<Manifest> {
        self.session_dir(id)?;
        match self.run(id) {
            Some(run) => Ok((*run.manifest()).clone()),
            None => Ok(self.sessions.load(id)?),
        }
    }

    fn run(&self, id: &str) -> Option<GroupRun> {
        self.runs.lock().unwrap().get(id).cloned()
    }

    fn running(&self, id: &str, refusal: &str) -> Result<GroupRun> {
        self.run(id)
            .filter(|run| run.manifest().status == SessionStatus::Running)
            .ok_or_else(|| ApiError::new(ErrorKind::Conflict, refusal))
    }

    fn is_live(&self, manifest: &Manifest) -> bool {
        self.run(&manifest.id).is_some()
            && matches!(
                manifest.status,
                SessionStatus::Running | SessionStatus::Stopping
            )
    }
}

fn reply<T: Serialize>(value: T) -> Result<Value> {
    serde_json::to_value(value).map_err(|e| ApiError::new(ErrorKind::Internal, e))
}

fn parse<T: DeserializeOwned>(args: Value) -> Result<T> {
    let args = if args.is_null() { json!({}) } else { args };
    serde_json::from_value(args)
        .map_err(|e| ApiError::new(ErrorKind::Invalid, format!("Bad arguments: {e}")))
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, out);
        } else {
            out.push(path);
        }
    }
}

#[derive(Deserialize)]
struct TemplateRef {
    template_id: String,
    revision: Option<i64>,
}

#[derive(Deserialize)]
struct SaveTemplate {
    template_id: String,
    yaml: Option<String>,
    data: Option<Value>,
}

#[derive(Deserialize)]
struct SessionRef {
    session_id: String,
}

#[derive(Deserialize)]
struct LiveArgs {
    session_id: String,
    #[serde(default)]
    cursors: Cursors,
}

#[derive(Deserialize)]
struct StopArgs {
    session_id: String,
    #[serde(default)]
    cancel: bool,
}

#[derive(Deserialize)]
struct MarkArgs {
    session_id: String,
    event: String,
}

#[derive(Deserialize)]
struct StartRun {
    template_id: String,
    revision: Option<i64>,
    speed: Option<f64>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct ImportArgs {
    template_id: String,
    revision: Option<i64>,
    name: Option<String>,
    files: Vec<ImportArg>,
}

#[derive(Deserialize)]
struct ImportArg {
    role: String,
    path: PathBuf,
    label: Option<String>,
}

#[derive(Deserialize)]
struct AlignArgs {
    session_id: String,
    reference: Option<Reference>,
    manual: Option<Manual>,
    trial_params: Option<TrialParams>,
}

#[derive(Deserialize)]
struct AlignmentRef {
    session_id: String,
    alignment_id: String,
}

#[derive(Deserialize)]
struct LegacyArgs {
    session_id: String,
    capture: String,
}

#[derive(Deserialize)]
struct QueryArgs {
    session_id: String,
    sql: String,
    alignment_id: Option<String>,
}
