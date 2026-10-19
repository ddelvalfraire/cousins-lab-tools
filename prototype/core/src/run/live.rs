//! What the UI polls during a run: recent points per capture, events and markers.
//!
//! Each capture has its own buffer behind its own lock. The buffers are not the manifest;
//! they hold only what the live charts need: the last [`LIVE_RECENT_ROWS`] rows at full rate,
//! and before them every `stride`-th row, the stride doubling whenever more than
//! [`LIVE_HISTORY_POINTS`] are kept. So a chart of the whole run starts at its first row and a
//! buffer never holds more than [`LIVE_BUFFER_ROWS`] points. A buffer keeps each recent row's
//! program inputs beside its point and owns the evaluator, so a parameter change recomputes
//! every point under the same lock that new rows take; the older points are recomputed from
//! the stored rows, so rates keep their full windows.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::Serialize;
use serde_json::{Map, Value};

use super::Marker;
use super::seconds_since;
use crate::calc::{CalcError, Evaluator, Program, Sample};
use crate::contract::{Cell, Clock, Column, Event, Row};
use crate::expr::Params;
use crate::session::{
    Capture, CaptureStatus, SessionError, SessionStatus, iso, read_segment, segments,
};
use crate::templates::Template;

pub const LIVE_RECENT_ROWS: usize = 25_000;
pub const LIVE_HISTORY_POINTS: usize = 25_000;
/// The most points one capture's buffer holds.
pub const LIVE_BUFFER_ROWS: usize = LIVE_RECENT_ROWS + LIVE_HISTORY_POINTS;

/// Where each capture's poll left off, keyed as the UI sends them: `<role>` counts rows and
/// `<role>:events` counts events. A missing key starts from the beginning.
pub type Cursors = HashMap<String, u64>;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveEvent {
    pub kind: String,
    pub label: String,
    pub x_run_s: Option<f64>,
    /// Seconds on the capture's own clock, when the event was placed on it.
    pub t_s: Option<f64>,
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
    /// Changes when the points were recomputed with new parameters; the UI then drops what
    /// it holds and polls every buffered point again.
    pub params_rev: u64,
}

pub(super) struct LiveBuffer(Mutex<LiveState>);

impl Default for LiveBuffer {
    fn default() -> Self {
        LiveBuffer::with_bounds(LIVE_RECENT_ROWS, LIVE_HISTORY_POINTS)
    }
}

struct LiveState {
    recent_rows: usize,
    history_points: usize,
    /// The last rows, at full rate.
    raw: VecDeque<RawPoint>,
    points: VecDeque<Map<String, Value>>,
    /// Older rows by row number, every `stride`-th.
    history: Vec<(u64, Map<String, Value>)>,
    stride: u64,
    received: u64,
    events: Vec<LiveEvent>,
    evaluation: Evaluation,
    stored: Option<StoredRows>,
    params_rev: u64,
}

/// Where a capture's stored rows are and how to turn them into points again.
pub(super) struct StoredRows {
    pub samples: PathBuf,
    pub columns: Vec<Column>,
    pub maker: PointMaker,
}

impl LiveBuffer {
    pub fn with_bounds(recent_rows: usize, history_points: usize) -> Self {
        LiveBuffer(Mutex::new(LiveState {
            recent_rows,
            history_points,
            raw: VecDeque::new(),
            points: VecDeque::new(),
            history: Vec::new(),
            stride: 1,
            received: 0,
            events: Vec::new(),
            evaluation: Evaluation::default(),
            stored: None,
            params_rev: 0,
        }))
    }

    /// The evaluation this capture's rows go through, before its first row.
    pub fn attach(&self, evaluation: Evaluation) {
        self.0.lock().unwrap().evaluation = evaluation;
    }

    /// Where older rows are read back from when parameters change.
    pub fn attach_stored(&self, stored: StoredRows) {
        self.0.lock().unwrap().stored = Some(stored);
    }

    pub fn push_rows(&self, rows: Vec<RawPoint>) {
        let mut guard = self.0.lock().unwrap();
        let state = &mut *guard;
        state.received += rows.len() as u64;
        for raw in rows {
            state.points.push_back(state.evaluation.point(&raw));
            state.raw.push_back(raw);
        }
        while state.points.len() > state.recent_rows {
            let row = state.received - state.points.len() as u64;
            let point = state
                .points
                .pop_front()
                .expect("more points than the bound");
            state.raw.pop_front();
            state.keep_older(row, point);
        }
    }

    /// Recomputes every point with `params`, unless `rev` is not newer than the revision the
    /// points already have. Points older than the recent rows are recomputed from the stored
    /// rows when the capture has any, which also fills the recent rows' rate windows.
    pub fn set_params(&self, params: &Params, rev: u64) {
        let mut guard = self.0.lock().unwrap();
        let state = &mut *guard;
        if rev <= state.params_rev {
            return;
        }
        state.evaluation.restart(params);
        let first_recent = state.received - state.points.len() as u64;
        if first_recent > 0 && state.stored.is_some() {
            state.history.clear();
            state.stride = 1;
            // A failed read leaves the older points that were read; the recent rows and the
            // stored files are unaffected.
            let _ = state.replay_stored(first_recent);
        }
        state.points = state
            .raw
            .iter()
            .map(|r| state.evaluation.point(r))
            .collect();
        state.params_rev = rev;
    }

    pub fn params_rev(&self) -> u64 {
        self.0.lock().unwrap().params_rev
    }

    pub fn push_event(&self, event: LiveEvent) {
        self.0.lock().unwrap().events.push(event);
    }

    /// Rows from cursor `rows` on: the kept older rows at or after it, then the recent ones;
    /// and events from cursor `events` on.
    pub fn view(&self, rows: u64, events: u64, status: CaptureStatus) -> LiveCaptureView {
        let state = self.0.lock().unwrap();
        let first_recent = state.received - state.points.len() as u64;
        let skip = rows.saturating_sub(first_recent) as usize;
        let older = state.history.iter().filter(|(row, _)| *row >= rows);
        let skip_events = events.min(state.events.len() as u64) as usize;
        LiveCaptureView {
            next: state.received,
            rows: older
                .map(|(_, point)| point)
                .chain(state.points.iter().skip(skip))
                .cloned()
                .collect(),
            events: state.events[skip_events..].to_vec(),
            events_next: state.events.len() as u64,
            status,
            rows_total: state.received,
        }
    }
}

impl LiveState {
    /// Keeps row `row`'s point if it falls on the stride, then halves the kept points by
    /// doubling the stride whenever they exceed the bound.
    fn keep_older(&mut self, row: u64, point: Map<String, Value>) {
        if row.is_multiple_of(self.stride) {
            self.history.push((row, point));
        }
        if self.history.len() > self.history_points {
            self.stride *= 2;
            let stride = self.stride;
            self.history.retain(|(row, _)| row.is_multiple_of(stride));
        }
    }

    /// Runs the stored rows before `first_recent` through the evaluation, keeping the older
    /// points as [`LiveState::keep_older`] would have. One segment is in memory at a time.
    fn replay_stored(&mut self, first_recent: u64) -> Result<(), SessionError> {
        let stored = self.stored.take().expect("checked by the caller");
        let mut row = 0;
        let result = (|| {
            for part in segments(&stored.samples)? {
                for cells in read_segment(&part, &stored.columns)? {
                    if row >= first_recent {
                        return Ok(());
                    }
                    let point = self.evaluation.point(&stored.maker.raw(&cells));
                    self.keep_older(row, point);
                    row += 1;
                }
            }
            Ok(())
        })();
        self.stored = Some(stored);
        result
    }
}

/// Where a live value comes from: the role's program, or a cell copied from the row.
enum Source {
    Output(usize),
    Cell(usize),
}

/// One row as the live buffer keeps it: the host-time `x`, the source-clock seconds, the
/// program's inputs, and the cells shown as they are.
#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct RawPoint {
    pub x: Value,
    pub t_s: Option<f64>,
    pub columns: Vec<Option<f64>>,
    pub cells: Vec<Value>,
}

/// Turns raw points into live points: `x`, `t`, then each value the template shows for the
/// role. Derived values come from the role's [`Evaluator`].
#[derive(Default)]
pub(super) struct Evaluation {
    /// None when the role computes nothing.
    evaluator: Option<Evaluator>,
    values: Vec<(String, Source)>,
}

impl Evaluation {
    fn point(&mut self, raw: &RawPoint) -> Map<String, Value> {
        let outputs = match &mut self.evaluator {
            Some(evaluator) => evaluator.push(Sample {
                t_s: raw.t_s,
                columns: &raw.columns,
            }),
            None => Vec::new(),
        };
        let mut point = Map::new();
        point.insert("x".into(), raw.x.clone());
        point.insert("t".into(), raw.t_s.map_or(Value::Null, Value::from));
        for (name, source) in &self.values {
            let value = match source {
                Source::Output(i) => outputs[*i].map_or(Value::Null, Value::from),
                Source::Cell(i) => raw.cells[*i].clone(),
            };
            point.insert(name.clone(), value);
        }
        point
    }

    /// A fresh evaluator with `params`, so slope windows refill from the rows pushed next.
    fn restart(&mut self, params: &Params) {
        if let Some(evaluator) = &mut self.evaluator {
            *evaluator = evaluator.program().evaluator(params);
        }
    }
}

/// Reads what the live view needs out of a capture's rows: host-time `x`, seconds on the
/// capture's own clock when it records one, the program's inputs, and the cells shown as
/// they are.
#[derive(Clone)]
pub(super) struct PointMaker {
    /// Row positions of the program's columns, in program order.
    inputs: Vec<Option<usize>>,
    /// Row position of the source clock and its seconds per unit, when the capture has one.
    clock: Option<(usize, f64)>,
    clock_column: Option<String>,
    /// Row positions of the values copied as they are; None when the row has no such column.
    cells: Vec<Option<usize>>,
    host_time: Option<usize>,
    pub t0: DateTime<Utc>,
}

impl PointMaker {
    /// The reader for the capture thread and the evaluation for its live buffer, with the
    /// template's default parameters.
    pub fn new(
        template: &Template,
        role: &str,
        columns: Vec<String>,
        aliases: BTreeMap<String, String>,
        host_time: Option<usize>,
        clocks: &[Clock],
    ) -> Result<(Self, Evaluation), CalcError> {
        let position = |name: &str| {
            let column = aliases.get(name).map_or(name, String::as_str);
            columns.iter().position(|c| c == column)
        };
        let program = Program::for_role(template, role, clocks)?;
        let inputs = program.columns().iter().map(|c| position(c)).collect();
        let clock = program
            .clock()
            .and_then(|c| Some((position(&c.column)?, c.seconds_per_unit)));
        let mut cells = Vec::new();
        let values = template
            .live_values(role)
            .into_iter()
            .map(|value| {
                let source = match program.values().position(|v| v == value) {
                    Some(i) => Source::Output(i),
                    None => {
                        cells.push(position(&value));
                        Source::Cell(cells.len() - 1)
                    }
                };
                (value, source)
            })
            .collect();
        let evaluation = Evaluation {
            evaluator: Some(program.evaluator(&template.params())),
            values,
        };
        let maker = PointMaker {
            inputs,
            clock,
            clock_column: program.clock().map(|c| c.column.clone()),
            cells,
            host_time,
            t0: DateTime::UNIX_EPOCH,
        };
        Ok((maker, evaluation))
    }

    pub fn raw(&self, row: &Row) -> RawPoint {
        let columns = self
            .inputs
            .iter()
            .map(|i| i.and_then(|i| row.get(i)).and_then(number))
            .collect();
        let t_s = self
            .clock
            .and_then(|(i, per_unit)| Some(number(row.get(i)?)? * per_unit));
        let x = match self.host_time.and_then(|i| row.get(i)) {
            Some(Cell::TimeUtc(t)) => Value::from(seconds_since(self.t0, *t)),
            _ => Value::Null,
        };
        let cells = self
            .cells
            .iter()
            .map(|i| i.and_then(|i| row.get(i)).map_or(Value::Null, json))
            .collect();
        RawPoint {
            x,
            t_s,
            columns,
            cells,
        }
    }

    pub fn event(&self, event: &Event) -> LiveEvent {
        LiveEvent {
            kind: event.kind.clone(),
            label: event.label.clone(),
            x_run_s: event.t_host_utc.map(|t| seconds_since(self.t0, t)),
            t_s: event
                .t_native
                .filter(|_| event.clock.is_some() && event.clock == self.clock_column),
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
