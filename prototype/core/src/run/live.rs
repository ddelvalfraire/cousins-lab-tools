//! What the UI polls during a run: recent points per capture, events and markers.
//!
//! Each capture has its own buffer behind its own lock. The buffers are not the manifest;
//! they hold only what the live charts need, and the oldest points fall off after
//! [`LIVE_BUFFER_ROWS`].

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::{Map, Value};

use super::Marker;
use super::seconds_since;
use crate::calc::{CalcError, Evaluator, Program, Sample};
use crate::contract::{Cell, Clock, Event, Row};
use crate::session::{Capture, CaptureStatus, SessionStatus, iso};
use crate::templates::Template;

pub const LIVE_BUFFER_ROWS: usize = 50_000;

/// Where each capture's poll left off, keyed as the UI sends them: `<role>` counts rows and
/// `<role>:events` counts events. A missing key starts from the beginning.
pub type Cursors = HashMap<String, u64>;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveEvent {
    pub kind: String,
    pub label: String,
    pub x_run_s: Option<f64>,
    pub value: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveCaptureView {
    /// The cursor for the next poll: every row this capture has received.
    pub next: u64,
    pub rows: Vec<Map<String, Value>>,
    pub events: Vec<LiveEvent>,
    pub events_next: u64,
    pub status: CaptureStatus,
    pub rows_total: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveView {
    pub status: SessionStatus,
    pub elapsed_s: f64,
    pub captures: IndexMap<String, LiveCaptureView>,
    pub markers: Vec<Marker>,
    pub manifest_captures: IndexMap<String, Capture>,
}

#[derive(Default)]
pub(super) struct LiveBuffer(Mutex<LiveState>);

#[derive(Default)]
struct LiveState {
    points: VecDeque<Map<String, Value>>,
    received: u64,
    events: Vec<LiveEvent>,
}

impl LiveBuffer {
    pub fn push_rows(&self, points: Vec<Map<String, Value>>) {
        let mut state = self.0.lock().unwrap();
        state.received += points.len() as u64;
        state.points.extend(points);
        let excess = state.points.len().saturating_sub(LIVE_BUFFER_ROWS);
        state.points.drain(..excess);
    }

    pub fn push_event(&self, event: LiveEvent) {
        self.0.lock().unwrap().events.push(event);
    }

    /// Rows from cursor `rows` on, or every buffered row when older ones have fallen off,
    /// and events from cursor `events` on.
    pub fn view(&self, rows: u64, events: u64, status: CaptureStatus) -> LiveCaptureView {
        let state = self.0.lock().unwrap();
        let dropped = state.received - state.points.len() as u64;
        let skip = rows.saturating_sub(dropped) as usize;
        let skip_events = events.min(state.events.len() as u64) as usize;
        LiveCaptureView {
            next: state.received,
            rows: state.points.iter().skip(skip).cloned().collect(),
            events: state.events[skip_events..].to_vec(),
            events_next: state.events.len() as u64,
            status,
            rows_total: state.received,
        }
    }
}

/// Where a live value comes from: the role's program, or a cell of the row.
enum Source {
    Output(usize),
    /// Position in the row, None when the row has no column of that name.
    Cell(Option<usize>),
}

/// Turns a capture's rows into live points: `x`, seconds since the group start on the host
/// clock, `t`, seconds on the capture's own clock when it records one, then each value the
/// template shows for the role. Derived values come from the role's [`Evaluator`] with the
/// template's default parameters; anything else is the column or alias of that name.
pub(super) struct PointMaker {
    /// Row positions of the program's columns, in program order.
    inputs: Vec<Option<usize>>,
    /// Row position of the source clock and its seconds per unit, when the capture has one.
    clock: Option<(usize, f64)>,
    values: Vec<(String, Source)>,
    evaluator: Evaluator,
    host_time: Option<usize>,
    pub t0: DateTime<Utc>,
}

impl PointMaker {
    pub fn new(
        template: &Template,
        role: &str,
        columns: Vec<String>,
        aliases: BTreeMap<String, String>,
        host_time: Option<usize>,
        clocks: &[Clock],
    ) -> Result<Self, CalcError> {
        let position = |name: &str| {
            let column = aliases.get(name).map_or(name, String::as_str);
            columns.iter().position(|c| c == column)
        };
        let program = Program::for_role(template, role, clocks)?;
        let inputs = program.columns().iter().map(|c| position(c)).collect();
        let clock = program
            .clock()
            .and_then(|c| Some((position(&c.column)?, c.seconds_per_unit)));
        let values = template
            .live_values(role)
            .into_iter()
            .map(|value| {
                let source = match program.values().position(|v| v == value) {
                    Some(i) => Source::Output(i),
                    None => Source::Cell(position(&value)),
                };
                (value, source)
            })
            .collect();
        Ok(PointMaker {
            inputs,
            clock,
            values,
            evaluator: program.evaluator(&template.params()),
            host_time,
            t0: DateTime::UNIX_EPOCH,
        })
    }

    pub fn point(&mut self, row: &Row) -> Map<String, Value> {
        let columns: Vec<Option<f64>> = self
            .inputs
            .iter()
            .map(|i| i.and_then(|i| row.get(i)).and_then(number))
            .collect();
        let t_s = self
            .clock
            .and_then(|(i, per_unit)| Some(number(row.get(i)?)? * per_unit));
        let outputs = self.evaluator.push(Sample {
            t_s,
            columns: &columns,
        });
        let x = match self.host_time.and_then(|i| row.get(i)) {
            Some(Cell::TimeUtc(t)) => Value::from(seconds_since(self.t0, *t)),
            _ => Value::Null,
        };
        let mut point = Map::new();
        point.insert("x".into(), x);
        point.insert("t".into(), t_s.map_or(Value::Null, Value::from));
        for (name, source) in &self.values {
            let value = match source {
                Source::Output(i) => outputs[*i].map_or(Value::Null, Value::from),
                Source::Cell(i) => i.and_then(|i| row.get(i)).map_or(Value::Null, json),
            };
            point.insert(name.clone(), value);
        }
        point
    }

    pub fn event(&self, event: &Event) -> LiveEvent {
        LiveEvent {
            kind: event.kind.clone(),
            label: event.label.clone(),
            x_run_s: event.t_host_utc.map(|t| seconds_since(self.t0, t)),
            value: event.value,
        }
    }
}

fn number(cell: &Cell) -> Option<f64> {
    match cell {
        Cell::Int(v) => Some(*v as f64),
        Cell::Float(v) => Some(*v),
        _ => None,
    }
}

fn json(cell: &Cell) -> Value {
    match cell {
        Cell::Null => Value::Null,
        Cell::Int(v) => Value::from(*v),
        Cell::Float(v) => Value::from(*v),
        Cell::Str(s) => Value::from(s.as_str()),
        Cell::TimeUtc(t) => Value::from(iso(*t)),
        Cell::TimeLocal(t) => Value::from(t.format("%Y-%m-%dT%H:%M:%S%.6f").to_string()),
    }
}
