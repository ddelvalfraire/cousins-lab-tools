//! Readings over stored rows. A chart's points are decimated, so a mean or a slope read off
//! them would be biased; the engine reads every stored row of the range instead.

use std::fmt;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::calc::{Program, Sample, mean, slope};
use crate::expr::Params;
use crate::pycompat::float_repr;
use crate::query::{AnalysisError, SessionDb, ident};

use super::spec::{ReadingSpec, Stat};

/// Seconds on a capture's own clock, from before to. Built only by [`Range::new`], so code
/// past the API boundary never sees NaN, an infinite end or an empty range.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "[f64; 2]", into = "[f64; 2]")]
pub struct Range {
    from: f64,
    to: f64,
}

impl Range {
    pub fn new(from: f64, to: f64) -> Result<Range, RangeError> {
        if from.is_finite() && to.is_finite() && from < to {
            Ok(Range { from, to })
        } else {
            Err(RangeError)
        }
    }

    pub fn from(&self) -> f64 {
        self.from
    }

    pub fn to(&self) -> f64 {
        self.to
    }

    pub fn contains(&self, t: f64) -> bool {
        self.from <= t && t <= self.to
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RangeError;

impl fmt::Display for RangeError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("A range is two finite times in seconds, the first before the second")
    }
}

impl TryFrom<[f64; 2]> for Range {
    type Error = RangeError;

    fn try_from([from, to]: [f64; 2]) -> Result<Range, RangeError> {
        Range::new(from, to)
    }
}

impl From<Range> for [f64; 2] {
    fn from(range: Range) -> [f64; 2] {
        [range.from, range.to]
    }
}

/// One statistic over a range, as computed when the reading was taken.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReadingValue {
    pub stat: Stat,
    pub of: String,
    /// None when no row of the range has a value of `of`.
    pub value: Option<f64>,
    /// The values the statistic used.
    pub n: usize,
    /// Source-clock seconds of the first and last stored row in the range.
    pub t_first_s: f64,
    pub t_last_s: f64,
}

/// Where a reading's value comes from in one row: a program output or an extra column.
enum Input {
    Output(usize),
    Column(usize),
}

/// Values of `readings` over the stored rows of `capture` whose source-clock time lies in
/// `range`. The role's program runs from the first stored row, so a rate inside the range has
/// its full trailing window. Refuses a range with no stored rows, and, while the capture is
/// still recording (`complete` false), a range that ends after the last stored row.
pub fn read_range(
    db: &SessionDb,
    program: &Program,
    params: &Params,
    capture: &str,
    range: Range,
    readings: &IndexMap<String, ReadingSpec>,
    complete: bool,
) -> Result<IndexMap<String, ReadingValue>, AnalysisError> {
    let view = format!("cap:{capture}");
    if !db.has_view(&view) {
        return Err(AnalysisError::Invalid(format!(
            "Capture {capture} has no stored rows yet"
        )));
    }
    let clock = program.clock().ok_or_else(|| {
        AnalysisError::Invalid(format!(
            "Capture {capture} records no elapsed or device clock to read a range on"
        ))
    })?;
    let mut extra: Vec<&str> = Vec::new();
    let inputs: Vec<Input> = readings
        .values()
        .map(|r| match program.values().position(|v| v == r.of) {
            Some(i) => Input::Output(i),
            None => {
                let i = extra.iter().position(|c| *c == r.of).unwrap_or_else(|| {
                    extra.push(&r.of);
                    extra.len() - 1
                });
                Input::Column(i)
            }
        })
        .collect();
    let double = |c: &str| format!(", TRY_CAST({} AS DOUBLE)", ident(c));
    let columns: String = program.columns().iter().map(|c| double(c)).collect();
    let extras: String = extra.iter().map(|c| double(c)).collect();
    let mut stmt = db.connection().prepare(&format!(
        "SELECT TRY_CAST({} AS DOUBLE) * {}{columns}{extras} FROM {} ORDER BY seq",
        ident(&clock.column),
        float_repr(clock.seconds_per_unit),
        ident(&view)
    ))?;
    let mut rows = stmt.query([])?;
    let mut eval = program.evaluator(params);
    let width = program.columns().len();
    let mut cells = vec![None; width];
    let mut points: Vec<Vec<(f64, f64)>> = vec![Vec::new(); readings.len()];
    let mut span: Option<(f64, f64)> = None;
    let mut last_stored = f64::NEG_INFINITY;
    while let Some(row) = rows.next()? {
        let t: Option<f64> = row.get(0)?;
        for (i, cell) in cells.iter_mut().enumerate() {
            *cell = row.get(i + 1)?;
        }
        let outputs = eval.push(Sample {
            t_s: t,
            columns: &cells,
        });
        let Some(t) = t else { continue };
        last_stored = last_stored.max(t);
        if !range.contains(t) {
            continue;
        }
        span = Some(span.map_or((t, t), |(a, b)| (a.min(t), b.max(t))));
        for (input, points) in inputs.iter().zip(&mut points) {
            let value = match input {
                Input::Output(i) => outputs[*i],
                Input::Column(i) => row.get(1 + width + i)?,
            };
            if let Some(v) = value.filter(|v| v.is_finite()) {
                points.push((t, v));
            }
        }
    }
    if !complete && range.to() > last_stored {
        return Err(AnalysisError::Invalid(format!(
            "Rows after {last_stored} s are not stored yet; try again in a moment"
        )));
    }
    let Some((t_first_s, t_last_s)) = span else {
        return Err(AnalysisError::Invalid(format!(
            "No stored rows between {} and {} s",
            range.from(),
            range.to()
        )));
    };
    Ok(readings
        .iter()
        .zip(points)
        .map(|((name, r), points)| {
            let value = statistic(r.stat, &points);
            let reading = ReadingValue {
                stat: r.stat,
                of: r.of.clone(),
                value,
                n: points.len(),
                t_first_s,
                t_last_s,
            };
            (name.clone(), reading)
        })
        .collect())
}

/// `stat` over the `(t_s, value)` points of a range; None when it has no value.
fn statistic(stat: Stat, points: &[(f64, f64)]) -> Option<f64> {
    match stat {
        Stat::Mean => mean(points.iter().map(|(_, v)| *v)),
        Stat::Slope => slope(points.iter().copied()),
        Stat::Max => points.iter().map(|(_, v)| *v).reduce(f64::max),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_range_is_finite_and_runs_forwards() {
        let range = Range::new(1.0, 2.5).unwrap();
        assert_eq!((range.from(), range.to()), (1.0, 2.5));
        assert!(range.contains(1.0) && range.contains(2.5) && !range.contains(2.6));
        for [a, b] in [
            [2.0, 2.0],
            [3.0, 1.0],
            [f64::NAN, 1.0],
            [0.0, f64::INFINITY],
        ] {
            assert_eq!(Range::new(a, b), Err(RangeError), "{a} {b}");
        }
        let parsed: Range = serde_json::from_str("[0.5, 1]").unwrap();
        assert_eq!(<[f64; 2]>::from(parsed), [0.5, 1.0]);
        let refused = serde_json::from_str::<Range>("[1, 0.5]").unwrap_err();
        assert_eq!(
            refused.to_string(),
            "A range is two finite times in seconds, the first before the second"
        );
    }

    #[test]
    fn a_max_is_the_largest_value_of_the_range_wherever_it_falls() {
        let flash = [(212.4, 4.24), (212.5, 6.57), (213.0, 7.01), (213.5, 6.63)];
        assert_eq!(statistic(Stat::Max, &flash), Some(7.01));
        assert_eq!(statistic(Stat::Max, &flash[..2]), Some(6.57));
        assert_eq!(statistic(Stat::Max, &[]), None);
    }
}
