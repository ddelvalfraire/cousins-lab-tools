//! The state a session's analysis log folds to. Nothing here is stored: parameters, fits and
//! tables are always derived from the records, so the log is the only source of truth.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use indexmap::IndexMap;

use crate::expr::Params;
use crate::params::{ParamSource, ResolvedParams};
use crate::templates::Template;

use super::reading::{Range, ReadingValue};
use super::spec::{AnalysisSpec, StepKind};
use super::store::{Action, Record, RecordId};

/// The reading that currently fills a step.
#[derive(Clone, Debug, PartialEq)]
pub struct StepState {
    pub record: RecordId,
    pub created_utc: DateTime<Utc>,
    pub capture: String,
    pub range_s: Range,
    pub values: IndexMap<String, ReadingValue>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AnalysisState {
    /// Entered and calibrated values only; template defaults are not repeated here.
    pub params: Params,
    pub sources: BTreeMap<String, ParamSource>,
    /// The latest reading of each step that has one, in template order.
    pub steps: IndexMap<String, StepState>,
    /// The number of the last record folded, 0 for an empty log. It changes with every new
    /// record, which is what live views watch.
    pub rev: u64,
}

impl AnalysisState {
    /// Template defaults, then this state's values, then the computed parameters.
    pub fn resolve(&self, template: &Template) -> ResolvedParams {
        let mut resolved = template.resolve_params(&[(&self.params, ParamSource::Default)]);
        for (name, source) in &self.sources {
            resolved.sources.insert(name.clone(), source.clone());
        }
        resolved
    }
}

/// The records that count: each request once, and nothing a retraction hides.
pub(super) fn effective(log: &[Record]) -> Vec<&Record> {
    let mut requests = BTreeSet::new();
    let once: Vec<&Record> = log
        .iter()
        .filter(|r| r.request_id.as_ref().is_none_or(|id| requests.insert(id)))
        .collect();
    let hidden: BTreeSet<&RecordId> = once
        .iter()
        .flat_map(|r| match &r.action {
            Action::Retract { records } => records.iter().collect(),
            _ => Vec::new(),
        })
        .collect();
    once.into_iter()
        .filter(|r| !hidden.contains(&r.id))
        .collect()
}

pub fn fold(spec: &AnalysisSpec, log: &[Record]) -> AnalysisState {
    let mut state = AnalysisState {
        rev: log.last().map_or(0, |r| r.id.seq()),
        ..AnalysisState::default()
    };
    let mut latest: BTreeMap<&str, StepState> = BTreeMap::new();
    for record in effective(log) {
        match &record.action {
            Action::Reading {
                step,
                capture,
                range_s,
                values,
                ..
            } => {
                let reading = StepState {
                    record: record.id.clone(),
                    created_utc: record.created_utc,
                    capture: capture.clone(),
                    range_s: *range_s,
                    values: values.clone(),
                };
                latest.insert(step, reading);
            }
            Action::Entry {
                parameter,
                value: Some(value),
            } => {
                state.params.insert(parameter.clone(), *value);
                let record = record.id.to_string();
                state
                    .sources
                    .insert(parameter.clone(), ParamSource::Entered { record });
            }
            Action::Entry {
                parameter,
                value: None,
            } => {
                state.params.remove(parameter);
                state.sources.remove(parameter);
            }
            Action::Retract { .. } => {}
        }
    }
    for (id, step) in &spec.steps {
        if let Some(reading) = latest.remove(id.as_str()) {
            state.steps.insert(id.clone(), reading);
        }
        if step.kind != StepKind::Set {
            continue;
        }
        let Some(reading) = state.steps.get(id) else {
            continue;
        };
        for (parameter, value) in &reading.values {
            if let Some(v) = value.value {
                state.params.insert(parameter.clone(), v);
                let calibration = step.owner.clone();
                state
                    .sources
                    .insert(parameter.clone(), ParamSource::Fitted { calibration });
            }
        }
    }
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alignment::TemplateRef;
    use crate::session::utc_now;

    fn record(seq: u64, request_id: Option<&str>, action: Action) -> Record {
        Record {
            id: RecordId::new(seq),
            created_utc: utc_now(),
            template: TemplateRef {
                id: "t".into(),
                revision: 1,
            },
            request_id: request_id.map(String::from),
            action,
        }
    }

    fn zero_spec() -> AnalysisSpec {
        let (spec, errors) = crate::analysis::spec::parse(&serde_json::json!({"calibrations": {
            "zero": {"role": "ms", "set": {"zero_p": {"stat": "mean", "of": "m44"}}},
        }}));
        assert!(errors.is_empty(), "{errors:?}");
        spec
    }

    fn read(seq: u64, step: &str, value: Option<f64>) -> Record {
        let value = ReadingValue {
            stat: crate::analysis::Stat::Mean,
            of: "m44".into(),
            value,
            n: 3,
            t_first_s: 1.0,
            t_last_s: 2.0,
        };
        let action = Action::Reading {
            step: step.into(),
            capture: "ms".into(),
            range_s: Range::new(1.0, 2.0).unwrap(),
            clock: "t_ms".into(),
            values: IndexMap::from([("zero_p".to_string(), value)]),
            params: Params::new(),
        };
        record(seq, None, action)
    }

    fn entry(seq: u64, value: Option<f64>) -> Record {
        let parameter = "temp_c".into();
        record(seq, None, Action::Entry { parameter, value })
    }

    fn retract(seq: u64, records: &[u64]) -> Record {
        let records = records.iter().map(|s| RecordId::new(*s)).collect();
        record(seq, None, Action::Retract { records })
    }

    fn entered(seq: u64) -> ParamSource {
        ParamSource::Entered {
            record: RecordId::new(seq).to_string(),
        }
    }

    #[test]
    fn the_latest_entry_wins_and_an_empty_entry_clears_it() {
        let log = [entry(1, Some(20.0)), entry(2, Some(25.0))];
        let state = fold(&AnalysisSpec::default(), &log);
        assert_eq!(state.params, Params::from([("temp_c".into(), 25.0)]));
        assert_eq!(state.sources["temp_c"], entered(2));
        assert_eq!(state.rev, 2);

        let cleared = fold(
            &AnalysisSpec::default(),
            &[entry(1, Some(20.0)), entry(2, None)],
        );
        assert!(cleared.params.is_empty() && cleared.sources.is_empty());
        assert_eq!(
            fold(&AnalysisSpec::default(), &[]),
            AnalysisState::default()
        );
    }

    #[test]
    fn a_retracted_entry_gives_way_to_the_one_before_it() {
        let log = [entry(1, Some(20.0)), entry(2, Some(25.0)), retract(3, &[2])];
        let state = fold(&AnalysisSpec::default(), &log);
        assert_eq!(state.params["temp_c"], 20.0);
        assert_eq!(state.sources["temp_c"], entered(1));
        assert_eq!(state.rev, 3);
        assert!(
            fold(
                &AnalysisSpec::default(),
                &[entry(1, Some(20.0)), retract(2, &[1])]
            )
            .params
            .is_empty()
        );
    }

    #[test]
    fn a_repeated_request_folds_once() {
        let action = |value| Action::Entry {
            parameter: "temp_c".into(),
            value: Some(value),
        };
        let log = [
            record(1, Some("a"), action(20.0)),
            record(2, Some("b"), action(25.0)),
            record(3, Some("a"), action(30.0)),
        ];
        let state = fold(&AnalysisSpec::default(), &log);
        assert_eq!(state.params["temp_c"], 25.0);
        assert_eq!(state.sources["temp_c"], entered(2));
        let retried = [
            entry(1, Some(20.0)),
            record(
                2,
                Some("r"),
                Action::Retract {
                    records: vec![RecordId::new(1)],
                },
            ),
            record(3, Some("r"), Action::Retract { records: vec![] }),
        ];
        assert!(fold(&AnalysisSpec::default(), &retried).params.is_empty());
    }

    #[test]
    fn a_step_holds_its_latest_reading_and_a_set_calibration_takes_its_values() {
        let spec = zero_spec();
        let log = [
            read(1, "zero", Some(5.0)),
            read(2, "zero", Some(7.0)),
            read(3, "elsewhere", Some(9.0)),
        ];
        let state = fold(&spec, &log);
        assert_eq!(state.params, Params::from([("zero_p".into(), 7.0)]));
        let calibration = "zero".to_string();
        assert_eq!(state.sources["zero_p"], ParamSource::Fitted { calibration });
        assert_eq!(state.steps.keys().collect::<Vec<_>>(), ["zero"]);
        assert_eq!(state.steps["zero"].record, RecordId::new(2));

        let mut redone = log.to_vec();
        redone.push(retract(4, &[2]));
        let state = fold(&spec, &redone);
        assert_eq!(state.params["zero_p"], 5.0);
        assert_eq!(state.steps["zero"].record, RecordId::new(1));

        let empty = fold(&spec, &[read(1, "zero", Some(5.0)), read(2, "zero", None)]);
        assert!(
            empty.params.is_empty(),
            "a reading without a value sets nothing"
        );
        assert_eq!(empty.steps["zero"].record, RecordId::new(2));
    }
}
