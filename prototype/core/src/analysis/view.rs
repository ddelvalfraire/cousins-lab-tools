//! The analysis as the run page paints it: every value computed by the engine.

use indexmap::IndexMap;
use serde::Serialize;

use crate::params::ParamSource;
use crate::session::iso_time;
use crate::templates::{Template, is_xy};

use super::fold::AnalysisState;
use super::fold::{Draft, FitState, StepState, TableRow, draft, fold};
use super::reading::{Range, ReadingValue};
use super::spec::{AnalysisSpec, CalibrationKind, StepKind};
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
    /// Every measurement's next row, in template order.
    pub drafts: IndexMap<String, Draft>,
    pub tables: IndexMap<String, TableView>,
    /// Every xy chart by id, its series computed here so the UI plots them as given.
    pub xy: IndexMap<String, XyView>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct XySeries {
    pub name: String,
    pub color: Option<String>,
    /// `[x, y]`: a calibration point's reading and known value, or a table row's results.
    pub points: Vec<[f64; 2]>,
    /// A line calibration's fit across the x range of its points, once it has one.
    pub line: Option<[[f64; 2]; 2]>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct XyView {
    pub series: Vec<XySeries>,
}

/// The series of one xy chart from the folded state.
fn xy_series(
    series: &serde_json::Value,
    spec: &AnalysisSpec,
    state: &AnalysisState,
) -> Option<XySeries> {
    let text = |key: &str| series[key].as_str().map(String::from);
    if let Some(id) = series["calibration"].as_str() {
        let calibration = spec.calibrations.get(id)?;
        let CalibrationKind::Line {
            reading, points, ..
        } = &calibration.kind
        else {
            return None;
        };
        let xy: Vec<[f64; 2]> = points
            .iter()
            .filter_map(|(point, p)| {
                let step = state.steps.get(&format!("{id}.{point}"))?;
                Some([step.values.get(&reading.of)?.value?, p.known])
            })
            .collect();
        let fit = state.fits.get(id);
        let line =
            fit.and_then(|f| Some((f.slope?, f.intercept?)))
                .and_then(|(slope, intercept)| {
                    let lo = xy.iter().map(|p| p[0]).reduce(f64::min)?;
                    let hi = xy.iter().map(|p| p[0]).reduce(f64::max)?;
                    Some([[lo, intercept + slope * lo], [hi, intercept + slope * hi]])
                });
        return Some(XySeries {
            name: text("label").unwrap_or_else(|| calibration.label.clone()),
            color: text("color"),
            points: xy,
            line,
        });
    }
    let id = series["measurement"].as_str()?;
    let measurement = spec.measurements.get(id)?;
    let (x, y) = (series["x"].as_str()?, series["y"].as_str()?);
    let points = state
        .tables
        .get(id)
        .into_iter()
        .flatten()
        .filter_map(|row| Some([(*row.results.get(x)?)?, (*row.results.get(y)?)?]))
        .collect();
    Some(XySeries {
        name: text("label").unwrap_or_else(|| measurement.label.clone()),
        color: text("color"),
        points,
        line: None,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ColumnView {
    pub key: String,
    pub label: String,
    pub unit: String,
    /// `label` for text the operator types, `result` for a computed value.
    pub kind: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RowView {
    pub record: RecordId,
    #[serde(with = "iso_time")]
    pub created_utc: chrono::DateTime<chrono::Utc>,
    pub labels: IndexMap<String, String>,
    pub results: IndexMap<String, Option<f64>>,
}

impl From<&TableRow> for RowView {
    fn from(row: &TableRow) -> RowView {
        RowView {
            record: row.record.clone(),
            created_utc: row.created_utc,
            labels: row.labels.clone(),
            results: row.results.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TableView {
    /// Labels first, then results, each in template order.
    pub columns: Vec<ColumnView>,
    pub rows: Vec<RowView>,
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
    let mut drafts = IndexMap::new();
    let mut tables = IndexMap::new();
    for (id, m) in &template.analysis().measurements {
        drafts.insert(id.clone(), draft(m, &state, &resolved.values));
        let labels = m.labels.iter().map(|(key, label)| ColumnView {
            key: key.clone(),
            label: label.clone(),
            unit: String::new(),
            kind: "label",
        });
        let results = m.results.iter().map(|(key, r)| ColumnView {
            key: key.clone(),
            label: r.label.clone(),
            unit: r.unit.clone(),
            kind: "result",
        });
        let rows = state.tables.get(id).into_iter().flatten();
        let table = TableView {
            columns: labels.chain(results).collect(),
            rows: rows.map(RowView::from).collect(),
        };
        tables.insert(id.clone(), table);
    }
    let xy = template
        .charts()
        .iter()
        .filter(|chart| is_xy(chart))
        .map(|chart| {
            let series = chart["series"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|s| xy_series(s, template.analysis(), &state))
                .collect();
            let id = chart["id"].as_str().unwrap_or_default().to_string();
            (id, XyView { series })
        })
        .collect();
    AnalysisView {
        rev: state.rev,
        parameters,
        steps,
        fits: state.fits,
        drafts,
        tables,
        xy,
    }
}
