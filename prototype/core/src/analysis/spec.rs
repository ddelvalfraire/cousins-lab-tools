//! What a template declares about analysis: calibrations, parsed into typed specs once at
//! validation.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::pycompat::list_repr;
use crate::templates::object;

const STATS: [&str; 2] = ["mean", "slope"];

/// A statistic over the stored rows of a range. A slope is per second on the source clock.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stat {
    Mean,
    Slope,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadingSpec {
    pub stat: Stat,
    /// A column or derived value of the owner's role.
    pub of: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CalibrationKind {
    /// One range sets each named parameter to a statistic over it.
    Set { sets: IndexMap<String, ReadingSpec> },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Calibration {
    pub label: String,
    pub role: String,
    pub kind: CalibrationKind,
}

impl Calibration {
    /// The parameters this calibration sets, in declaration order.
    pub fn outputs(&self) -> Vec<&str> {
        match &self.kind {
            CalibrationKind::Set { sets } => sets.keys().map(String::as_str).collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum StepKind {
    /// A `set` calibration's one range.
    Set,
}

/// One button's worth of analysis: a range the operator reads, and what it reads.
#[derive(Clone, Debug, PartialEq)]
pub struct StepSpec {
    /// The calibration that owns the step.
    pub owner: String,
    pub kind: StepKind,
    pub label: String,
    pub role: String,
    /// Reading name to what it reads. A set step names each reading after its parameter.
    pub readings: IndexMap<String, ReadingSpec>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AnalysisSpec {
    pub calibrations: IndexMap<String, Calibration>,
    /// Every step by its reference, a bare id for a one-range owner.
    pub steps: IndexMap<String, StepSpec>,
}

impl AnalysisSpec {
    pub fn is_empty(&self) -> bool {
        self.calibrations.is_empty()
    }
}

fn is_id(text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

fn text(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

/// `{stat, of}`, or the first thing wrong with it.
fn reading(value: &Value) -> Result<ReadingSpec, String> {
    let stat = match value.get("stat").and_then(Value::as_str) {
        Some("mean") => Stat::Mean,
        Some("slope") => Stat::Slope,
        _ => return Err(format!("stat must be one of {}", list_repr(STATS))),
    };
    let of = value
        .get("of")
        .and_then(Value::as_str)
        .ok_or("of must be the name of a column or derived value")?;
    Ok(ReadingSpec {
        stat,
        of: of.to_string(),
    })
}

fn mapping(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object).filter(|m| !m.is_empty())
}

fn set(spec: &Value, errors: &mut Vec<String>) -> Option<CalibrationKind> {
    let Some(given) = mapping(Some(spec)) else {
        errors.push("set must map parameters to {stat, of}".into());
        return None;
    };
    let mut sets = IndexMap::new();
    for (parameter, r) in given {
        match reading(r) {
            Ok(r) => {
                sets.insert(parameter.clone(), r);
            }
            Err(e) => errors.push(format!("set {parameter}: {e}")),
        }
    }
    Some(CalibrationKind::Set { sets })
}

fn calibration(id: &str, spec: &Value, errors: &mut Vec<String>) -> Option<Calibration> {
    let mut own = Vec::new();
    if !spec.is_object() {
        own.push("settings must be a mapping".into());
    } else if !is_id(id) {
        own.push("ids may use only letters, digits, '_' and '-'".into());
    }
    let kind = match spec.get("set") {
        _ if !own.is_empty() => None,
        Some(s) => set(s, &mut own),
        None => {
            own.push("needs set".into());
            None
        }
    };
    let role = spec.get("role").and_then(Value::as_str).unwrap_or_default();
    errors.extend(own.iter().map(|e| format!("Calibration {id}: {e}")));
    (own.is_empty()).then(|| Calibration {
        label: text(spec, "label", id),
        role: role.to_string(),
        kind: kind.expect("a calibration without errors has a kind"),
    })
}

fn steps_of(calibrations: &IndexMap<String, Calibration>) -> IndexMap<String, StepSpec> {
    let mut steps = IndexMap::new();
    for (id, c) in calibrations {
        let step = |kind, label: &str, readings| StepSpec {
            owner: id.clone(),
            kind,
            label: label.to_string(),
            role: c.role.clone(),
            readings,
        };
        match &c.kind {
            CalibrationKind::Set { sets } => {
                steps.insert(id.clone(), step(StepKind::Set, &c.label, sets.clone()));
            }
        }
    }
    steps
}

/// The template's analysis spec, and every shape problem in it. An entry with a problem is
/// left out of the spec.
pub fn parse(data: &Value) -> (AnalysisSpec, Vec<String>) {
    let mut errors = Vec::new();
    let mut calibrations = IndexMap::new();
    for (id, spec) in object(data, "calibrations") {
        if let Some(c) = calibration(id, spec, &mut errors) {
            calibrations.insert(id.clone(), c);
        }
    }
    let steps = steps_of(&calibrations);
    (
        AnalysisSpec {
            calibrations,
            steps,
        },
        errors,
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::templates::{Paths, Template, load_profiles, validate};

    fn base() -> Value {
        json!({
            "id": "spec-test",
            "revision": 1,
            "name": "Spec test",
            "roles": {"ms": {"instrument": "ms-legacy-frames-replay", "import": "legacy_frames"}},
            "parameters": {
                "slope_p": {"unit": "µl/mV"},
                "intercept_p": {"unit": "µl"},
                "zero_p": {"unit": "mV"},
                "temp_c": {"entry": true},
            },
            "derived": {"d44": {"role": "ms", "expr": "m44 * 2"}},
        })
    }

    fn with(key: &str, value: Value) -> Result<Template, String> {
        let mut data = base();
        data[key] = value;
        let profiles = load_profiles(&Paths::default().instruments).unwrap();
        validate(data, &profiles).map_err(|e| e.0)
    }

    #[test]
    fn set_calibrations_parse_into_typed_specs_with_one_step_each() {
        let template = with(
            "calibrations",
            json!({
                "zero": {"label": "CO2 Zero", "role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}},
                "blank": {"role": "ms", "set": {
                    "slope_p": {"stat": "slope", "of": "d44"},
                    "intercept_p": {"stat": "mean", "of": "m32"},
                }},
            }),
        )
        .unwrap();
        let spec = template.analysis();
        assert_eq!(
            spec.calibrations["blank"].outputs(),
            ["slope_p", "intercept_p"]
        );
        assert_eq!(spec.calibrations["blank"].label, "blank");
        let steps: Vec<(&str, &str, &str)> = spec
            .steps
            .iter()
            .map(|(id, s)| (id.as_str(), s.owner.as_str(), s.label.as_str()))
            .collect();
        assert_eq!(
            steps,
            [("zero", "zero", "CO2 Zero"), ("blank", "blank", "blank")]
        );
        let reading = |stat, of: &str| ReadingSpec {
            stat,
            of: of.into(),
        };
        assert_eq!(
            spec.steps["blank"].readings,
            IndexMap::from([
                ("slope_p".into(), reading(Stat::Slope, "d44")),
                ("intercept_p".into(), reading(Stat::Mean, "m32")),
            ])
        );
        assert_eq!(spec.steps["zero"].kind, StepKind::Set);
    }

    #[test]
    fn each_problem_in_a_calibration_gets_its_own_message() {
        let error = with(
            "calibrations",
            json!({
                "none": {"role": "ms"},
                "co.2": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}},
                "empty": {"role": "ms", "set": {}},
                "nostat": {"role": "ms", "set": {"zero_p": {"of": "m44"}}},
                "noof": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": 3}}},
                "flat": "zero",
            }),
        )
        .unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "Calibration none: needs set",
                "Calibration co.2: ids may use only letters, digits, '_' and '-'",
                "Calibration empty: set must map parameters to {stat, of}",
                "Calibration nostat: set zero_p: stat must be one of ['mean', 'slope']",
                "Calibration noof: set zero_p: of must be the name of a column or derived value",
                "Calibration flat: settings must be a mapping",
            ]
        );
        assert_eq!(
            with("calibrations", json!([])).unwrap_err(),
            "calibrations must be a mapping"
        );
    }
}
