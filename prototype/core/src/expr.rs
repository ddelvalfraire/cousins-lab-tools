//! Derived-value expressions: arithmetic over column and parameter names only.
//!
//! One parse feeds both the DuckDB SQL of aligned views and the evaluator of live values, so
//! the two can never disagree about what an expression means.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use crate::repr::{float_repr, str_repr};

/// Template parameters by name. A name found here is a parameter, never a column.
pub type Params = BTreeMap<String, f64>;

#[derive(Clone, Debug, PartialEq)]
pub struct Expression {
    text: String,
    root: Node,
    names: BTreeSet<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Op {
    Add,
    Sub,
    Mul,
    Div,
}

#[derive(Clone, Debug, PartialEq)]
enum Node {
    Number {
        text: String,
        value: f64,
    },
    Name(String),
    Group(Box<Node>),
    Unary {
        op: Op,
        operand: Box<Node>,
    },
    Binary {
        op: Op,
        left: Box<Node>,
        right: Box<Node>,
    },
}

/// The expression text and the character position where it stops making sense.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExprError {
    pub text: String,
    pub position: usize,
}

impl fmt::Display for ExprError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "Unsupported syntax in expression {} at position {}",
            str_repr(&self.text),
            self.position
        )
    }
}

impl std::error::Error for ExprError {}

impl Expression {
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Every name the expression reads, parameters included.
    pub fn names(&self) -> &BTreeSet<String> {
        &self.names
    }

    /// DuckDB SQL with parameters inlined as float literals and other names quoted as columns.
    pub fn sql(&self, params: &Params) -> String {
        let mut out = String::new();
        self.root.sql(params, &mut out);
        out
    }

    /// The value for one row, or None when an operand is missing or a divisor is zero.
    pub fn eval(&self, params: &Params, row: impl Fn(&str) -> Option<f64>) -> Option<f64> {
        self.root.eval(params, &row)
    }
}

impl Op {
    fn symbol(self) -> char {
        match self {
            Op::Add => '+',
            Op::Sub => '-',
            Op::Mul => '*',
            Op::Div => '/',
        }
    }
}

impl Node {
    fn sql(&self, params: &Params, out: &mut String) {
        match self {
            Node::Number { text, .. } => push(out, text),
            Node::Name(name) => match params.get(name) {
                Some(value) => push(out, &float_repr(*value)),
                None => push(out, &format!("\"{name}\"")),
            },
            Node::Group(inner) => {
                push(out, "(");
                inner.sql(params, out);
                push(out, ")");
            }
            Node::Unary { op, operand } => {
                push(out, &op.symbol().to_string());
                operand.sql(params, out);
            }
            Node::Binary { op, left, right } => {
                left.sql(params, out);
                push(out, &op.symbol().to_string());
                right.sql(params, out);
            }
        }
    }

    fn eval(&self, params: &Params, row: &dyn Fn(&str) -> Option<f64>) -> Option<f64> {
        match self {
            Node::Number { value, .. } => Some(*value),
            Node::Name(name) => params.get(name).copied().or_else(|| row(name)),
            Node::Group(inner) => inner.eval(params, row),
            Node::Unary { op, operand } => {
                let value = operand.eval(params, row)?;
                Some(if *op == Op::Sub { -value } else { value })
            }
            Node::Binary { op, left, right } => {
                let (a, b) = (left.eval(params, row)?, right.eval(params, row)?);
                match op {
                    Op::Add => Some(a + b),
                    Op::Sub => Some(a - b),
                    Op::Mul => Some(a * b),
                    Op::Div if b == 0.0 => None,
                    Op::Div => Some(a / b),
                }
            }
        }
    }
}

// Tokens are joined without spaces, as the Python engine does, except that two minus signs
// are kept apart: `--` would start an SQL comment.
fn push(out: &mut String, piece: &str) {
    if out.ends_with('-') && piece.starts_with('-') {
        out.push(' ');
    }
    out.push_str(piece);
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Number(String),
    Name(String),
    Op(char),
}

pub fn parse(text: &str) -> Result<Expression, ExprError> {
    let tokens = tokenize(text)?;
    let mut parser = Parser {
        tokens: &tokens,
        next: 0,
        end: python_rstrip_len(text),
        text,
    };
    let root = parser.sum()?;
    if let Some((_, position)) = parser.peek() {
        return Err(parser.error(position));
    }
    let names = tokens
        .iter()
        .filter_map(|(tok, _)| match tok {
            Tok::Name(name) => Some(name.clone()),
            _ => None,
        })
        .collect();
    Ok(Expression {
        text: text.to_string(),
        root,
        names,
    })
}

fn python_space(c: char) -> bool {
    c.is_whitespace() || ('\x1c'..='\x1f').contains(&c)
}

fn python_rstrip_len(text: &str) -> usize {
    text.trim_end_matches(python_space).chars().count()
}

/// Mirrors the Python tokenizer's regex, positions counted in characters like Python's.
fn tokenize(text: &str) -> Result<Vec<(Tok, usize)>, ExprError> {
    let chars: Vec<char> = text.chars().collect();
    let end = python_rstrip_len(text);
    let error = |position| ExprError {
        text: text.to_string(),
        position,
    };
    let digits_from = |mut i: usize| {
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        i
    };
    let (mut tokens, mut pos) = (Vec::new(), 0);
    while pos < end {
        let start = pos;
        while python_space(chars[pos]) {
            pos += 1;
        }
        let c = chars[pos];
        let tok = if c.is_ascii_digit() {
            let mut i = digits_from(pos);
            if chars.get(i) == Some(&'.') {
                i = digits_from(i + 1);
            }
            if matches!(chars.get(i), Some('e' | 'E')) {
                let sign = usize::from(matches!(chars.get(i + 1), Some('+' | '-')));
                let after = digits_from(i + 1 + sign);
                if after > i + 1 + sign {
                    i = after;
                }
            }
            let number: String = chars[pos..i].iter().collect();
            pos = i;
            Tok::Number(number)
        } else if c.is_ascii_alphabetic() || c == '_' {
            let mut i = pos + 1;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let name: String = chars[pos..i].iter().collect();
            pos = i;
            Tok::Name(name)
        } else if "-+*/()".contains(c) {
            pos += 1;
            Tok::Op(c)
        } else {
            return Err(error(start));
        };
        tokens.push((tok, start));
    }
    Ok(tokens)
}

struct Parser<'a> {
    tokens: &'a [(Tok, usize)],
    next: usize,
    end: usize,
    text: &'a str,
}

impl Parser<'_> {
    fn peek(&self) -> Option<(&Tok, usize)> {
        self.tokens.get(self.next).map(|(tok, pos)| (tok, *pos))
    }

    fn error(&self, position: usize) -> ExprError {
        ExprError {
            text: self.text.to_string(),
            position,
        }
    }

    fn take_op(&mut self, ops: &[char]) -> Option<Op> {
        let (Tok::Op(c), _) = self.peek()? else {
            return None;
        };
        if !ops.contains(c) {
            return None;
        }
        let op = match c {
            '+' => Op::Add,
            '-' => Op::Sub,
            '*' => Op::Mul,
            _ => Op::Div,
        };
        self.next += 1;
        Some(op)
    }

    fn sum(&mut self) -> Result<Node, ExprError> {
        let mut left = self.product()?;
        while let Some(op) = self.take_op(&['+', '-']) {
            let right = self.product()?;
            left = Node::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn product(&mut self) -> Result<Node, ExprError> {
        let mut left = self.unary()?;
        while let Some(op) = self.take_op(&['*', '/']) {
            let right = self.unary()?;
            left = Node::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn unary(&mut self) -> Result<Node, ExprError> {
        match self.take_op(&['+', '-']) {
            Some(op) => Ok(Node::Unary {
                op,
                operand: Box::new(self.unary()?),
            }),
            None => self.primary(),
        }
    }

    fn primary(&mut self) -> Result<Node, ExprError> {
        let Some((tok, position)) = self.peek() else {
            return Err(self.error(self.end));
        };
        let node = match tok {
            Tok::Number(text) => Node::Number {
                value: text.parse().map_err(|_| self.error(position))?,
                text: text.clone(),
            },
            Tok::Name(name) => Node::Name(name.clone()),
            Tok::Op('(') => {
                self.next += 1;
                let inner = self.sum()?;
                match self.peek() {
                    Some((Tok::Op(')'), _)) => Node::Group(Box::new(inner)),
                    Some((_, position)) => return Err(self.error(position)),
                    None => return Err(self.error(self.end)),
                }
            }
            Tok::Op(_) => return Err(self.error(position)),
        };
        self.next += 1;
        Ok(node)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> Params {
        [
            ("co2_zero_mv", 0.303),
            ("ubar_per_mv", 1831.1123481696839),
            ("ambit_offset", 815.52),
            ("k", 2.0),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect()
    }

    fn row(values: &[(&str, f64)]) -> impl Fn(&str) -> Option<f64> {
        let values: BTreeMap<String, f64> =
            values.iter().map(|(k, v)| (k.to_string(), *v)).collect();
        move |name| values.get(name).copied()
    }

    fn names(e: &Expression) -> Vec<&str> {
        e.names().iter().map(String::as_str).collect()
    }

    #[test]
    fn sql_inlines_parameters_and_quotes_columns_as_python_does() {
        let cases = [
            (
                "(m44 - co2_zero_mv) * ubar_per_mv",
                "(\"m44\"-0.303)*1831.1123481696839",
            ),
            ("(S - ambit_offset) / R", "(\"S\"-815.52)/\"R\""),
            (" -S + 1.5e3*k ", "-\"S\"+1.5e3*2.0"),
            ("a / (b - 2.)", "\"a\"/(\"b\"-2.)"),
            ("-(-a)", "-(-\"a\")"),
        ];
        for (text, sql) in cases {
            assert_eq!(parse(text).unwrap().sql(&params()), sql, "{text}");
        }
        let e = parse("(m44 - co2_zero_mv) * ubar_per_mv").unwrap();
        assert_eq!(names(&e), ["co2_zero_mv", "m44", "ubar_per_mv"]);
    }

    #[test]
    fn evaluation_matches_python_and_is_none_for_missing_values_and_zero_divisors() {
        let p = params();
        let ubar = parse("(m44 - co2_zero_mv) * ubar_per_mv").unwrap();
        assert_eq!(ubar.eval(&p, row(&[("m44", 0.5)])), Some(360.7291325894277));
        assert_eq!(ubar.eval(&p, row(&[])), None);
        let fluorescence = parse("(S - ambit_offset) / R").unwrap();
        let sample = row(&[("S", 1000.0), ("R", 4.0)]);
        assert_eq!(fluorescence.eval(&p, sample), Some(46.120000000000005));
        let ratio = parse("S / R").unwrap();
        assert_eq!(ratio.eval(&p, row(&[("S", 1.0), ("R", 0.0)])), None);
        let signs = parse(" -S + 1.5e3*k ").unwrap();
        assert_eq!(signs.eval(&p, row(&[("S", 1000.0)])), Some(2000.0));
        assert_eq!(
            parse("-(-a)").unwrap().eval(&p, row(&[("a", 3.0)])),
            Some(3.0)
        );
        assert_eq!(parse("2 * 3 + 4").unwrap().eval(&p, row(&[])), Some(10.0));
        assert_eq!(parse("2 * (3 + 4)").unwrap().eval(&p, row(&[])), Some(14.0));
        assert_eq!(parse("8 / 4 / 2").unwrap().eval(&p, row(&[])), Some(1.0));
        assert_eq!(parse("8 - 4 - 2").unwrap().eval(&p, row(&[])), Some(2.0));
    }

    #[test]
    fn parameters_shadow_columns_of_the_same_name() {
        let e = parse("k * 3").unwrap();
        assert_eq!(e.eval(&params(), row(&[("k", 10.0)])), Some(6.0));
        assert_eq!(e.sql(&params()), "2.0*3");
    }

    #[test]
    fn double_minus_is_never_emitted_as_an_sql_comment() {
        let mut p = params();
        p.insert("neg".into(), -0.5);
        assert_eq!(parse("a - neg").unwrap().sql(&p), "\"a\"- -0.5");
        assert_eq!(parse("a - -b").unwrap().sql(&p), "\"a\"- -\"b\"");
    }

    #[test]
    fn unsupported_syntax_names_the_python_position() {
        let cases = [
            (
                "a % b",
                "Unsupported syntax in expression 'a % b' at position 1",
            ),
            (
                "a  ^ 2",
                "Unsupported syntax in expression 'a  ^ 2' at position 1",
            ),
            ("a$", "Unsupported syntax in expression 'a$' at position 1"),
            (
                ".5 * a",
                "Unsupported syntax in expression '.5 * a' at position 0",
            ),
            (
                "x = 1",
                "Unsupported syntax in expression 'x = 1' at position 1",
            ),
        ];
        for (text, message) in cases {
            assert_eq!(parse(text).unwrap_err().to_string(), message);
        }
    }

    #[test]
    fn malformed_arithmetic_is_rejected_where_it_breaks() {
        for (text, position) in [
            ("(a", 2),
            ("a +", 3),
            ("a b", 1),
            ("2 3", 1),
            (")", 0),
            ("", 0),
        ] {
            assert_eq!(parse(text).unwrap_err().position, position, "{text:?}");
        }
    }
}
