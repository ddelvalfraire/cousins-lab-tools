//! Session analysis: what the operator read, typed and tabled during a session, kept as an
//! immutable log, and the state that log folds to.

mod fold;
mod store;

use std::path::Path;

use indexmap::IndexMap;
use serde::Serialize;

use crate::params::ParamSource;
use crate::query::AnalysisError;
use crate::session::Manifest;
use crate::templates::{Template, from_snapshot};

pub use fold::{AnalysisState, fold};
pub use store::{Action, Record, RecordId, append, load_records};

/// Where a parameter's value came from, or why it has none.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Origin {
    Set(ParamSource),
    Unset { source: &'static str, why: String },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ParameterView {
    pub value: Option<f64>,
    pub unit: String,
    pub label: String,
    pub note: String,
    /// The operator may type it.
    pub entry: bool,
    #[serde(flatten)]
    pub origin: Origin,
}

/// Everything the analysis tiles paint, computed by the engine.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AnalysisView {
    pub rev: u64,
    /// Every template parameter in template order, with its effective value.
    pub parameters: IndexMap<String, ParameterView>,
}

fn view_of(template: &Template, log: &[Record]) -> AnalysisView {
    let state = fold(log);
    let resolved = state.resolve(template);
    let parameters = template
        .param_specs()
        .iter()
        .map(|spec| {
            let origin = match (
                resolved.sources.get(&spec.name),
                resolved.values.get(&spec.name),
            ) {
                (Some(source), Some(_)) => Origin::Set(source.clone()),
                _ => Origin::Unset {
                    source: "unset",
                    why: resolved.unset.get(&spec.name).cloned().unwrap_or_default(),
                },
            };
            let view = ParameterView {
                value: resolved.values.get(&spec.name).copied(),
                unit: spec.unit.clone(),
                label: spec.label.clone(),
                note: spec.note.clone(),
                entry: spec.entry,
                origin,
            };
            (spec.name.clone(), view)
        })
        .collect();
    AnalysisView {
        rev: state.rev,
        parameters,
    }
}

/// The session's analysis as it stands.
pub fn view(session_dir: &Path, manifest: &Manifest) -> Result<AnalysisView, AnalysisError> {
    let template = from_snapshot(manifest.template.clone())?;
    Ok(view_of(&template, &load_records(session_dir)?))
}
