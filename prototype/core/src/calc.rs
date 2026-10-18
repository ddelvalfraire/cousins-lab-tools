//! The one place a derived value is computed, for live points and for review alike.
//!
//! A [`Program`] is everything one role computes per row, in dependency order. An
//! [`Evaluator`] runs it over a capture's rows and is the only way a derived value is ever
//! produced, so the live chart and the stored-data review cannot disagree.

use std::collections::{BTreeSet, HashMap, VecDeque};
use std::fmt;

use crate::contract::{Clock, ClockKind};
use crate::expr::{Expression, Params};
use crate::templates::{DerivedKind, DerivedValue, Template};

/// A value that reaches itself through the values it reads.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cycle {
    pub name: String,
    /// The names between `name` and itself, in reading order; empty when it reads itself.
    pub through: Vec<String>,
}

impl fmt::Display for Cycle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}: depends on itself", self.name)?;
        if !self.through.is_empty() {
            write!(f, " through {}", self.through.join(", "))?;
        }
        Ok(())
    }
}

/// Indices of `items` ordered so that every item comes after the items it depends on. Each
/// item is its name and the names it reads; a name that is not an item is ignored.
pub fn dependency_order(items: &[(&str, Vec<&str>)]) -> Result<Vec<usize>, Cycle> {
    #[derive(Clone, Copy, PartialEq)]
    enum Mark {
        New,
        Open,
        Done,
    }
    fn visit(
        i: usize,
        items: &[(&str, Vec<&str>)],
        index: &HashMap<&str, usize>,
        marks: &mut [Mark],
        stack: &mut Vec<usize>,
        order: &mut Vec<usize>,
    ) -> Result<(), Cycle> {
        match marks[i] {
            Mark::Done => return Ok(()),
            Mark::Open => {
                let start = stack.iter().position(|&s| s == i).unwrap_or(0);
                return Err(Cycle {
                    name: items[i].0.to_string(),
                    through: stack[start + 1..]
                        .iter()
                        .map(|&s| items[s].0.to_string())
                        .collect(),
                });
            }
            Mark::New => {}
        }
        marks[i] = Mark::Open;
        stack.push(i);
        for dep in &items[i].1 {
            if let Some(&j) = index.get(dep) {
                visit(j, items, index, marks, stack, order)?;
            }
        }
        stack.pop();
        marks[i] = Mark::Done;
        order.push(i);
        Ok(())
    }
    let index: HashMap<&str, usize> = items
        .iter()
        .enumerate()
        .map(|(i, (name, _))| (*name, i))
        .collect();
    let mut marks = vec![Mark::New; items.len()];
    let mut order = Vec::with_capacity(items.len());
    for i in 0..items.len() {
        visit(i, items, &index, &mut marks, &mut Vec::new(), &mut order)?;
    }
    Ok(order)
}

/// Among `derived`, the values of `role` that `d` reads. Parameters are never dependencies.
fn dependencies<'a>(
    d: &'a DerivedValue,
    derived: &'a [DerivedValue],
    parameters: &BTreeSet<&str>,
) -> Vec<&'a str> {
    d.names()
        .into_iter()
        .filter(|n| !parameters.contains(n))
        .filter(|n| derived.iter().any(|o| o.name == *n && o.role == d.role))
        .collect()
}

/// The derived values of `role` in evaluation order, or the cycle that prevents one.
pub fn derived_order<'a>(
    derived: &'a [DerivedValue],
    role: &str,
    parameters: &BTreeSet<&str>,
) -> Result<Vec<&'a DerivedValue>, Cycle> {
    let own: Vec<&DerivedValue> = derived.iter().filter(|d| d.role == role).collect();
    let items: Vec<(&str, Vec<&str>)> = own
        .iter()
        .map(|d| (d.name.as_str(), dependencies(d, derived, parameters)))
        .collect();
    Ok(dependency_order(&items)?
        .into_iter()
        .map(|i| own[i])
        .collect())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CalcError {
    Cycle(Cycle),
    /// A slope needs seconds on the recording's own clock, and the capture records none.
    NoSourceClock {
        role: String,
        derived: String,
    },
}

impl fmt::Display for CalcError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CalcError::Cycle(cycle) => write!(f, "Derived {cycle}"),
            CalcError::NoSourceClock { role, derived } => write!(
                f,
                "Derived {derived}: role {role} records no elapsed or device clock"
            ),
        }
    }
}

impl std::error::Error for CalcError {}

/// The capture's own clock in seconds: an elapsed or device counter, which replay speed
/// cannot stretch the way host time is stretched.
#[derive(Clone, Debug, PartialEq)]
pub struct SourceClock {
    pub column: String,
    pub seconds_per_unit: f64,
}

impl SourceClock {
    pub fn from_clocks(clocks: &[Clock]) -> Option<SourceClock> {
        clocks
            .iter()
            .find(|c| matches!(c.kind, ClockKind::Elapsed | ClockKind::DeviceRelative))
            .map(|c| SourceClock {
                column: c.column.clone(),
                seconds_per_unit: c.seconds_per_unit,
            })
    }
}

/// Where a step reads a value: a column of the row or an earlier step's output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Slot {
    Column(usize),
    Step(usize),
}

#[derive(Clone, Debug, PartialEq)]
enum Step {
    Expr {
        name: String,
        expr: Expression,
    },
    Slope {
        name: String,
        of: Slot,
        window_s: f64,
        min_points: usize,
    },
}

impl Step {
    fn name(&self) -> &str {
        match self {
            Step::Expr { name, .. } | Step::Slope { name, .. } => name,
        }
    }
}

/// Everything one role computes per row, built once per template, role and capture clocks.
#[derive(Clone, Debug, PartialEq)]
pub struct Program {
    role: String,
    /// Stored or alias columns the steps read, in the order a [`Sample`] supplies them.
    columns: Vec<String>,
    clock: Option<SourceClock>,
    steps: Vec<Step>,
    slots: HashMap<String, Slot>,
}

/// One row as the program sees it: seconds on the source clock, and the program's columns
/// in [`Program::columns`] order.
pub struct Sample<'a> {
    pub t_s: Option<f64>,
    pub columns: &'a [Option<f64>],
}

impl Program {
    /// The role's derived values in dependency order. A name a step reads that is neither
    /// a parameter nor an earlier step is a column of the role, which validation guaranteed.
    /// Fails only when a slope step finds no source clock among `clocks`.
    pub fn for_role(
        template: &Template,
        role: &str,
        clocks: &[Clock],
    ) -> Result<Program, CalcError> {
        let parameters: BTreeSet<&str> = template
            .param_specs()
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        let ordered =
            derived_order(template.derived(), role, &parameters).map_err(CalcError::Cycle)?;
        let clock = SourceClock::from_clocks(clocks);
        let mut columns: Vec<String> = Vec::new();
        let mut slots: HashMap<String, Slot> = HashMap::new();
        let mut steps = Vec::new();
        for d in ordered {
            for name in d.names() {
                if parameters.contains(name) || slots.contains_key(name) {
                    continue;
                }
                slots.insert(name.to_string(), Slot::Column(columns.len()));
                columns.push(name.to_string());
            }
            let step = match &d.kind {
                DerivedKind::Expr(expr) => Step::Expr {
                    name: d.name.clone(),
                    expr: expr.clone(),
                },
                DerivedKind::Slope {
                    of,
                    window_s,
                    min_points,
                } => {
                    if clock.is_none() {
                        return Err(CalcError::NoSourceClock {
                            role: role.to_string(),
                            derived: d.name.clone(),
                        });
                    }
                    Step::Slope {
                        name: d.name.clone(),
                        of: slots[of],
                        window_s: *window_s,
                        min_points: *min_points,
                    }
                }
            };
            slots.insert(d.name.clone(), Slot::Step(steps.len()));
            steps.push(step);
        }
        Ok(Program {
            role: role.to_string(),
            columns,
            clock,
            steps,
            slots,
        })
    }

    pub fn role(&self) -> &str {
        &self.role
    }

    pub fn columns(&self) -> &[String] {
        &self.columns
    }

    pub fn clock(&self) -> Option<&SourceClock> {
        self.clock.as_ref()
    }

    /// Output names in step order: what a live point or a `calc:` table carries.
    pub fn values(&self) -> impl Iterator<Item = &str> {
        self.steps.iter().map(Step::name)
    }

    pub fn evaluator(&self, params: &Params) -> Evaluator {
        Evaluator {
            windows: vec![VecDeque::new(); self.steps.len()],
            first_t: None,
            program: self.clone(),
            params: params.clone(),
        }
    }
}

/// Running state for one capture. `push` is the only way a derived value is computed.
#[derive(Clone, Debug)]
pub struct Evaluator {
    program: Program,
    params: Params,
    /// Per step, the `(t_s, value)` points inside a slope's trailing window. Empty for
    /// expression steps.
    windows: Vec<VecDeque<(f64, f64)>>,
    /// The earliest source time seen, which decides whether a window has been fully observed.
    first_t: Option<f64>,
}

impl Evaluator {
    pub fn program(&self) -> &Program {
        &self.program
    }

    /// Outputs for this row in step order; None where an input is missing or the arithmetic
    /// has no value. A slope step drops window points older than `t_s - window_s`, adds this
    /// row's point when it has a finite value, and answers None until the window has been
    /// fully observed (`first_t <= t_s - window_s`) and holds `min_points` points.
    pub fn push(&mut self, sample: Sample) -> Vec<Option<f64>> {
        let Evaluator {
            program,
            params,
            windows,
            first_t,
        } = self;
        if let Some(t) = sample.t_s {
            *first_t = Some(first_t.map_or(t, |f| f.min(t)));
        }
        let mut outputs: Vec<Option<f64>> = Vec::with_capacity(program.steps.len());
        for (i, step) in program.steps.iter().enumerate() {
            let read = |slot: Slot| match slot {
                Slot::Column(c) => sample.columns.get(c).copied().flatten(),
                Slot::Step(s) => outputs.get(s).copied().flatten(),
            };
            let value = match step {
                Step::Expr { expr, .. } => {
                    expr.eval(params, |name| read(*program.slots.get(name)?))
                }
                Step::Slope {
                    of,
                    window_s,
                    min_points,
                    ..
                } => sample.t_s.and_then(|t| {
                    let since = t - window_s;
                    let window = &mut windows[i];
                    while window.front().is_some_and(|(wt, _)| *wt < since) {
                        window.pop_front();
                    }
                    if let Some(v) = read(*of).filter(|v| v.is_finite()) {
                        window.push_back((t, v));
                    }
                    let full = first_t.is_some_and(|f| f <= since);
                    (full && window.len() >= *min_points)
                        .then(|| slope(window.iter().copied()))
                        .flatten()
                }),
            };
            outputs.push(value);
        }
        outputs
    }
}

/// Least-squares slope of y on x, with x centred on the first point so large clock values
/// do not cancel. None for fewer than two points or zero spread in x.
pub fn slope(points: impl Iterator<Item = (f64, f64)> + Clone) -> Option<f64> {
    let (x0, _) = points.clone().next()?;
    let (mut n, mut sx, mut sy, mut sxx, mut sxy) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for (x, y) in points {
        let dx = x - x0;
        n += 1.0;
        sx += dx;
        sy += y;
        sxx += dx * dx;
        sxy += dx * y;
    }
    let denominator = n * sxx - sx * sx;
    (n >= 2.0 && denominator != 0.0)
        .then(|| (n * sxy - sx * sy) / denominator)
        .filter(|s| s.is_finite())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::{Value, json};

    use super::*;
    use crate::schemas;
    use crate::templates::{Paths, TemplateStore, load_profiles, validate};

    fn jii() -> Template {
        TemplateStore::new(Paths::default(), Path::new("/nonexistent"))
            .get("jii-leaf-co2-fluorescence", None)
            .unwrap()
    }

    fn with_derived(derived: Value) -> Template {
        let mut data = jii().data().clone();
        data["derived"] = derived;
        let profiles = load_profiles(&Paths::default().instruments).unwrap();
        validate(data, &profiles).unwrap()
    }

    fn expr_of(d: &DerivedValue) -> &Expression {
        match &d.kind {
            DerivedKind::Expr(expr) => expr,
            DerivedKind::Slope { .. } => panic!("{} is a slope", d.name),
        }
    }

    #[test]
    fn a_program_reads_the_roles_columns_and_computes_what_eval_computes() {
        let template = jii();
        let ms = Program::for_role(&template, "ms", &[]).unwrap();
        assert_eq!(ms.columns(), ["m44"]);
        assert_eq!(ms.values().collect::<Vec<_>>(), ["ubar_co2"]);
        let params = template.params();
        let mut eval = ms.evaluator(&params);
        let expected =
            expr_of(&template.derived()[0]).eval(&params, |n| (n == "m44").then_some(0.5));
        assert_eq!(expected, Some(360.7291325894277));
        let mut push = |m44| {
            eval.push(Sample {
                t_s: None,
                columns: &[m44],
            })
        };
        assert_eq!(push(Some(0.5)), vec![expected]);
        assert_eq!(push(None), vec![None]);
    }

    #[test]
    fn a_zero_divisor_is_none_and_columns_are_sorted_by_name() {
        let template = jii();
        let light = Program::for_role(&template, "light", &[]).unwrap();
        assert_eq!(light.columns(), ["R", "S"]);
        let mut eval = light.evaluator(&template.params());
        let mut push = |r, s| {
            eval.push(Sample {
                t_s: None,
                columns: &[Some(r), Some(s)],
            })
        };
        assert_eq!(push(4.0, 1000.0), vec![Some(46.120000000000005)]);
        assert_eq!(push(0.0, 1000.0), vec![None]);
    }

    #[test]
    fn a_role_without_derived_values_has_an_empty_program() {
        let template = jii();
        let none = Program::for_role(&template, "nobody", &[]).unwrap();
        assert!(none.columns().is_empty());
        assert_eq!(none.values().count(), 0);
        let empty = Sample {
            t_s: None,
            columns: &[],
        };
        assert_eq!(
            none.evaluator(&Params::new()).push(empty),
            Vec::<Option<f64>>::new()
        );
    }

    #[test]
    fn derived_values_are_computed_after_the_derived_values_they_read() {
        let template = with_derived(json!({
            "doubled": {"role": "ms", "expr": "ubar_co2 * 2"},
            "ubar_co2": {"role": "ms", "expr": "(m44 - co2_zero_mv) * ubar_per_mv"},
            "fluorescence": {"role": "light", "expr": "(S - ambit_offset) / R"},
            "halved": {"role": "ms", "expr": "doubled / 4"},
        }));
        let ms = Program::for_role(&template, "ms", &[]).unwrap();
        assert_eq!(
            ms.values().collect::<Vec<_>>(),
            ["ubar_co2", "doubled", "halved"]
        );
        assert_eq!(ms.columns(), ["m44"]);
        let mut eval = ms.evaluator(&template.params());
        let ubar = 360.7291325894277;
        let mut push = |m44| {
            eval.push(Sample {
                t_s: None,
                columns: &[m44],
            })
        };
        assert_eq!(
            push(Some(0.5)),
            vec![Some(ubar), Some(ubar * 2.0), Some(ubar * 2.0 / 4.0)]
        );
        assert_eq!(push(None), vec![None, None, None]);
    }

    #[test]
    fn a_cycle_names_the_value_and_the_values_it_runs_through() {
        let order = |items: &[(&str, &[&str])]| {
            let items: Vec<(&str, Vec<&str>)> =
                items.iter().map(|(n, d)| (*n, d.to_vec())).collect();
            dependency_order(&items)
        };
        assert_eq!(
            order(&[("c", &["b"]), ("a", &["m44"]), ("b", &["a", "k"])]),
            Ok(vec![1, 2, 0])
        );
        let cycle =
            order(&[("x", &["a"]), ("a", &["b"]), ("b", &["c"]), ("c", &["a"])]).unwrap_err();
        assert_eq!(cycle.to_string(), "a: depends on itself through b, c");
        assert_eq!(
            order(&[("a", &["a"])]).unwrap_err().to_string(),
            "a: depends on itself"
        );
    }

    #[test]
    fn slope_is_exact_on_a_line_and_none_without_spread() {
        let line: Vec<(f64, f64)> = (0..4).map(|i| (i as f64, 3.0 * i as f64 + 1.0)).collect();
        assert_eq!(slope(line.iter().copied()), Some(3.0));
        let offset: Vec<(f64, f64)> = line.iter().map(|(x, y)| (x + 1.0e9, *y)).collect();
        assert_eq!(slope(offset.iter().copied()), Some(3.0));
        assert_eq!(slope(line[..1].iter().copied()), None);
        assert_eq!(slope(std::iter::empty()), None);
        assert_eq!(slope([(2.0, 1.0), (2.0, 5.0)].into_iter()), None);
        assert_eq!(slope([(0.0, 5.0), (1.0, 3.0)].into_iter()), Some(-2.0));
    }

    #[test]
    fn a_slope_step_answers_only_over_a_full_window_with_enough_points() {
        let template = with_derived(json!({
            "ubar_co2": {"role": "ms", "expr": "(m44 - co2_zero_mv) * ubar_per_mv"},
            "fluorescence": {"role": "light", "expr": "(S - ambit_offset) / R"},
            "rate": {"role": "light", "slope": {"of": "S", "window_s": 3, "min_points": 3}},
        }));
        let light = Program::for_role(&template, "light", &schemas::ambit_clocks()).unwrap();
        assert_eq!(light.columns(), ["R", "S"]);
        assert_eq!(light.values().collect::<Vec<_>>(), ["fluorescence", "rate"]);
        assert_eq!(light.clock().unwrap().column, "t_device_ms");
        let mut eval = light.evaluator(&template.params());
        let mut rate = |t: f64, s: Option<f64>| {
            eval.push(Sample {
                t_s: Some(t),
                columns: &[Some(1.0), s],
            })[1]
        };
        let s = |t: f64| Some(2.0 * t);
        assert_eq!(rate(0.0, s(0.0)), None, "nothing before the window is full");
        assert_eq!(rate(1.0, s(1.0)), None);
        assert_eq!(rate(2.0, s(2.0)), None);
        assert_eq!(rate(3.0, s(3.0)), Some(2.0), "first full window");
        assert_eq!(rate(4.0, s(4.0)), Some(2.0));
        assert_eq!(
            rate(5.0, None),
            Some(2.0),
            "a missing value is left out, not zero"
        );
        assert_eq!(
            rate(9.0, s(9.0)),
            None,
            "after a gap the window holds one point"
        );
        assert_eq!(rate(10.0, s(10.0)), None);
        assert_eq!(rate(11.0, s(11.0)), Some(2.0), "three points again");
        assert_eq!(
            rate(12.0, Some(1.0e308 * 10.0)),
            Some(2.0),
            "an infinite value is left out like a missing one"
        );
        assert_eq!(
            slope([(0.0, 0.0), (1.0, 1.0e308), (2.0, 1.0e308)].into_iter()),
            None,
            "an overflowing slope is None"
        );
    }

    #[test]
    fn a_slope_without_a_source_clock_is_refused_and_a_row_without_time_is_none() {
        let template = with_derived(json!({
            "ubar_co2": {"role": "ms", "expr": "(m44 - co2_zero_mv) * ubar_per_mv"},
            "fluorescence": {"role": "light", "expr": "(S - ambit_offset) / R"},
            "rate": {"role": "light", "slope": {"of": "S", "window_s": 3, "min_points": 2}},
        }));
        let error = Program::for_role(&template, "light", &schemas::spool_clocks()).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Derived rate: role light records no elapsed or device clock"
        );
        let light = Program::for_role(&template, "light", &schemas::ambit_clocks()).unwrap();
        assert_eq!(light.columns(), ["R", "S"]);
        let mut eval = light.evaluator(&Params::new());
        let mut rate = |t: Option<f64>, s: f64| {
            eval.push(Sample {
                t_s: t,
                columns: &[Some(1.0), Some(s)],
            })[1]
        };
        rate(Some(0.0), 1.0);
        rate(Some(5.0), 1.0);
        assert_eq!(
            rate(None, 2.0),
            None,
            "a row without source time has no rate"
        );
        assert_eq!(rate(Some(6.0), 3.0), Some(2.0));
    }
}
