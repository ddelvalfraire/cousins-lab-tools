//! What a template declares about analysis: calibrations and measurements, parsed into
//! typed specs once at validation. `parse` checks shapes; `check` checks names against the
//! rest of the template. `parse` checks shapes; `check` checks names against the rest of the template.

use std::collections::{BTreeMap, BTreeSet};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::expr::{self, Expression};
use crate::params::ParamSpec;
use crate::pycompat::{list_repr, repr, str_repr};
use crate::templates::{DerivedValue, object};

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
pub struct CalPoint {
    pub label: String,
    pub known: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CalibrationKind {
    /// One range sets each named parameter to a statistic over it.
    Set { sets: IndexMap<String, ReadingSpec> },
    /// Each point's range gives one reading; a least-squares line of known on reading sets
    /// `slope` and, when named, `intercept`, both in known units.
    Line {
        reading: ReadingSpec,
        points: IndexMap<String, CalPoint>,
        slope: String,
        intercept: Option<String>,
        min_points: usize,
        x_label: String,
        y_label: String,
    },
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
            CalibrationKind::Line {
                slope, intercept, ..
            } => [Some(slope.as_str()), intercept.as_deref()]
                .into_iter()
                .flatten()
                .collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeasureStep {
    pub label: String,
    pub readings: IndexMap<String, ReadingSpec>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResultSpec {
    /// Reads parameters, the measurement's readings and earlier results.
    pub expr: Expression,
    pub unit: String,
    pub label: String,
}

/// Readings taken over one or more ranges, results computed from them, and the text columns
/// the operator types, which together make one row of a results table.
#[derive(Clone, Debug, PartialEq)]
pub struct Measurement {
    pub label: String,
    pub role: String,
    /// By step reference: `<id>.<step>`, or the measurement's own id when the template gives
    /// its readings directly.
    pub steps: IndexMap<String, MeasureStep>,
    pub labels: IndexMap<String, String>,
    pub results: IndexMap<String, ResultSpec>,
}

impl Measurement {
    /// Every reading name with its step reference.
    pub fn readings(&self) -> impl Iterator<Item = (&str, &str, &ReadingSpec)> {
        self.steps.iter().flat_map(|(step, s)| {
            s.readings
                .iter()
                .map(move |(name, r)| (step.as_str(), name.as_str(), r))
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum StepKind {
    /// A `set` calibration's one range.
    Set,
    /// One point of a `line` calibration.
    Point { known: f64 },
    /// One range of a measurement.
    Measure,
}

/// One button's worth of analysis: a range the operator reads, and what it reads.
#[derive(Clone, Debug, PartialEq)]
pub struct StepSpec {
    /// The calibration or measurement that owns the step.
    pub owner: String,
    pub kind: StepKind,
    pub label: String,
    pub role: String,
    /// Reading name to what it reads. A set step names each reading after its parameter; a
    /// point names its one reading after the value it reads.
    pub readings: IndexMap<String, ReadingSpec>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AnalysisSpec {
    pub calibrations: IndexMap<String, Calibration>,
    pub measurements: IndexMap<String, Measurement>,
    /// Every step by its reference: `co2.ul1` for a point, a bare id for a one-range owner.
    pub steps: IndexMap<String, StepSpec>,
}

impl AnalysisSpec {
    pub fn is_empty(&self) -> bool {
        self.calibrations.is_empty() && self.measurements.is_empty()
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

fn line(spec: &Value, errors: &mut Vec<String>) -> Option<CalibrationKind> {
    let mut error = |e: String| errors.push(e);
    let reading = match reading(&spec["reading"]) {
        Ok(r) => Some(r),
        Err(e) => {
            error(format!("line.reading: {e}"));
            None
        }
    };
    let mut points = IndexMap::new();
    match mapping(spec.get("points")) {
        None => error("line.points must map point ids to {label, known}".into()),
        Some(given) => {
            for (id, point) in given {
                if !is_id(id) {
                    error(format!(
                        "point {}: ids may use only letters, digits, '_' and '-'",
                        str_repr(id)
                    ));
                }
                match point.get("known").and_then(Value::as_f64) {
                    Some(known) => {
                        let label = text(point, "label", id);
                        points.insert(id.clone(), CalPoint { label, known });
                    }
                    None => error(format!("point {id}: known must be a number")),
                }
            }
        }
    }
    let sets = &spec["sets"];
    let slope = sets.get("slope").and_then(Value::as_str);
    if slope.is_none() {
        error("line.sets.slope must name a parameter".into());
    }
    let intercept = match sets.get("intercept") {
        None => None,
        Some(v) => match v.as_str() {
            Some(name) => Some(name.to_string()),
            None => {
                error("line.sets.intercept must name a parameter".into());
                None
            }
        },
    };
    let count = spec["points"].as_object().map_or(0, Map::len);
    if count == 1 {
        error("line.points needs at least two points to fit a line".into());
    }
    let min_points = match spec.get("min_points") {
        None => 2,
        Some(v) => match v.as_u64().filter(|n| (2..=count as u64).contains(n)) {
            Some(n) => n as usize,
            None => {
                error(format!(
                    "line.min_points must be a whole number from 2 to the number of points ({count})"
                ));
                2
            }
        },
    };
    Some(CalibrationKind::Line {
        reading: reading?,
        points,
        slope: slope?.to_string(),
        intercept,
        min_points,
        x_label: text(spec, "x_label", ""),
        y_label: text(spec, "y_label", ""),
    })
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
    let kind = match (spec.get("set"), spec.get("line")) {
        _ if !own.is_empty() => None,
        (Some(_), Some(_)) => {
            own.push("give set or line, not both".into());
            None
        }
        (Some(s), None) => set(s, &mut own),
        (None, Some(l)) => line(l, &mut own),
        (None, None) => {
            own.push("needs set or line".into());
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

/// Name to reading spec, each problem reported after `place`.
fn readings(
    given: Option<&Value>,
    place: &str,
    errors: &mut Vec<String>,
) -> IndexMap<String, ReadingSpec> {
    let mut out = IndexMap::new();
    let Some(given) = mapping(given) else {
        errors.push(format!(
            "{place}readings must map reading names to {{stat, of}}"
        ));
        return out;
    };
    for (name, r) in given {
        match reading(r) {
            Ok(r) => {
                out.insert(name.clone(), r);
            }
            Err(e) => errors.push(format!("{place}reading {name}: {e}")),
        }
    }
    out
}

fn measurement(id: &str, spec: &Value, errors: &mut Vec<String>) -> Option<Measurement> {
    let mut own = Vec::new();
    if !spec.is_object() {
        own.push("settings must be a mapping".into());
    } else if !is_id(id) {
        own.push("ids may use only letters, digits, '_' and '-'".into());
    }
    let label = text(spec, "label", id);
    let mut steps = IndexMap::new();
    match (spec.get("readings"), spec.get("steps")) {
        _ if !own.is_empty() => {}
        (Some(_), Some(_)) => own.push("give readings or steps, not both".into()),
        (None, None) => own.push("needs readings or steps".into()),
        (Some(r), None) => {
            let readings = readings(Some(r), "", &mut own);
            steps.insert(id.to_string(), MeasureStep { label, readings });
        }
        (None, Some(given)) => match mapping(Some(given)) {
            None => own.push("steps must map step ids to {label, readings}".into()),
            Some(given) => {
                for (step, s) in given {
                    if !is_id(step) {
                        own.push(format!(
                            "step {}: ids may use only letters, digits, '_' and '-'",
                            str_repr(step)
                        ));
                    }
                    let place = format!("step {step}: ");
                    let readings = readings(s.get("readings"), &place, &mut own);
                    let label = text(s, "label", step);
                    steps.insert(format!("{id}.{step}"), MeasureStep { label, readings });
                }
            }
        },
    }
    let mut labels = IndexMap::new();
    match spec.get("labels").map(Value::as_object) {
        None => {}
        Some(Some(given)) if given.values().all(Value::is_string) => {
            for (key, label) in given {
                labels.insert(key.clone(), label.as_str().unwrap_or_default().to_string());
            }
        }
        Some(_) => own.push("labels must map keys to the text the table shows".into()),
    }
    let mut results = IndexMap::new();
    match mapping(spec.get("results")) {
        None => own.push("results must map result keys to {expr, unit, label}".into()),
        Some(given) => {
            for (key, r) in given {
                let parsed = r
                    .get("expr")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "expr must be text".to_string())
                    .and_then(|t| expr::parse(t).map_err(|e| e.to_string()));
                match parsed {
                    Ok(expr) => {
                        let result = ResultSpec {
                            expr,
                            unit: text(r, "unit", ""),
                            label: text(r, "label", key),
                        };
                        results.insert(key.clone(), result);
                    }
                    Err(e) => own.push(format!("result {key}: {e}")),
                }
            }
        }
    }
    errors.extend(own.iter().map(|e| format!("Measurement {id}: {e}")));
    own.is_empty().then(|| Measurement {
        label: text(spec, "label", id),
        role: text(spec, "role", ""),
        steps,
        labels,
        results,
    })
}

fn steps_of(
    calibrations: &IndexMap<String, Calibration>,
    measurements: &IndexMap<String, Measurement>,
) -> IndexMap<String, StepSpec> {
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
            CalibrationKind::Line {
                reading, points, ..
            } => {
                for (point, p) in points {
                    let readings = IndexMap::from([(reading.of.clone(), reading.clone())]);
                    let kind = StepKind::Point { known: p.known };
                    steps.insert(format!("{id}.{point}"), step(kind, &p.label, readings));
                }
            }
        }
    }
    for (id, m) in measurements {
        for (step, s) in &m.steps {
            let spec = StepSpec {
                owner: id.clone(),
                kind: StepKind::Measure,
                label: s.label.clone(),
                role: m.role.clone(),
                readings: s.readings.clone(),
            };
            steps.insert(step.clone(), spec);
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
    let mut measurements = IndexMap::new();
    for (id, spec) in object(data, "measurements") {
        if let Some(m) = measurement(id, spec, &mut errors) {
            measurements.insert(id.clone(), m);
        }
    }
    let steps = steps_of(&calibrations, &measurements);
    (
        AnalysisSpec {
            calibrations,
            measurements,
            steps,
        },
        errors,
    )
}

/// What `check` compares the spec with, from the rest of the template.
pub struct Names<'a> {
    pub roles: &'a Map<String, Value>,
    pub role_columns: &'a BTreeMap<&'a str, BTreeSet<String>>,
    pub role_source_clock: &'a BTreeMap<&'a str, bool>,
    pub params: &'a [ParamSpec],
    pub derived: &'a [DerivedValue],
}

impl Names<'_> {
    /// Whether `role` records `of` or derives it.
    fn readable(&self, role: &str, of: &str) -> bool {
        self.role_columns.get(role).is_some_and(|c| c.contains(of))
            || self.derived.iter().any(|d| d.name == of && d.role == role)
    }

    fn param(&self, name: &str) -> Option<&ParamSpec> {
        self.params.iter().find(|p| p.name == name)
    }
}

/// Every reason the spec does not fit the template's roles, columns and parameters.
pub fn check(spec: &AnalysisSpec, names: &Names) -> Vec<String> {
    let mut errors = Vec::new();
    let mut set_by: BTreeMap<&str, &str> = BTreeMap::new();
    for (id, c) in &spec.calibrations {
        let mut error = |e: String| errors.push(format!("Calibration {id}: {e}"));
        if !names.roles.contains_key(&c.role) {
            error(format!(
                "unknown role {}",
                repr(&Value::from(c.role.as_str()))
            ));
            continue;
        }
        if !names
            .role_source_clock
            .get(c.role.as_str())
            .copied()
            .unwrap_or(true)
        {
            error(format!(
                "readings need role {} to record an elapsed or device clock",
                c.role
            ));
        }
        let readings: Vec<(String, &ReadingSpec)> = match &c.kind {
            CalibrationKind::Set { sets } => {
                sets.iter().map(|(p, r)| (format!("set {p}"), r)).collect()
            }
            CalibrationKind::Line { reading, .. } => vec![("line.reading".into(), reading)],
        };
        for (place, r) in readings {
            if !names.readable(&c.role, &r.of) {
                error(format!(
                    "{place} reads {}, which is not a column or derived value of {}",
                    str_repr(&r.of),
                    c.role
                ));
            }
        }
        let outputs: Vec<(&str, &str)> = match &c.kind {
            CalibrationKind::Set { sets } => sets.keys().map(|p| ("sets", p.as_str())).collect(),
            CalibrationKind::Line {
                slope, intercept, ..
            } => [
                ("sets slope", Some(slope)),
                ("sets intercept", intercept.as_ref()),
            ]
            .into_iter()
            .filter_map(|(w, p)| Some((w, p?.as_str())))
            .collect(),
        };
        for (what, parameter) in outputs {
            match names.param(parameter) {
                None => error(format!(
                    "{what} {}, which is not a parameter",
                    str_repr(parameter)
                )),
                Some(p) if p.entry => error(format!(
                    "{what} {}, which is typed in (entry: true) and cannot also be calibrated",
                    str_repr(parameter)
                )),
                Some(_) => {
                    if let Some(other) = set_by.insert(parameter, id) {
                        error(format!(
                            "{what} {}, which calibration {other} also sets",
                            str_repr(parameter)
                        ));
                    }
                }
            }
        }
    }
    for (id, m) in &spec.measurements {
        let mut error = |e: String| errors.push(format!("Measurement {id}: {e}"));
        if spec.calibrations.contains_key(id) {
            error("the id is already used by a calibration".into());
        }
        if !names.roles.contains_key(&m.role) {
            error(format!(
                "unknown role {}",
                repr(&Value::from(m.role.as_str()))
            ));
            continue;
        }
        if !names
            .role_source_clock
            .get(m.role.as_str())
            .copied()
            .unwrap_or(true)
        {
            error(format!(
                "readings need role {} to record an elapsed or device clock",
                m.role
            ));
        }
        for (step, name, r) in m.readings() {
            if !names.readable(&m.role, &r.of) {
                let place = if step == id {
                    String::new()
                } else {
                    format!("step {step} ")
                };
                error(format!(
                    "{place}reading {name} reads {}, which is not a column or derived value of {}",
                    str_repr(&r.of),
                    m.role
                ));
            }
        }
        let readings: BTreeSet<&str> = m.readings().map(|(_, name, _)| name).collect();
        let keys: Vec<&str> = m.results.keys().map(String::as_str).collect();
        for (i, (key, r)) in m.results.iter().enumerate() {
            let unknown: Vec<&str> = r
                .expr
                .names()
                .iter()
                .map(String::as_str)
                .filter(|n| names.param(n).is_none() && !readings.contains(n))
                .filter(|n| !keys[..i].contains(n))
                .collect();
            let (later, unknown): (Vec<&str>, Vec<&str>) =
                unknown.into_iter().partition(|n| keys.contains(n));
            if !unknown.is_empty() {
                error(format!(
                    "result {key} reads unknown names {}",
                    list_repr(unknown)
                ));
            }
            if !later.is_empty() {
                error(format!(
                    "result {key} reads {}, which come later in results",
                    list_repr(later)
                ));
            }
        }
    }
    errors.extend(namespace_errors(spec, names));
    errors
}

/// Reading names and result keys share one namespace with parameters and derived values,
/// because expressions, charts and tables look a name up without saying where it lives.
/// Clashes between parameters and derived values are reported where those are parsed.
fn namespace_errors(spec: &AnalysisSpec, names: &Names) -> Vec<String> {
    let mut defined: BTreeMap<&str, String> = BTreeMap::new();
    for p in names.params {
        defined
            .entry(&p.name)
            .or_insert_with(|| "parameters".into());
    }
    for d in names.derived {
        defined.entry(&d.name).or_insert_with(|| "derived".into());
    }
    let mut errors = Vec::new();
    for (id, m) in &spec.measurements {
        let readings = m.readings().map(|(step, name, _)| {
            let place = if step == id {
                format!("readings of measurement {id}")
            } else {
                format!("readings of step {step}")
            };
            (name, place)
        });
        let results = m
            .results
            .keys()
            .map(|key| (key.as_str(), format!("results of measurement {id}")));
        for (name, place) in readings.chain(results) {
            match defined.get(name) {
                Some(first) => errors.push(format!(
                    "{} is defined under both {first} and {place}",
                    str_repr(name)
                )),
                None => {
                    defined.insert(name, place);
                }
            }
        }
    }
    errors
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
                "Calibration none: needs set or line",
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

    fn co2_line() -> Value {
        json!({
            "label": "CO2 Calibrations",
            "role": "ms",
            "line": {
                "reading": {"stat": "mean", "of": "m44"},
                "points": {"zero": {"label": "Zero", "known": 0}, "ul1": {"label": "1 µl", "known": 1}},
                "sets": {"slope": "slope_p", "intercept": "intercept_p"},
                "x_label": "Voltage (mV)",
                "y_label": "CO2 (µl)",
            },
        })
    }

    #[test]
    fn a_line_calibration_has_one_step_per_point() {
        let template = with("calibrations", json!({"co2": co2_line()})).unwrap();
        let spec = template.analysis();
        let co2 = &spec.calibrations["co2"];
        assert_eq!(co2.outputs(), ["slope_p", "intercept_p"]);
        let CalibrationKind::Line {
            min_points,
            points,
            x_label,
            ..
        } = &co2.kind
        else {
            panic!("co2 is a line");
        };
        assert_eq!((*min_points, points["ul1"].known), (2, 1.0));
        assert_eq!(x_label, "Voltage (mV)");
        let steps: Vec<(&str, &str, &StepKind)> = spec
            .steps
            .iter()
            .map(|(id, s)| (id.as_str(), s.label.as_str(), &s.kind))
            .collect();
        assert_eq!(
            steps,
            [
                ("co2.zero", "Zero", &StepKind::Point { known: 0.0 }),
                ("co2.ul1", "1 µl", &StepKind::Point { known: 1.0 }),
            ]
        );
        let m44 = ReadingSpec {
            stat: Stat::Mean,
            of: "m44".into(),
        };
        assert_eq!(
            spec.steps["co2.ul1"].readings,
            IndexMap::from([("m44".into(), m44)])
        );
    }

    #[test]
    fn each_problem_in_a_line_gets_its_own_message() {
        let mut bad = co2_line();
        bad["line"]["points"]["ul1"]["known"] = json!("one");
        bad["line"]["points"]["u.2"] = json!({"known": 2});
        bad["line"]["min_points"] = json!(5);
        bad["line"]["reading"] = json!({"stat": "median", "of": "m44"});
        let mut unnamed = co2_line();
        unnamed["line"]["sets"] = json!({"intercept": 3});
        unnamed["line"].as_object_mut().unwrap().remove("points");
        let mut single = co2_line();
        single["line"]["points"] = json!({"zero": {"known": 0}});
        let error = with(
            "calibrations",
            json!({
                "co2": bad,
                "unnamed": unnamed,
                "single": single,
                "both": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}, "line": {}},
            }),
        )
        .unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "Calibration co2: line.reading: stat must be one of ['mean', 'slope']",
                "Calibration co2: point ul1: known must be a number",
                "Calibration co2: point 'u.2': ids may use only letters, digits, '_' and '-'",
                "Calibration co2: line.min_points must be a whole number from 2 to the number of points (3)",
                "Calibration unnamed: line.points must map point ids to {label, known}",
                "Calibration unnamed: line.sets.slope must name a parameter",
                "Calibration unnamed: line.sets.intercept must name a parameter",
                "Calibration single: line.points needs at least two points to fit a line",
                "Calibration both: give set or line, not both",
            ]
        );
    }

    #[test]
    fn a_line_must_read_what_its_role_has_and_set_parameters() {
        let mut line = co2_line();
        line["line"]["sets"] = json!({"slope": "co2_ul_per_mv", "intercept": "temp_c"});
        line["line"]["reading"]["of"] = json!("m99");
        let error = with("calibrations", json!({"co2": line})).unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "Calibration co2: line.reading reads 'm99', which is not a column or derived value of ms",
                "Calibration co2: sets slope 'co2_ul_per_mv', which is not a parameter",
                "Calibration co2: sets intercept 'temp_c', which is typed in (entry: true) and cannot also be calibrated",
            ]
        );
    }

    #[test]
    fn calibrations_must_read_what_the_role_has_and_set_parameters_once() {
        let error = with(
            "calibrations",
            json!({
                "zero": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m99"}}},
                "again": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "t_ms"}}},
                "typed": {"role": "ms", "set": {"temp_c": {"stat": "mean", "of": "d44"}}},
                "nope": {"role": "ms", "set": {"co2_ul_per_mv": {"stat": "mean", "of": "m44"}}},
                "elsewhere": {"role": "light", "set": {"slope_p": {"stat": "mean", "of": "m44"}}},
            }),
        )
        .unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "Calibration zero: set zero_p reads 'm99', which is not a column or derived value of ms",
                "Calibration again: sets 'zero_p', which calibration zero also sets",
                "Calibration typed: sets 'temp_c', which is typed in (entry: true) and cannot also be calibrated",
                "Calibration nope: sets 'co2_ul_per_mv', which is not a parameter",
                "Calibration elsewhere: unknown role 'light'",
            ]
        );
    }

    fn sample() -> Value {
        json!({
            "label": "Sample",
            "role": "ms",
            "steps": {
                "co2": {"label": "CO2 Sample", "readings": {"co2_mv": {"stat": "mean", "of": "m44"}}},
                "o2": {"readings": {"o2_mv": {"stat": "mean", "of": "m32"}}},
            },
            "results": {
                "pct": {"expr": "slope_p * (co2_mv - zero_p)", "unit": "%", "label": "%CO2"},
                "twice": {"expr": "pct * 2 + o2_mv"},
            },
        })
    }

    #[test]
    fn measurements_parse_into_steps_readings_labels_and_results() {
        let template = with(
            "measurements",
            json!({
                "sample": sample(),
                "extract": {
                    "role": "ms",
                    "labels": {"sample_name": "Sample Name"},
                    "readings": {"rate": {"stat": "slope", "of": "d44"}},
                    "results": {"v0": {"expr": "-rate * slope_p", "unit": "nmol/ml/s"}},
                },
            }),
        )
        .unwrap();
        let spec = template.analysis();
        let steps: Vec<(&str, &str, &str, &StepKind)> = spec
            .steps
            .iter()
            .map(|(id, s)| (id.as_str(), s.owner.as_str(), s.label.as_str(), &s.kind))
            .collect();
        assert_eq!(
            steps,
            [
                ("sample.co2", "sample", "CO2 Sample", &StepKind::Measure),
                ("sample.o2", "sample", "o2", &StepKind::Measure),
                ("extract", "extract", "extract", &StepKind::Measure),
            ]
        );
        let sample = &spec.measurements["sample"];
        let readings: Vec<(&str, &str)> = sample.readings().map(|(s, n, _)| (s, n)).collect();
        assert_eq!(readings, [("sample.co2", "co2_mv"), ("sample.o2", "o2_mv")]);
        assert_eq!(sample.results.keys().collect::<Vec<_>>(), ["pct", "twice"]);
        assert_eq!(sample.results["twice"].label, "twice");
        let extract = &spec.measurements["extract"];
        assert_eq!(extract.labels["sample_name"], "Sample Name");
        assert_eq!(extract.results["v0"].expr.text(), "-rate * slope_p");
    }

    #[test]
    fn each_problem_in_a_measurement_gets_its_own_message() {
        let mut steps = sample();
        steps["steps"]["o.2"] = json!({"readings": {}});
        steps["labels"] = json!({"name": 3});
        steps["results"]["bad"] = json!({"expr": "co2_mv +"});
        steps["results"]["none"] = json!({"unit": "%"});
        let error = with(
            "measurements",
            json!({
                "sample": steps,
                "both": {"role": "ms", "readings": {}, "steps": {}, "results": {}},
                "neither": {"role": "ms", "results": {"a": {"expr": "1"}}},
                "flat": {"role": "ms", "steps": [], "results": {"a": {"expr": "1"}}},
                "direct": {"role": "ms", "readings": {"r": {"stat": "sum", "of": "m44"}}},
            }),
        )
        .unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "Measurement sample: step 'o.2': ids may use only letters, digits, '_' and '-'",
                "Measurement sample: step o.2: readings must map reading names to {stat, of}",
                "Measurement sample: labels must map keys to the text the table shows",
                "Measurement sample: result bad: Unsupported syntax in expression 'co2_mv +' at position 8",
                "Measurement sample: result none: expr must be text",
                "Measurement both: give readings or steps, not both",
                "Measurement both: results must map result keys to {expr, unit, label}",
                "Measurement neither: needs readings or steps",
                "Measurement flat: steps must map step ids to {label, readings}",
                "Measurement direct: reading r: stat must be one of ['mean', 'slope']",
                "Measurement direct: results must map result keys to {expr, unit, label}",
            ]
        );
        assert_eq!(
            with("measurements", json!("sample")).unwrap_err(),
            "measurements must be a mapping"
        );
    }

    #[test]
    fn measurements_must_read_what_their_role_has_and_compute_in_order() {
        let mut bad = sample();
        bad["steps"]["o2"]["readings"]["o2_mv"]["of"] = json!("m99");
        bad["results"]["o2"] = json!({"expr": "o2_mvv * later"});
        bad["results"]["later"] = json!({"expr": "1"});
        let error = with(
            "measurements",
            json!({
                "sample": bad,
                "zero": {"role": "ms", "readings": {"z": {"stat": "mean", "of": "m99"}},
                         "results": {"z2": {"expr": "z"}}},
                "far": {"role": "light", "readings": {"f": {"stat": "mean", "of": "m44"}},
                        "results": {"f2": {"expr": "f"}}},
            }),
        );
        let mut data = base();
        data["measurements"] = json!({"zero": {"role": "ms", "readings": {"r": {"stat": "mean", "of": "m44"}},
                                              "results": {"r2": {"expr": "r"}}}});
        data["calibrations"] =
            json!({"zero": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}}});
        let profiles = load_profiles(&Paths::default().instruments).unwrap();
        assert_eq!(
            error.unwrap_err().split("; ").collect::<Vec<_>>(),
            [
                "Measurement sample: step sample.o2 reading o2_mv reads 'm99', which is not a column or derived value of ms",
                "Measurement sample: result o2 reads unknown names ['o2_mvv']",
                "Measurement sample: result o2 reads ['later'], which come later in results",
                "Measurement zero: reading z reads 'm99', which is not a column or derived value of ms",
                "Measurement far: unknown role 'light'",
            ]
        );
        assert_eq!(
            validate(data, &profiles).unwrap_err().0,
            "Measurement zero: the id is already used by a calibration"
        );
    }

    #[test]
    fn reading_names_and_result_keys_share_one_namespace_with_parameters_and_derived() {
        let mut clash = sample();
        clash["steps"]["o2"]["readings"] = json!({"co2_mv": {"stat": "mean", "of": "m32"}});
        clash["results"]["twice"] = json!({"expr": "pct * 2"});
        clash["results"]["d44"] = json!({"expr": "co2_mv"});
        let error = with(
            "measurements",
            json!({
                "sample": clash,
                "extract": {"role": "ms", "readings": {"zero_p": {"stat": "mean", "of": "m44"}},
                            "results": {"pct": {"expr": "zero_p"}}},
            }),
        )
        .unwrap_err();
        assert_eq!(
            error.split("; ").collect::<Vec<_>>(),
            [
                "'co2_mv' is defined under both readings of step sample.co2 and readings of step sample.o2",
                "'d44' is defined under both derived and results of measurement sample",
                "'zero_p' is defined under both parameters and readings of measurement extract",
                "'pct' is defined under both results of measurement sample and results of measurement extract",
            ]
        );
    }

    #[test]
    fn readings_need_a_clock_the_replay_speed_cannot_stretch() {
        let mut data = base();
        data["roles"] = json!({"ms": {"instrument": "ms2-ezview-simulated"}});
        data["calibrations"] =
            json!({"zero": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}}});
        let profiles = load_profiles(&Paths::default().instruments).unwrap();
        assert_eq!(
            validate(data, &profiles).unwrap_err().0,
            "Calibration zero: readings need role ms to record an elapsed or device clock"
        );
    }
}
