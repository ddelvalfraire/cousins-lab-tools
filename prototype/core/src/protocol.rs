//! Ambit light protocols as the control notebook writes them, and the timing they request.
//!
//! A protocol is a list of steps, each a list whose first item names the step:
//! `[M, samples, interval_s, actinic]` measures, `[W, seconds]` waits, `[A, R|B, level]` sets
//! an external LED, and `[P]` redraws the notebook's plot. `{block, repeat}` expands a named
//! block, and a `$name` item is replaced from `vars`.

use serde::Serialize;
use serde_json::{Map, Value};

use crate::pycompat::round;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Led {
    Red,
    Blue,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Step {
    Measure {
        samples: u64,
        interval_s: f64,
        actinic: i64,
    },
    Wait {
        seconds: f64,
    },
    Light {
        led: Led,
        level: i64,
    },
    Plot,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Segment {
    pub start_s: f64,
    pub samples: u64,
    pub interval_s: f64,
    pub ambit_actinic: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ProtocolPlan {
    pub samples: u64,
    pub nominal_s: f64,
    pub flashes: u64,
    pub segments: Vec<Segment>,
}

/// The protocol's steps with blocks repeated and `$vars` substituted.
pub fn expand(protocol: &Value) -> Result<Vec<Step>, String> {
    let empty = Map::new();
    let blocks = protocol
        .get("blocks")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let vars = protocol
        .get("vars")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let steps = protocol
        .get("steps")
        .and_then(Value::as_array)
        .ok_or("Protocol has no steps")?;
    let mut expanded = Vec::new();
    for step in steps {
        if let Some(reference) = step.as_object() {
            let name = reference
                .get("block")
                .and_then(Value::as_str)
                .ok_or("Block step names no block")?;
            let block = blocks
                .get(name)
                .and_then(Value::as_array)
                .ok_or(format!("Unknown block {name:?}"))?;
            let repeat = reference
                .get("repeat")
                .map_or(Some(1), Value::as_u64)
                .ok_or("Block repeat is not a count")?;
            for _ in 0..repeat {
                for inner in block {
                    expanded.push(parse_step(inner, vars)?);
                }
            }
        } else {
            expanded.push(parse_step(step, vars)?);
        }
    }
    Ok(expanded)
}

/// Requested timing, as the notebook's `print_protocol` computes it.
pub fn plan(protocol: &Value) -> Result<ProtocolPlan, String> {
    let flash_level = protocol.get("flash_red_level").and_then(Value::as_i64);
    let (mut t, mut samples, mut flashes, mut segments) = (0.0, 0, 0, Vec::new());
    for step in expand(protocol)? {
        match step {
            Step::Measure {
                samples: n,
                interval_s,
                actinic,
            } => {
                segments.push(Segment {
                    start_s: round(t, 6),
                    samples: n,
                    interval_s,
                    ambit_actinic: actinic,
                });
                t += n as f64 * interval_s;
                samples += n;
            }
            Step::Wait { seconds } => t += seconds,
            Step::Light {
                led: Led::Red,
                level,
            } if Some(level) == flash_level => flashes += 1,
            Step::Light { .. } | Step::Plot => {}
        }
    }
    Ok(ProtocolPlan {
        samples,
        nominal_s: round(t, 6),
        flashes,
        segments,
    })
}

fn parse_step(step: &Value, vars: &Map<String, Value>) -> Result<Step, String> {
    let items: Vec<&Value> = step
        .as_array()
        .ok_or(format!("Step {step} is not a list"))?
        .iter()
        .map(|item| {
            match item
                .as_str()
                .and_then(|s| s.starts_with('$').then(|| vars.get(s)))
            {
                Some(Some(value)) => value,
                _ => item,
            }
        })
        .collect();
    let bad = || {
        format!(
            "Step {step} does not match [M, n, interval, actinic], [W, s], [A, R|B, level] or [P]"
        )
    };
    let number = |i: usize| items.get(i).and_then(|v| v.as_f64()).ok_or_else(bad);
    let integer = |i: usize| items.get(i).and_then(|v| v.as_i64()).ok_or_else(bad);
    match items.first().and_then(|v| v.as_str()) {
        Some("M") if items.len() == 4 => Ok(Step::Measure {
            samples: u64::try_from(integer(1)?).map_err(|_| bad())?,
            interval_s: number(2)?,
            actinic: integer(3)?,
        }),
        Some("W") if items.len() == 2 => Ok(Step::Wait {
            seconds: number(1)?,
        }),
        Some("A") if items.len() == 3 => {
            let led = match items[1].as_str() {
                Some("R") => Led::Red,
                Some("B") => Led::Blue,
                _ => return Err(bad()),
            };
            Ok(Step::Light {
                led,
                level: integer(2)?,
            })
        }
        Some("P") => Ok(Step::Plot),
        _ => Err(bad()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn flash_protocol() -> Value {
        json!({
            "flash_red_level": 2500,
            "vars": {"$actinic": 225},
            "blocks": {"flash": [["M", 2, 0.05, 0], ["A", "R", 2500], ["M", 1, 0.05, 250], ["A", "R", 0]]},
            "steps": [["A", "R", "$actinic"], ["M", 10, 0.1, 0], ["P"], ["W", 3], {"block": "flash", "repeat": 2}]
        })
    }

    #[test]
    fn blocks_repeat_and_vars_substitute() {
        let steps = expand(&flash_protocol()).unwrap();
        assert_eq!(steps.len(), 4 + 2 * 4);
        assert_eq!(
            steps[0],
            Step::Light {
                led: Led::Red,
                level: 225
            }
        );
        assert_eq!(steps[3], Step::Wait { seconds: 3.0 });
    }

    #[test]
    fn plan_counts_samples_time_and_flashes_at_the_flash_level_only() {
        let plan = plan(&flash_protocol()).unwrap();
        assert_eq!((plan.samples, plan.flashes), (10 + 2 * 3, 2));
        assert_eq!(plan.nominal_s, 1.0 + 3.0 + 2.0 * 0.15);
        assert_eq!(
            plan.segments[1],
            Segment {
                start_s: 4.0,
                samples: 2,
                interval_s: 0.05,
                ambit_actinic: 0
            }
        );
    }

    #[test]
    fn plan_serializes_with_the_python_field_names() {
        let plan = plan(&json!({"steps": [["M", 700, 0.1, 0]]})).unwrap();
        assert_eq!(
            serde_json::to_value(plan).unwrap(),
            json!({"samples": 700, "nominal_s": 70.0, "flashes": 0,
                   "segments": [{"start_s": 0.0, "samples": 700, "interval_s": 0.1, "ambit_actinic": 0}]})
        );
    }

    #[test]
    fn malformed_steps_are_rejected_with_the_step() {
        for bad in [
            json!([["M", 10, 0.1]]),
            json!([["X", 1]]),
            json!([["A", "G", 5]]),
            json!([{"block": "nope"}]),
        ] {
            let error = expand(&json!({"steps": bad})).unwrap_err();
            assert!(error.contains("Step") || error.contains("block"), "{error}");
        }
    }
}
