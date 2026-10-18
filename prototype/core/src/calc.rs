//! The one place a derived value is computed, for live points and for review alike.
//!
//! A [`Program`] is everything one role computes per row, in dependency order. An
//! [`Evaluator`] runs it over a capture's rows and is the only way a derived value is ever
//! produced, so the live chart and the stored-data review cannot disagree.

use std::collections::{BTreeSet, HashMap};
use std::fmt;

use crate::expr::{Expression, Params};
use crate::templates::{DerivedValue, Template, object};

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
    d.expr
        .names()
        .iter()
        .map(String::as_str)
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
}

impl fmt::Display for CalcError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CalcError::Cycle(cycle) => write!(f, "Derived {cycle}"),
        }
    }
}

impl std::error::Error for CalcError {}

/// Where a step reads a value: a column of the row or an earlier step's output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Slot {
    Column(usize),
    Step(usize),
}

#[derive(Clone, Debug, PartialEq)]
enum Step {
    Expr { name: String, expr: Expression },
}

impl Step {
    fn name(&self) -> &str {
        match self {
            Step::Expr { name, .. } => name,
        }
    }
}

/// Everything one role computes per row, built once per template and role.
#[derive(Clone, Debug, PartialEq)]
pub struct Program {
    role: String,
    /// Stored or alias columns the steps read, in the order a [`Sample`] supplies them.
    columns: Vec<String>,
    steps: Vec<Step>,
    slots: HashMap<String, Slot>,
}

/// One row as the program sees it: the program's columns, in [`Program::columns`] order.
pub struct Sample<'a> {
    pub columns: &'a [Option<f64>],
}

impl Program {
    /// The role's derived values in dependency order. A name an expression reads that is
    /// neither a parameter nor an earlier step is a column of the role, which validation
    /// guaranteed.
    pub fn for_role(template: &Template, role: &str) -> Result<Program, CalcError> {
        let parameters: BTreeSet<&str> = object(template.data(), "parameters")
            .keys()
            .map(String::as_str)
            .collect();
        let ordered =
            derived_order(template.derived(), role, &parameters).map_err(CalcError::Cycle)?;
        let mut columns: Vec<String> = Vec::new();
        let mut slots = HashMap::new();
        let mut steps = Vec::new();
        for d in ordered {
            for name in d.expr.names() {
                if parameters.contains(name.as_str()) || slots.contains_key(name) {
                    continue;
                }
                slots.insert(name.clone(), Slot::Column(columns.len()));
                columns.push(name.clone());
            }
            slots.insert(d.name.clone(), Slot::Step(steps.len()));
            steps.push(Step::Expr {
                name: d.name.clone(),
                expr: d.expr.clone(),
            });
        }
        Ok(Program {
            role: role.to_string(),
            columns,
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

    /// Output names in step order: what a live point or a `calc:` table carries.
    pub fn values(&self) -> impl Iterator<Item = &str> {
        self.steps.iter().map(Step::name)
    }

    pub fn evaluator(&self, params: &Params) -> Evaluator {
        Evaluator {
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
}

impl Evaluator {
    pub fn program(&self) -> &Program {
        &self.program
    }

    /// Outputs for this row in step order; None where an input is missing or the arithmetic
    /// has no value.
    pub fn push(&mut self, sample: Sample) -> Vec<Option<f64>> {
        let mut outputs: Vec<Option<f64>> = Vec::with_capacity(self.program.steps.len());
        for step in &self.program.steps {
            let value = match step {
                Step::Expr { expr, .. } => expr.eval(&self.params, |name| {
                    match *self.program.slots.get(name)? {
                        Slot::Column(i) => sample.columns.get(i).copied().flatten(),
                        Slot::Step(j) => outputs.get(j).copied().flatten(),
                    }
                }),
            };
            outputs.push(value);
        }
        outputs
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::json;

    use super::*;
    use crate::templates::{Paths, TemplateStore, load_profiles, validate};

    fn jii() -> Template {
        TemplateStore::new(Paths::default(), Path::new("/nonexistent"))
            .get("jii-leaf-co2-fluorescence", None)
            .unwrap()
    }

    #[test]
    fn a_program_reads_the_roles_columns_and_computes_what_eval_computes() {
        let template = jii();
        let ms = Program::for_role(&template, "ms").unwrap();
        assert_eq!(ms.columns(), ["m44"]);
        assert_eq!(ms.values().collect::<Vec<_>>(), ["ubar_co2"]);
        let params = template.params();
        let mut eval = ms.evaluator(&params);
        let expected = template.derived()[0]
            .expr
            .eval(&params, |n| (n == "m44").then_some(0.5));
        assert_eq!(expected, Some(360.7291325894277));
        assert_eq!(
            eval.push(Sample {
                columns: &[Some(0.5)]
            }),
            vec![expected]
        );
        assert_eq!(eval.push(Sample { columns: &[None] }), vec![None]);
    }

    #[test]
    fn a_zero_divisor_is_none_and_columns_are_sorted_by_name() {
        let template = jii();
        let light = Program::for_role(&template, "light").unwrap();
        assert_eq!(light.columns(), ["R", "S"]);
        let mut eval = light.evaluator(&template.params());
        assert_eq!(
            eval.push(Sample {
                columns: &[Some(4.0), Some(1000.0)]
            }),
            vec![Some(46.120000000000005)]
        );
        assert_eq!(
            eval.push(Sample {
                columns: &[Some(0.0), Some(1000.0)]
            }),
            vec![None]
        );
    }

    #[test]
    fn a_role_without_derived_values_has_an_empty_program() {
        let template = jii();
        let none = Program::for_role(&template, "nobody").unwrap();
        assert!(none.columns().is_empty());
        assert_eq!(none.values().count(), 0);
        assert_eq!(
            none.evaluator(&Params::new()).push(Sample { columns: &[] }),
            Vec::<Option<f64>>::new()
        );
    }

    #[test]
    fn derived_values_are_computed_after_the_derived_values_they_read() {
        let mut data = jii().data().clone();
        data["derived"] = json!({
            "doubled": {"role": "ms", "expr": "ubar_co2 * 2"},
            "ubar_co2": {"role": "ms", "expr": "(m44 - co2_zero_mv) * ubar_per_mv"},
            "fluorescence": {"role": "light", "expr": "(S - ambit_offset) / R"},
            "halved": {"role": "ms", "expr": "doubled / 4"},
        });
        let profiles = load_profiles(&Paths::default().instruments).unwrap();
        let template = validate(data, &profiles).unwrap();
        let ms = Program::for_role(&template, "ms").unwrap();
        assert_eq!(
            ms.values().collect::<Vec<_>>(),
            ["ubar_co2", "doubled", "halved"]
        );
        assert_eq!(ms.columns(), ["m44"]);
        let mut eval = ms.evaluator(&template.params());
        let ubar = 360.7291325894277;
        assert_eq!(
            eval.push(Sample {
                columns: &[Some(0.5)]
            }),
            vec![Some(ubar), Some(ubar * 2.0), Some(ubar * 2.0 / 4.0)]
        );
        assert_eq!(
            eval.push(Sample { columns: &[None] }),
            vec![None, None, None]
        );
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
}
