//! Session analysis: what the operator read, typed and tabled during a session, kept as an
//! immutable log, and the state that log folds to.
//!
//! A request is the boundary type. The engine turns it into a record by checking it against
//! the session's template and computing whatever the record holds, so the UI can never supply
//! a value the engine did not compute.

mod fold;
mod reading;
pub(crate) mod spec;
mod store;
mod view;

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::alignment::TemplateRef;
use crate::query::AnalysisError;
use crate::session::{Manifest, utc_now};
use crate::templates::{Template, from_snapshot};

pub use fold::{AnalysisState, fold};
pub use reading::{Range, RangeError, ReadingValue, read_range};
pub use spec::{
    AnalysisSpec, CalPoint, Calibration, CalibrationKind, MeasureStep, Measurement, ReadingSpec,
    ResultSpec, Stat, StepKind, StepSpec,
};
pub use store::{Action, Record, RecordId, append, load_records};
use view::view_of;
pub use view::{AnalysisView, Origin, ParameterView};

/// One operator action as the UI sends it.
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Request {
    Entry {
        parameter: String,
        value: Option<f64>,
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

/// The record `request` makes, checked against the template and the log so far.
fn action_for(
    template: &Template,
    log: &[Record],
    request: Request,
) -> Result<Action, AnalysisError> {
    match request {
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
    let action = action_for(&template, &log, request)?;
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
