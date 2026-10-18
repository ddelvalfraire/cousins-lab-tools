//! The state a session's analysis log folds to. Nothing here is stored: parameters, fits and
//! tables are always derived from the records, so the log is the only source of truth.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::Serialize;

use crate::calc::line_fit;
use crate::expr::Params;
use crate::params::{ParamSource, ResolvedParams};
use crate::templates::Template;

use super::reading::{Range, ReadingValue};
use super::spec::{AnalysisSpec, CalibrationKind, Measurement, StepKind};
use super::store::{Action, Record, RecordId};

/// A line calibration's fit over the points that hold a reading.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct FitState {
    pub slope: Option<f64>,
    pub intercept: Option<f64>,
    pub r2: Option<f64>,
    /// Points with a value.
    pub n: usize,
    /// Points without one, in template order.
    pub missing: Vec<String>,
}

/// The reading that currently fills a step.
#[derive(Clone, Debug, PartialEq)]
pub struct StepState {
    pub record: RecordId,
    pub created_utc: DateTime<Utc>,
    pub capture: String,
    pub range_s: Range,
    pub values: IndexMap<String, ReadingValue>,
}

/// One row of a results table, as it was added.
#[derive(Clone, Debug, PartialEq)]
pub struct TableRow {
    pub record: RecordId,
    pub created_utc: DateTime<Utc>,
    pub labels: IndexMap<String, String>,
    pub results: IndexMap<String, Option<f64>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AnalysisState {
    /// Entered and calibrated values only; template defaults are not repeated here.
    pub params: Params,
    pub sources: BTreeMap<String, ParamSource>,
    /// The latest reading of each step that has one, in template order. A measurement
    /// step's reading leaves once a table row takes it.
    pub steps: IndexMap<String, StepState>,
    /// Per measurement, in template order, the rows not retracted, in the order added.
    pub tables: IndexMap<String, Vec<TableRow>>,
    /// Per line calibration, in template order.
    pub fits: IndexMap<String, FitState>,
    /// The number of the last record folded, 0 for an empty log. It changes with every new
    /// record, which is what live views watch.
    pub rev: u64,
}

impl AnalysisState {
    /// Template defaults, then this state's values, then the computed parameters.
    pub fn resolve(&self, template: &Template) -> ResolvedParams {
        self.resolve_with(template, &Params::new())
    }

    /// As [`AnalysisState::resolve`], with a trial's overrides layered on top.
    pub fn resolve_with(&self, template: &Template, trial: &Params) -> ResolvedParams {
        let mut resolved = template.resolve_params(&[
            (&self.params, ParamSource::Default),
            (trial, ParamSource::Trial),
        ]);
        for (name, source) in &self.sources {
            if !trial.contains_key(name) {
                resolved.sources.insert(name.clone(), source.clone());
            }
        }
        resolved
    }
}

/// What a measurement's next table row would hold.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Draft {
    /// Reading name to value, from the steps that hold a reading.
    pub readings: IndexMap<String, ReadingValue>,
    /// The reading records the row would take.
    pub records: Vec<RecordId>,
    pub results: IndexMap<String, Option<f64>>,
    /// Names a result reads that have no value: parameters, or readings not taken yet.
    pub unset: Vec<String>,
}

/// The draft of `measurement` from the readings in `state`, computed with `params`, the
/// session's resolved parameters. Results read parameters, readings and earlier results.
pub fn draft(measurement: &Measurement, state: &AnalysisState, params: &Params) -> Draft {
    let mut draft = Draft::default();
    let mut known = params.clone();
    for step in measurement.steps.keys() {
        let Some(reading) = state.steps.get(step) else {
            continue;
        };
        draft.records.push(reading.record.clone());
        for (name, value) in &reading.values {
            if let Some(v) = value.value {
                known.insert(name.clone(), v);
            }
            draft.readings.insert(name.clone(), value.clone());
        }
    }
    for (key, result) in &measurement.results {
        let value = result.expr.eval(&known, |_| None);
        match value {
            Some(v) => {
                known.insert(key.clone(), v);
            }
            None => {
                let missing =
                    result.expr.names().iter().filter(|n| {
                        !known.contains_key(*n) && !measurement.results.contains_key(*n)
                    });
                for name in missing {
                    if !draft.unset.contains(name) {
                        draft.unset.push(name.clone());
                    }
                }
            }
        }
        draft.results.insert(key.clone(), value);
    }
    draft
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
    let taken: BTreeSet<&RecordId> = log
        .iter()
        .flat_map(|r| match &r.action {
            Action::AddRow { readings, .. } => readings.iter().collect(),
            _ => Vec::new(),
        })
        .collect();
    let mut latest: BTreeMap<&str, StepState> = BTreeMap::new();
    let mut rows: BTreeMap<&str, Vec<TableRow>> = BTreeMap::new();
    for record in effective(log) {
        match &record.action {
            Action::Reading { .. } if taken.contains(&record.id) => {}
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
            Action::AddRow {
                measurement,
                labels,
                results,
                ..
            } => rows.entry(measurement).or_default().push(TableRow {
                record: record.id.clone(),
                created_utc: record.created_utc,
                labels: labels.clone(),
                results: results.clone(),
            }),
            Action::Retract { .. } => {}
        }
    }
    for id in spec.measurements.keys() {
        let table = rows.remove(id.as_str()).unwrap_or_default();
        state.tables.insert(id.clone(), table);
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
    for (id, calibration) in &spec.calibrations {
        let CalibrationKind::Line {
            reading,
            points,
            slope,
            intercept,
            min_points,
            ..
        } = &calibration.kind
        else {
            continue;
        };
        let mut fit = FitState::default();
        let mut pairs = Vec::new();
        for (point, p) in points {
            let value = state
                .steps
                .get(&format!("{id}.{point}"))
                .and_then(|s| s.values.get(&reading.of)?.value);
            match value {
                Some(x) => pairs.push((x, p.known)),
                None => fit.missing.push(point.clone()),
            }
        }
        fit.n = pairs.len();
        if let Some(line) = line_fit(&pairs).filter(|_| pairs.len() >= *min_points) {
            fit.slope = Some(line.slope);
            fit.intercept = Some(line.intercept);
            fit.r2 = line.r2;
            let mut outputs = vec![(slope, line.slope)];
            if let Some(name) = intercept {
                outputs.push((name, line.intercept));
            }
            for (name, value) in outputs {
                state.params.insert(name.clone(), value);
                let calibration = id.clone();
                state
                    .sources
                    .insert(name.clone(), ParamSource::Fitted { calibration });
            }
        }
        state.fits.insert(id.clone(), fit);
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
        read_as(seq, step, "zero_p", value)
    }

    fn read_as(seq: u64, step: &str, name: &str, value: Option<f64>) -> Record {
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
            values: IndexMap::from([(name.to_string(), value)]),
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

    fn co2_spec() -> AnalysisSpec {
        let (spec, errors) = crate::analysis::spec::parse(&serde_json::json!({"calibrations": {
            "co2": {"role": "ms", "line": {
                "reading": {"stat": "mean", "of": "m44"},
                "points": {"zero": {"known": 0}, "ul1": {"known": 1}, "ul2": {"known": 2}, "ul3": {"known": 3}},
                "sets": {"slope": "co2_ul_per_mv", "intercept": "co2_cal_intercept_ul"},
                "min_points": 3,
            }},
        }}));
        assert!(errors.is_empty(), "{errors:?}");
        spec
    }

    #[test]
    fn a_line_fits_every_filled_point_and_a_redone_point_replaces_only_its_own() {
        let spec = co2_spec();
        let point = |seq, step: &str, mv| read_as(seq, &format!("co2.{step}"), "m44", Some(mv));
        let log = [
            point(1, "zero", -18.8049),
            point(2, "ul1", 38.9212),
            point(3, "ul2", 50.0),
            point(4, "ul3", 151.6954),
            point(5, "ul2", 95.7886),
        ];
        let state = fold(&spec, &log);
        let fit = &state.fits["co2"];
        assert_eq!((fit.n, fit.missing.len()), (4, 0));
        assert!((fit.slope.unwrap() - 0.017593323574209997).abs() < 1e-15);
        assert!((fit.intercept.unwrap() - 0.32300533338608317).abs() < 1e-12);
        assert_eq!(state.params["co2_ul_per_mv"], fit.slope.unwrap());
        assert_eq!(state.params["co2_cal_intercept_ul"], fit.intercept.unwrap());
        let calibration = "co2".to_string();
        assert_eq!(
            state.sources["co2_cal_intercept_ul"],
            ParamSource::Fitted { calibration }
        );

        let short = fold(&spec, &log[..2]);
        assert_eq!(
            short.fits["co2"],
            FitState {
                n: 2,
                missing: vec!["ul2".into(), "ul3".into()],
                ..FitState::default()
            }
        );
        assert!(short.params.is_empty(), "two points are below min_points");
        assert_eq!(fold(&spec, &log[..3]).fits["co2"].n, 3);
    }

    fn sample_spec() -> AnalysisSpec {
        let (spec, errors) = crate::analysis::spec::parse(&serde_json::json!({"measurements": {
            "sample": {"role": "ms", "steps": {
                "co2": {"readings": {"co2_mv": {"stat": "mean", "of": "m44"}}},
                "o2": {"readings": {"o2_mv": {"stat": "mean", "of": "m32"}}},
            }, "results": {
                "pct": {"expr": "gain * (co2_mv - zero)"},
                "twice": {"expr": "pct * 2"},
                "o2": {"expr": "o2_cal * o2_mv"},
            }},
        }}));
        assert!(errors.is_empty(), "{errors:?}");
        spec
    }

    fn add_row(seq: u64, readings: &[u64], pct: f64) -> Record {
        let action = Action::AddRow {
            measurement: "sample".into(),
            labels: IndexMap::new(),
            readings: readings.iter().map(|s| RecordId::new(*s)).collect(),
            results: IndexMap::from([("pct".to_string(), Some(pct))]),
            params: Params::new(),
        };
        record(seq, None, action)
    }

    #[test]
    fn a_draft_computes_results_from_its_readings_and_names_what_it_lacks() {
        let spec = sample_spec();
        let m = &spec.measurements["sample"];
        let params = Params::from([("gain".into(), 2.0), ("zero".into(), 4.0)]);
        let log = [read_as(1, "sample.co2", "co2_mv", Some(10.0))];
        let partial = draft(m, &fold(&spec, &log), &params);
        assert_eq!(partial.records, [RecordId::new(1)]);
        assert_eq!(partial.readings["co2_mv"].value, Some(10.0));
        let results: Vec<(&str, Option<f64>)> = partial
            .results
            .iter()
            .map(|(k, v)| (k.as_str(), *v))
            .collect();
        assert_eq!(
            results,
            [("pct", Some(12.0)), ("twice", Some(24.0)), ("o2", None)]
        );
        assert_eq!(partial.unset, ["o2_cal", "o2_mv"]);

        let mut more = log.to_vec();
        more.push(read_as(2, "sample.o2", "o2_mv", Some(3.0)));
        let mut with_cal = params.clone();
        with_cal.insert("o2_cal".into(), 0.5);
        let full = draft(m, &fold(&spec, &more), &with_cal);
        assert_eq!(full.results["o2"], Some(1.5));
        assert!(full.unset.is_empty());
        assert_eq!(draft(m, &fold(&spec, &[]), &params).results["pct"], None);
    }

    #[test]
    fn a_row_takes_its_readings_for_good_and_a_retracted_row_leaves_the_table() {
        let spec = sample_spec();
        let log = vec![
            read_as(1, "sample.co2", "co2_mv", Some(10.0)),
            read_as(2, "sample.o2", "o2_mv", Some(3.0)),
            add_row(3, &[1, 2], 12.0),
            read_as(4, "sample.co2", "co2_mv", Some(20.0)),
        ];
        let state = fold(&spec, &log);
        assert_eq!(state.steps.keys().collect::<Vec<_>>(), ["sample.co2"]);
        assert_eq!(state.steps["sample.co2"].record, RecordId::new(4));
        let table = &state.tables["sample"];
        assert_eq!(table.len(), 1);
        assert_eq!(
            (table[0].record.seq(), table[0].results["pct"]),
            (3, Some(12.0))
        );

        let mut removed = log.clone();
        removed.push(retract(5, &[3]));
        let state = fold(&spec, &removed);
        assert!(state.tables["sample"].is_empty());
        assert_eq!(
            state.steps.keys().collect::<Vec<_>>(),
            ["sample.co2"],
            "the readings the row took do not come back"
        );
        assert_eq!(state.steps["sample.co2"].record, RecordId::new(4));
    }
}
