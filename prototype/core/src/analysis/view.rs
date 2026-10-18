//! The analysis as the run page paints it: every value computed by the engine.

use indexmap::IndexMap;
use serde::Serialize;

use crate::params::ParamSource;
use crate::session::iso_time;
use crate::templates::Template;

use super::fold::{FitState, StepState, fold};
use super::reading::{Range, ReadingValue};
use super::spec::StepKind;
use super::store::{Record, RecordId};

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
    /// Every step in template order, with the reading that fills it.
    pub steps: IndexMap<String, StepView>,
    /// Every line calibration's fit, in template order.
    pub fits: IndexMap<String, FitState>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct StepReading {
    pub record: RecordId,
    #[serde(with = "iso_time")]
    pub created_utc: chrono::DateTime<chrono::Utc>,
    pub capture: String,
    pub range_s: Range,
    pub values: IndexMap<String, ReadingValue>,
}

impl From<&StepState> for StepReading {
    fn from(s: &StepState) -> StepReading {
        StepReading {
            record: s.record.clone(),
            created_utc: s.created_utc,
            capture: s.capture.clone(),
            range_s: s.range_s,
            values: s.values.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct StepView {
    pub label: String,
    /// The calibration or measurement the step belongs to.
    pub owner: String,
    pub role: String,
    /// `set`, `point` or `measure`.
    pub kind: &'static str,
    /// A calibration point's known value.
    pub known: Option<f64>,
    /// None until the step is read, and again once its reading is retracted.
    pub reading: Option<StepReading>,
}

pub(super) fn view_of(template: &Template, log: &[Record]) -> AnalysisView {
    let state = fold(template.analysis(), log);
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
    let steps = template
        .analysis()
        .steps
        .iter()
        .map(|(id, step)| {
            let (kind, known) = match step.kind {
                StepKind::Set => ("set", None),
                StepKind::Point { known } => ("point", Some(known)),
                StepKind::Measure => ("measure", None),
            };
            let view = StepView {
                label: step.label.clone(),
                owner: step.owner.clone(),
                role: step.role.clone(),
                kind,
                known,
                reading: state.steps.get(id).map(StepReading::from),
            };
            (id.clone(), view)
        })
        .collect();
    AnalysisView {
        rev: state.rev,
        parameters,
        steps,
        fits: state.fits,
    }
}
