//! The analysis as the run page paints it: every value computed by the engine.

use indexmap::IndexMap;
use serde::Serialize;

use crate::params::ParamSource;
use crate::templates::Template;

use super::fold::fold;
use super::store::Record;

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

pub(super) fn view_of(template: &Template, log: &[Record]) -> AnalysisView {
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
