//! The one place a derived value is computed, for live points and for review alike.
//!
//! A [`Program`] is everything one role computes per row, in evaluation order. An
//! [`Evaluator`] runs it over a capture's rows and is the only way a derived value is ever
//! produced, so the live chart and the stored-data review cannot disagree.

use std::collections::HashMap;

use crate::expr::{Expression, Params};
use crate::templates::{Template, object};

/// Where a step reads a value: a column of the row or an earlier step's output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Slot {
    Column(usize),
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
    /// The role's derived values over the template's parameter names. A name an expression
    /// reads that is not a parameter is a column of the role, which validation guaranteed.
    pub fn for_role(template: &Template, role: &str) -> Program {
        let parameters = object(template.data(), "parameters");
        let mut columns: Vec<String> = Vec::new();
        let mut slots = HashMap::new();
        let mut steps = Vec::new();
        for d in template.derived().iter().filter(|d| d.role == role) {
            for name in d.expr.names() {
                if parameters.contains_key(name) || slots.contains_key(name) {
                    continue;
                }
                slots.insert(name.clone(), Slot::Column(columns.len()));
                columns.push(name.clone());
            }
            steps.push(Step::Expr {
                name: d.name.clone(),
                expr: d.expr.clone(),
            });
        }
        Program {
            role: role.to_string(),
            columns,
            steps,
            slots,
        }
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

    use super::*;
    use crate::templates::{Paths, TemplateStore};

    fn jii() -> Template {
        TemplateStore::new(Paths::default(), Path::new("/nonexistent"))
            .get("jii-leaf-co2-fluorescence", None)
            .unwrap()
    }

    #[test]
    fn a_program_reads_the_roles_columns_and_computes_what_eval_computes() {
        let template = jii();
        let ms = Program::for_role(&template, "ms");
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
        let light = Program::for_role(&template, "light");
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
        let none = Program::for_role(&template, "nobody");
        assert!(none.columns().is_empty());
        assert_eq!(none.values().count(), 0);
        assert_eq!(
            none.evaluator(&Params::new()).push(Sample { columns: &[] }),
            Vec::<Option<f64>>::new()
        );
    }
}
