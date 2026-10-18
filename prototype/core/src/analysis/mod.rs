//! Session analysis: what the operator read, typed and tabled during a session, kept as an
//! immutable log, and the state that log folds to.
//!
//! A request is the boundary type. The engine turns it into a record by checking it against
//! the session's template and computing whatever the record holds, so the UI can never supply
//! a value the engine did not compute.

mod export;
mod fold;
mod reading;
pub(crate) mod spec;
mod store;
mod view;

use std::path::Path;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::alignment::TemplateRef;
use crate::calc::Program;
use crate::expr::Params;
use crate::query::{AnalysisError, SessionDb};
use crate::session::{Manifest, utc_now};
use crate::templates::{Template, from_snapshot};

pub use export::{TableExport, export_table};
pub use fold::{AnalysisState, Draft, FitState, StepState, TableRow, draft, fold};
pub use reading::{Range, RangeError, ReadingValue, read_range};
pub use spec::{
    AnalysisSpec, CalPoint, Calibration, CalibrationKind, MeasureStep, Measurement, ReadingSpec,
    ResultSpec, Stat, StepKind, StepSpec,
};
pub use store::{Action, Record, RecordId, append, load_records};
use view::view_of;
pub use view::{
    AnalysisView, ColumnView, Origin, ParameterView, RowView, StepReading, StepView, TableView,
    XySeries, XyView,
};

/// One operator action as the UI sends it.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Request {
    Reading {
        step: String,
        capture: String,
        range_s: Range,
    },
    Entry {
        parameter: String,
        value: Option<f64>,
    },
    AddRow {
        measurement: String,
        #[serde(default)]
        labels: IndexMap<String, String>,
    },
    Retract {
        records: Vec<String>,
    },
}

/// The view after a request, with the record that request saved.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Recorded {
    pub record: RecordId,
    #[serde(flatten)]
    pub view: AnalysisView,
}

fn invalid(message: impl Into<String>) -> AnalysisError {
    AnalysisError::Invalid(message.into())
}

/// The session's analysis as it stands.
pub fn view(session_dir: &Path, manifest: &Manifest) -> Result<AnalysisView, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    Ok(view_of(&template, &load_records(session_dir)?))
}

/// What reading `step` over `range` of `capture` gives now: the source clock's column, the
/// values from stored rows, and the parameters they used.
fn take_reading(
    session_dir: &Path,
    manifest: &Manifest,
    template: &Template,
    log: &[Record],
    step: &str,
    capture: &str,
    range: Range,
) -> Result<(String, IndexMap<String, ReadingValue>, Params), AnalysisError> {
    let spec = template
        .analysis()
        .steps
        .get(step)
        .ok_or_else(|| invalid(format!("No step {step}")))?;
    let recorded = manifest
        .captures
        .get(capture)
        .ok_or_else(|| invalid(format!("No capture {capture}")))?;
    if recorded.role != spec.role {
        return Err(invalid(format!(
            "Capture {capture} records role {}; step {step} reads role {}",
            recorded.role, spec.role
        )));
    }
    let program = Program::for_role(template, &spec.role, &recorded.clocks)
        .map_err(|e| invalid(e.to_string()))?;
    let clock = program
        .clock()
        .map(|c| c.column.clone())
        .unwrap_or_default();
    let params = fold(template.analysis(), log).resolve(template).values;
    let db = SessionDb::open(session_dir, manifest)?;
    let complete = recorded.status.is_finished();
    let values = read_range(
        &db,
        &program,
        &params,
        capture,
        range,
        &spec.readings,
        complete,
    )?;
    Ok((clock, values, params))
}

/// What a reading would hold, computed from stored rows and not saved.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Preview {
    pub step: String,
    pub capture: String,
    pub range_s: Range,
    pub values: IndexMap<String, ReadingValue>,
}

pub fn preview(
    session_dir: &Path,
    manifest: &Manifest,
    step: String,
    capture: String,
    range_s: Range,
) -> Result<Preview, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let log = load_records(session_dir)?;
    let (_, values, _) = take_reading(
        session_dir,
        manifest,
        &template,
        &log,
        &step,
        &capture,
        range_s,
    )?;
    Ok(Preview {
        step,
        capture,
        range_s,
        values,
    })
}

/// The record `request` makes, checked against the template and the log so far.
fn action_for(
    session_dir: &Path,
    manifest: &Manifest,
    template: &Template,
    log: &[Record],
    request: Request,
) -> Result<Action, AnalysisError> {
    match request {
        Request::Reading {
            step,
            capture,
            range_s,
        } => {
            let (clock, values, params) = take_reading(
                session_dir,
                manifest,
                template,
                log,
                &step,
                &capture,
                range_s,
            )?;
            Ok(Action::Reading {
                step,
                capture,
                range_s,
                clock,
                values,
                params,
            })
        }
        Request::Entry { parameter, value } => {
            let spec = template
                .param_specs()
                .iter()
                .find(|s| s.name == parameter)
                .ok_or_else(|| invalid(format!("No parameter {parameter}")))?;
            if !spec.entry {
                return Err(invalid(format!(
                    "Parameter {parameter} cannot be typed in; only parameters with entry: true can"
                )));
            }
            Ok(Action::Entry { parameter, value })
        }
        Request::AddRow {
            measurement,
            labels,
        } => {
            let m = template
                .analysis()
                .measurements
                .get(&measurement)
                .ok_or_else(|| invalid(format!("No measurement {measurement}")))?;
            if let Some(key) = labels.keys().find(|k| !m.labels.contains_key(*k)) {
                return Err(invalid(format!(
                    "Measurement {measurement} has no label {key}"
                )));
            }
            let state = fold(template.analysis(), log);
            let params = state.resolve(template).values;
            let next = draft(m, &state, &params);
            if next.records.is_empty() {
                return Err(invalid("Draft has no readings"));
            }
            let labels = m
                .labels
                .keys()
                .map(|k| (k.clone(), labels.get(k).cloned().unwrap_or_default()))
                .collect();
            Ok(Action::AddRow {
                measurement,
                labels,
                readings: next.records,
                results: next.results,
                params,
            })
        }
        Request::Retract { records } => {
            if records.is_empty() {
                return Err(invalid("Name at least one record to retract"));
            }
            let mut ids = Vec::new();
            for text in records {
                let found = RecordId::parse(&text)
                    .and_then(|id| log.iter().find(|r| r.id == id))
                    .ok_or(AnalysisError::RecordNotFound(text))?;
                if matches!(found.action, Action::Retract { .. }) {
                    return Err(invalid(format!(
                        "{} is a retraction and cannot be retracted",
                        found.id
                    )));
                }
                ids.push(found.id.clone());
            }
            Ok(Action::Retract { records: ids })
        }
    }
}

/// Checks `request` against the session's template snapshot, saves the record it makes, and
/// returns the new view. A `request_id` already in the log saves nothing and returns the
/// record that request made the first time.
pub fn record(
    session_dir: &Path,
    manifest: &Manifest,
    request_id: Option<String>,
    request: Request,
) -> Result<Recorded, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    let log = load_records(session_dir)?;
    let earlier = request_id
        .as_ref()
        .and_then(|id| log.iter().find(|r| r.request_id.as_ref() == Some(id)));
    if let Some(earlier) = earlier {
        return Ok(Recorded {
            record: earlier.id.clone(),
            view: view_of(&template, &log),
        });
    }
    let action = action_for(session_dir, manifest, &template, &log, request)?;
    let saved = append(
        session_dir,
        TemplateRef {
            id: template.id().into(),
            revision: template.revision(),
        },
        request_id,
        action,
        utc_now(),
    )?;
    Ok(Recorded {
        record: saved.id,
        view: view_of(&template, &load_records(session_dir)?),
    })
}
