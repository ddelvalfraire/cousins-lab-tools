//! Template parameters: what the template declares, where each value came from, and the
//! layering that produces the values every evaluator reads.
//!
//! A parameter with no value anywhere is absent from the result, never 0. An expression that
//! reads it then finds neither a parameter nor a column and gives None.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_json::Value;

use crate::calc::{Cycle, dependency_order};
use crate::expr::{self, Expression, Params};

#[derive(Clone, Debug, PartialEq)]
pub struct ParamSpec {
    pub name: String,
    /// The template default. Absent means unset until entered or fitted.
    pub value: Option<f64>,
    /// Computed from other parameters. A layer that sets the name wins over it.
    pub expr: Option<Expression>,
    /// The operator may type it on the run page.
    pub entry: bool,
    pub unit: String,
    pub label: String,
    pub note: String,
}

impl ParamSpec {
    /// `{value?, expr?, entry?, unit, label, note}`, or the first thing wrong with it.
    pub fn parse(name: &str, spec: &Value) -> Result<ParamSpec, String> {
        let value = match spec.get("value") {
            None => None,
            Some(v) => Some(v.as_f64().ok_or("value must be a number")?),
        };
        let expr = match spec.get("expr") {
            None => None,
            Some(e) => {
                let text = e.as_str().ok_or("expr must be text")?;
                Some(expr::parse(text).map_err(|e| e.to_string())?)
            }
        };
        if value.is_some() && expr.is_some() {
            return Err("give value or expr, not both".into());
        }
        let entry = match spec.get("entry") {
            None => false,
            Some(e) => e.as_bool().ok_or("entry must be true or false")?,
        };
        let text = |key: &str| spec[key].as_str().unwrap_or_default().to_string();
        Ok(ParamSpec {
            name: name.to_string(),
            value,
            expr,
            entry,
            unit: text("unit"),
            label: text("label"),
            note: text("note"),
        })
    }

    /// The parameters a computed parameter reads; empty for the others.
    fn inputs(&self) -> Vec<&str> {
        self.expr
            .as_ref()
            .map(|e| e.names().iter().map(String::as_str).collect())
            .unwrap_or_default()
    }
}

/// Where a parameter's value came from.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "source", rename_all = "snake_case")]
pub enum ParamSource {
    Default,
    Computed,
    Entered { record: String },
    Fitted { calibration: String },
    Trial,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResolvedParams {
    /// What evaluators read.
    pub values: Params,
    pub sources: BTreeMap<String, ParamSource>,
    /// Name to why it has no value, such as "needs temp_c".
    pub unset: BTreeMap<String, String>,
}

/// The evaluation order of the computed parameters, or the cycle that prevents one.
pub fn computed_order(specs: &[ParamSpec]) -> Result<Vec<&ParamSpec>, Cycle> {
    let items: Vec<(&str, Vec<&str>)> = specs
        .iter()
        .map(|s| (s.name.as_str(), s.inputs()))
        .collect();
    Ok(dependency_order(&items)?
        .into_iter()
        .map(|i| &specs[i])
        .filter(|s| s.expr.is_some())
        .collect())
}

/// Layers in order, later wins: the template defaults in `specs`, then each of `layers`.
/// Computed parameters are evaluated afterwards in dependency order unless a layer set them.
/// A name with no value anywhere stays out of `values`.
pub fn resolve_params(specs: &[ParamSpec], layers: &[(&Params, ParamSource)]) -> ResolvedParams {
    let mut resolved = ResolvedParams::default();
    for spec in specs {
        if let Some(value) = spec.value {
            resolved.values.insert(spec.name.clone(), value);
            resolved
                .sources
                .insert(spec.name.clone(), ParamSource::Default);
        }
    }
    for (layer, source) in layers {
        for (name, value) in layer.iter() {
            resolved.values.insert(name.clone(), *value);
            resolved.sources.insert(name.clone(), source.clone());
        }
    }
    // Validation rejected cycles; a snapshot with one computes nothing rather than panicking.
    for spec in computed_order(specs).unwrap_or_default() {
        if resolved.values.contains_key(&spec.name) {
            continue;
        }
        let expr = spec
            .expr
            .as_ref()
            .expect("computed_order keeps only computed specs");
        match expr.eval(&resolved.values, |_| None) {
            Some(value) => {
                resolved.values.insert(spec.name.clone(), value);
                resolved
                    .sources
                    .insert(spec.name.clone(), ParamSource::Computed);
            }
            None => {
                let missing: BTreeSet<&str> = spec
                    .inputs()
                    .into_iter()
                    .filter(|n| !resolved.values.contains_key(*n))
                    .collect();
                let why = if missing.is_empty() {
                    format!("{} has no value", expr.text())
                } else {
                    format!(
                        "needs {}",
                        missing.into_iter().collect::<Vec<_>>().join(", ")
                    )
                };
                resolved.unset.insert(spec.name.clone(), why);
            }
        }
    }
    for spec in specs {
        if !resolved.values.contains_key(&spec.name) && !resolved.unset.contains_key(&spec.name) {
            let why = if spec.entry {
                "Enter a value"
            } else {
                "Not set"
            };
            resolved.unset.insert(spec.name.clone(), why.into());
        }
    }
    resolved
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn specs() -> Vec<ParamSpec> {
        let doc = json!({
            "total": {"expr": "temp_c + doubled", "unit": "x"},
            "doubled": {"expr": "base * 2"},
            "base": {"value": 1.5, "label": "Base"},
            "temp_c": {"entry": true, "unit": "°C"},
            "offset": {"value": 5, "entry": true},
            "fit": {"unit": "mV"},
        });
        doc.as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| ParamSpec::parse(k, v).unwrap())
            .collect()
    }

    fn params(pairs: &[(&str, f64)]) -> Params {
        pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect()
    }

    #[test]
    fn defaults_and_computed_values_are_set_and_unset_names_stay_absent() {
        let resolved = resolve_params(&specs(), &[]);
        assert_eq!(
            resolved.values,
            params(&[("base", 1.5), ("doubled", 3.0), ("offset", 5.0)])
        );
        assert_eq!(resolved.sources["base"], ParamSource::Default);
        assert_eq!(resolved.sources["doubled"], ParamSource::Computed);
        assert_eq!(
            resolved.unset,
            BTreeMap::from([
                ("temp_c".to_string(), "Enter a value".to_string()),
                ("total".to_string(), "needs temp_c".to_string()),
                ("fit".to_string(), "Not set".to_string()),
            ])
        );
        let reads_unset = expr::parse("temp_c * 2").unwrap();
        assert_eq!(reads_unset.eval(&resolved.values, |_| None), None);
    }

    #[test]
    fn later_layers_win_and_a_layer_overrides_a_computed_value() {
        let entered = params(&[("temp_c", 25.0), ("fit", 0.3)]);
        let trial = params(&[("base", 10.0), ("doubled", 100.0), ("extra", 1.0)]);
        let record = ParamSource::Entered {
            record: "rec-000001".into(),
        };
        let resolved = resolve_params(
            &specs(),
            &[(&entered, record.clone()), (&trial, ParamSource::Trial)],
        );
        assert_eq!(
            resolved.values,
            params(&[
                ("base", 10.0),
                ("doubled", 100.0),
                ("extra", 1.0),
                ("fit", 0.3),
                ("offset", 5.0),
                ("temp_c", 25.0),
                ("total", 125.0),
            ])
        );
        assert_eq!(resolved.sources["temp_c"], record);
        assert_eq!(resolved.sources["doubled"], ParamSource::Trial);
        assert_eq!(resolved.sources["total"], ParamSource::Computed);
        assert!(resolved.unset.is_empty());
    }

    #[test]
    fn computed_parameters_follow_their_dependencies_not_their_order() {
        let all = specs();
        let order: Vec<&str> = computed_order(&all)
            .unwrap()
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        assert_eq!(order, ["doubled", "total"]);
        let mut cyclic = specs();
        cyclic[2].expr = Some(expr::parse("total").unwrap());
        cyclic[2].value = None;
        assert_eq!(
            computed_order(&cyclic).unwrap_err().to_string(),
            "total: depends on itself through doubled, base"
        );
    }

    #[test]
    fn a_spec_names_its_first_problem() {
        let bad = [
            (json!({"value": "x"}), "value must be a number"),
            (json!({"expr": 3}), "expr must be text"),
            (
                json!({"expr": "a +"}),
                "Unsupported syntax in expression 'a +' at position 3",
            ),
            (
                json!({"value": 1, "expr": "a"}),
                "give value or expr, not both",
            ),
            (json!({"entry": "yes"}), "entry must be true or false"),
        ];
        for (spec, message) in bad {
            assert_eq!(ParamSpec::parse("p", &spec).unwrap_err(), message, "{spec}");
        }
        let spec = ParamSpec::parse("p", &json!({"entry": true, "unit": "s"})).unwrap();
        assert!(spec.entry && spec.value.is_none() && spec.expr.is_none());
        assert_eq!((spec.unit.as_str(), spec.label.as_str()), ("s", ""));
    }
}
