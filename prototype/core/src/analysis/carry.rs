//! Calibrations carried from one session to another: the effective calibration state of a
//! session, copied into another session of the same template as new records.

use std::path::Path;

use indexmap::IndexMap;
use serde::Serialize;

use crate::alignment::TemplateRef;
use crate::params::ParamSource;
use crate::query::AnalysisError;
use crate::session::{Manifest, utc_now};
use crate::templates::{Template, from_snapshot};

use super::fold::fold;
use super::spec::StepKind;
use super::store::{Action, Provenance, Record, RecordId, append, load_records};
use super::view::{AnalysisView, view_of};

/// One value of a session's calibration state, with the record that holds it.
#[derive(Clone, Debug, PartialEq)]
pub enum Carried {
    Step {
        step: String,
        values: IndexMap<String, f64>,
        record: RecordId,
    },
    Entry {
        parameter: String,
        value: f64,
        record: RecordId,
    },
}

/// What a command that saves several records at once did.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Applied {
    pub records: Vec<RecordId>,
    /// What was left out and why, one sentence each.
    pub notes: Vec<String>,
    #[serde(flatten)]
    pub view: AnalysisView,
}

/// The latest values of the calibration steps (not measurement steps) and every entered
/// parameter, in template order. Table rows and drafts are not calibration state.
pub fn calibration_state(template: &Template, log: &[Record]) -> Vec<Carried> {
    let spec = template.analysis();
    let state = fold(spec, log);
    let mut out = Vec::new();
    for (id, step) in &spec.steps {
        let Some(filled) = state
            .steps
            .get(id)
            .filter(|_| step.kind != StepKind::Measure)
        else {
            continue;
        };
        let values: IndexMap<String, f64> = filled
            .values()
            .into_iter()
            .filter_map(|(name, v)| Some((name, v?)))
            .collect();
        if !values.is_empty() {
            out.push(Carried::Step {
                step: id.clone(),
                values,
                record: filled.record.clone(),
            });
        }
    }
    for p in template.param_specs() {
        let entered = match state.sources.get(&p.name) {
            Some(ParamSource::Entered { record }) => RecordId::parse(record),
            _ => None,
        };
        if let (Some(record), Some(value)) = (entered, state.params.get(&p.name)) {
            out.push(Carried::Entry {
                parameter: p.name.clone(),
                value: *value,
                record,
            });
        }
    }
    out
}

/// The action that saves `carried` in a session of `template`, or why it cannot.
pub(super) fn action_for(
    template: &Template,
    carried: Carried,
    from: impl Fn(&RecordId) -> Option<Provenance>,
) -> Result<Action, String> {
    match carried {
        Carried::Step {
            step,
            values,
            record,
        } => {
            let Some(spec) = template.analysis().steps.get(&step) else {
                return Err(format!("Step {step} is not in this template revision"));
            };
            if let Some(name) = values.keys().find(|n| !spec.readings.contains_key(*n)) {
                return Err(format!("Step {step} has no reading {name} here"));
            }
            Ok(Action::Typed {
                from: from(&record),
                step,
                values,
            })
        }
        Carried::Entry {
            parameter,
            value,
            record,
        } => {
            let entry = template
                .param_specs()
                .iter()
                .any(|p| p.name == parameter && p.entry);
            if !entry {
                return Err(format!(
                    "Parameter {parameter} cannot be typed in this template revision"
                ));
            }
            Ok(Action::Entry {
                from: from(&record),
                parameter,
                value: Some(value),
            })
        }
    }
}

/// Saves `actions` in order. A `request_id` already used saves nothing again and returns
/// the records it saved the first time.
pub(super) fn apply(
    session_dir: &Path,
    template: &Template,
    request_id: Option<String>,
    actions: Vec<Action>,
    notes: Vec<String>,
) -> Result<Applied, AnalysisError> {
    let log = load_records(session_dir)?;
    let prefix = request_id.map(|id| format!("{id}#"));
    let earlier: Vec<RecordId> = log
        .iter()
        .filter(|r| {
            prefix
                .as_ref()
                .zip(r.request_id.as_ref())
                .is_some_and(|(p, id)| id.starts_with(p.as_str()))
        })
        .map(|r| r.id.clone())
        .collect();
    let mut records = earlier;
    if records.is_empty() {
        for (i, action) in actions.into_iter().enumerate() {
            let saved = append(
                session_dir,
                TemplateRef {
                    id: template.id().into(),
                    revision: template.revision(),
                },
                prefix.as_ref().map(|p| format!("{p}{i}")),
                action,
                utc_now(),
            )?;
            records.push(saved.id);
        }
    }
    Ok(Applied {
        records,
        notes,
        view: view_of(template, &load_records(session_dir)?),
    })
}

/// Copies the calibration state of the session in `source_dir` into this session, each
/// value as a new record naming the source session and record.
pub fn copy_calibrations(
    session_dir: &Path,
    manifest: &Manifest,
    source_dir: &Path,
    source: &Manifest,
    request_id: Option<String>,
) -> Result<Applied, AnalysisError> {
    let invalid = |m: String| AnalysisError::Invalid(m);
    if source.id == manifest.id {
        return Err(invalid(
            "A session cannot copy calibrations from itself".into(),
        ));
    }
    let template = from_snapshot(manifest.template.clone())?;
    let theirs = from_snapshot(source.template.clone())?;
    if theirs.id() != template.id() {
        return Err(invalid(format!(
            "Session {} uses template {}; this session uses {}. Calibrations copy only between sessions of the same template",
            source.id,
            theirs.id(),
            template.id()
        )));
    }
    let carried = calibration_state(&theirs, &load_records(source_dir)?);
    if carried.is_empty() {
        return Err(invalid(format!(
            "Session {} has no calibrations to copy",
            source.id
        )));
    }
    let from = |record: &RecordId| {
        Some(Provenance::Session {
            session: source.id.clone(),
            record: record.clone(),
        })
    };
    let mut actions = Vec::new();
    let mut notes = Vec::new();
    for c in carried {
        match action_for(&template, c, from) {
            Ok(action) => actions.push(action),
            Err(why) => notes.push(format!("{why}; not copied")),
        }
    }
    if actions.is_empty() {
        return Err(invalid(format!(
            "Nothing in session {} fits this template revision: {}",
            source.id,
            notes.join(" ")
        )));
    }
    apply(session_dir, &template, request_id, actions, notes)
}
