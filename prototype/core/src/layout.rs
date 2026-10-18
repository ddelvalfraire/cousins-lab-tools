//! The run page's layout: views of components placed on a 12-column grid.
//!
//! A template may leave sizes and rows out; `normalize` fills them per kind and stacks an
//! unplaced component below everything before it. `errors` checks the normalized layout
//! against the template's charts, derived values, parameters and roles.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Map, Value, json};

use crate::pycompat::{display, list_repr, repr};
use crate::templates::{array, object, truthy};

pub const GRID_COLUMNS: i64 = 12;

const FALLBACK_SIZE: (i64, i64) = (6, 3);
const UNSUPPORTED_KINDS: [(&str, &str); 1] =
    [("calibration", "the engine has no calibration model yet")];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Captures,
    Chart,
    Controls,
    Group,
    Inputs,
    Metric,
}

impl Kind {
    /// Sorted by name, as the Python engine lists them in messages.
    pub const ALL: [Kind; 6] = [
        Kind::Captures,
        Kind::Chart,
        Kind::Controls,
        Kind::Group,
        Kind::Inputs,
        Kind::Metric,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Kind::Captures => "captures",
            Kind::Chart => "chart",
            Kind::Controls => "controls",
            Kind::Group => "group",
            Kind::Inputs => "inputs",
            Kind::Metric => "metric",
        }
    }

    pub fn parse(name: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.name() == name)
    }

    /// Width and height in grid cells when the template gives none.
    pub fn default_size(self) -> (i64, i64) {
        match self {
            Kind::Chart => (8, 4),
            Kind::Metric => (4, 2),
            Kind::Controls => (4, 3),
            Kind::Inputs => (6, 4),
            Kind::Captures => (12, 3),
            Kind::Group => (12, 5),
        }
    }
}

pub(crate) fn kind_of(component: &Value) -> Option<Kind> {
    component.get("kind")?.as_str().and_then(Kind::parse)
}

/// One view with every chart two to a row, then the controls and the captures.
pub fn default_layout(data: &Value) -> Value {
    let charts = array(data, "charts");
    let mut components: Vec<Value> = charts
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let id = c.get("id").cloned().unwrap_or(Value::Null);
            let i = i as i64;
            json!({"id": format!("chart-{}", display(&id)), "kind": "chart", "chart": id,
                   "x": i % 2 * 6, "y": i / 2 * 4, "w": 6, "h": 4})
        })
        .collect();
    let bottom = (charts.len() as i64 + 1) / 2 * 4;
    components
        .push(json!({"id": "controls", "kind": "controls", "x": 0, "y": bottom, "w": 4, "h": 3}));
    components
        .push(json!({"id": "captures", "kind": "captures", "x": 4, "y": bottom, "w": 8, "h": 3}));
    json!({"views": [{"id": "run", "name": "Run", "components": components}]})
}

fn place(items: &[Value], prefix: &str) -> Vec<Value> {
    let mut bottom = 0;
    items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let Some(c) = item.as_object() else {
                return item.clone();
            };
            let mut c = c.clone();
            let (w, h) = kind_of(item).map_or(FALLBACK_SIZE, Kind::default_size);
            if !c.get("id").is_some_and(truthy) {
                c.insert("id".into(), json!(format!("{prefix}-{}", i + 1)));
            }
            for (key, default) in [("x", 0), ("y", bottom), ("w", w), ("h", h)] {
                c.entry(key).or_insert(json!(default));
            }
            if kind_of(item) == Some(Kind::Group) && c.get("components").is_none_or(Value::is_array)
            {
                let prefix = display(&c["id"]);
                let placed = place(array(item, "components"), &prefix);
                c.insert("components".into(), Value::Array(placed));
            }
            if let Some([_, y, _, h]) = rect(&c) {
                bottom = bottom.max(y + h);
            }
            Value::Object(c)
        })
        .collect()
}

fn rect(c: &Map<String, Value>) -> Option<[i64; 4]> {
    let cell = |key| c.get(key).and_then(Value::as_i64);
    Some([cell("x")?, cell("y")?, cell("w")?, cell("h")?])
}

/// The layout with every id, name, position and size filled in, on a `columns`-wide grid.
pub fn normalize(data: &Value) -> Value {
    let layout = match data.get("layout") {
        Some(layout) if truthy(layout) => layout.clone(),
        _ => default_layout(data),
    };
    let views: Vec<Value> = array(&layout, "views")
        .iter()
        .enumerate()
        .filter_map(|(i, view)| {
            let mut v = view.as_object()?.clone();
            let given_id = view.get("id").filter(|id| truthy(id));
            let id = given_id
                .cloned()
                .unwrap_or(json!(format!("view-{}", i + 1)));
            let name = view
                .get("name")
                .filter(|n| truthy(n))
                .or(given_id)
                .cloned()
                .unwrap_or(json!(format!("View {}", i + 1)));
            let components = match view.get("components") {
                None => Vec::new(),
                Some(Value::Array(items)) => place(items, &display(&id)),
                Some(_) => Vec::new(),
            };
            v.insert("id".into(), id);
            v.insert("name".into(), name);
            v.insert("components".into(), Value::Array(components));
            Some(Value::Object(v))
        })
        .collect();
    json!({"columns": GRID_COLUMNS, "views": views})
}

fn known(value: Option<&Value>, names: &Map<String, Value>) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|v| names.contains_key(v))
}

fn repr_of(value: Option<&Value>) -> String {
    value.map_or_else(|| "None".into(), repr)
}

struct Check<'a> {
    data: &'a Value,
    /// Chart id to its time axis, `run` or `source`.
    charts: BTreeMap<&'a str, &'a str>,
    seen: BTreeSet<String>,
    errors: Vec<String>,
}

/// The axes of every chart component in `items`, groups included.
fn chart_axes<'a>(items: &[Value], charts: &BTreeMap<&str, &'a str>, out: &mut BTreeSet<&'a str>) {
    for c in items {
        if kind_of(c) == Some(Kind::Chart)
            && let Some(axis) = c
                .get("chart")
                .and_then(Value::as_str)
                .and_then(|ch| charts.get(ch))
        {
            out.insert(axis);
        }
        chart_axes(array(c, "components"), charts, out);
    }
}

impl Check<'_> {
    fn components(&mut self, items: &[Value], place: &str) {
        let mut placed: Vec<(&str, [i128; 4])> = Vec::new();
        for item in items {
            let Some(c) = item.as_object() else {
                self.errors
                    .push(format!("Layout {place}: each component must be a mapping"));
                continue;
            };
            let id_value = c.get("id").unwrap_or(&Value::Null);
            let name = format!("Layout component {}", repr(id_value));
            let Some(id) = id_value.as_str() else {
                self.errors.push(format!(
                    "Layout {place}: component ids must be text, not {}",
                    repr(id_value)
                ));
                continue;
            };
            if !self.seen.insert(id.to_string()) {
                self.errors.push(format!("{name} is defined twice"));
            }
            let kind_value = c.get("kind");
            if let Some((kind, reason)) = UNSUPPORTED_KINDS
                .iter()
                .find(|(k, _)| kind_value.and_then(Value::as_str) == Some(*k))
            {
                self.errors.push(format!(
                    "{name}: kind {} is not supported; {reason}",
                    repr(&json!(kind))
                ));
                continue;
            }
            let Some(kind) = kind_of(item) else {
                self.errors.push(format!(
                    "{name}: unknown kind {}; use one of {}",
                    repr_of(kind_value),
                    list_repr(Kind::ALL.map(Kind::name))
                ));
                continue;
            };
            match rect(c).map(|r| r.map(i128::from)) {
                None => self
                    .errors
                    .push(format!("{name}: x, y, w and h must be whole numbers")),
                Some([x, y, w, h])
                    if x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLUMNS.into() =>
                {
                    self.errors.push(format!(
                        "{name} is outside the {GRID_COLUMNS}-column grid (x={x}, y={y}, w={w}, h={h})"
                    ));
                }
                Some(r) => {
                    for (other, p) in &placed {
                        if overlap(p, &r) {
                            self.errors.push(format!(
                                "Layout components {} and {} overlap in {place}",
                                repr(&json!(other)),
                                repr(id_value)
                            ));
                        }
                    }
                    placed.push((id, r));
                }
            }
            let roles = object(self.data, "roles");
            let role = c.get("role").filter(|r| !r.is_null());
            if let Some(role) = role
                && !known(Some(role), roles)
            {
                self.errors
                    .push(format!("{name}: unknown role {}", repr(role)));
            }
            let derived = object(self.data, "derived");
            match kind {
                Kind::Chart => {
                    let chart = c.get("chart");
                    if !chart
                        .and_then(Value::as_str)
                        .is_some_and(|ch| self.charts.contains_key(ch))
                    {
                        self.errors
                            .push(format!("{name}: unknown chart {}", repr_of(chart)));
                    }
                }
                Kind::Metric => {
                    let value = c.get("value");
                    match value
                        .and_then(Value::as_str)
                        .filter(|v| derived.contains_key(*v))
                    {
                        None => self
                            .errors
                            .push(format!("{name}: {} is not a derived value", repr_of(value))),
                        Some(v) => {
                            let own = derived[v].get("role").unwrap_or(&Value::Null);
                            if let Some(role) = role
                                && role != own
                            {
                                self.errors.push(format!(
                                    "{name}: a metric takes its role from {v} ({}); remove role {}",
                                    display(own),
                                    repr(role)
                                ));
                            }
                        }
                    }
                }
                Kind::Inputs => {
                    let names: Option<Vec<&str>> = match c.get("parameters").filter(|p| truthy(p)) {
                        None => Some(Vec::new()),
                        Some(p) => p
                            .as_array()
                            .and_then(|items| items.iter().map(Value::as_str).collect()),
                    };
                    let parameters = object(self.data, "parameters");
                    match names {
                        None => self.errors.push(format!(
                            "{name}: parameters must be a list of parameter names"
                        )),
                        Some(names) => {
                            let unknown: BTreeSet<&str> = names
                                .into_iter()
                                .filter(|n| !parameters.contains_key(*n))
                                .collect();
                            if !unknown.is_empty() {
                                self.errors.push(format!(
                                    "{name}: unknown parameters {}",
                                    list_repr(unknown)
                                ));
                            }
                        }
                    }
                }
                Kind::Group => match c.get("components") {
                    Some(Value::Array(children)) => {
                        self.components(children, &format!("group {}", repr(id_value)));
                    }
                    _ => self
                        .errors
                        .push(format!("{name}: components must be a list")),
                },
                Kind::Captures | Kind::Controls => {}
            }
        }
    }
}

fn overlap(a: &[i128; 4], b: &[i128; 4]) -> bool {
    let ([ax, ay, aw, ah], [bx, by, bw, bh]) = (a, b);
    ax < &(bx + bw) && bx < &(ax + aw) && ay < &(by + bh) && by < &(ay + ah)
}

/// Every reason the template's layout cannot be drawn, in the Python engine's words.
pub(crate) fn errors(data: &Value) -> Vec<String> {
    if let Some(layout) = data.get("layout") {
        let Some(views) = layout
            .get("views")
            .and_then(Value::as_array)
            .filter(|v| !v.is_empty())
        else {
            return vec!["layout.views must be a non-empty list".into()];
        };
        if !views
            .iter()
            .all(|v| v.is_object() && v.get("components").is_none_or(Value::is_array))
        {
            return vec!["Layout: each view must be a mapping with a list of components".into()];
        }
    }
    let mut check = Check {
        data,
        charts: array(data, "charts")
            .iter()
            .filter_map(|c| {
                let axis = c.get("x").and_then(Value::as_str).unwrap_or("run");
                Some((c.get("id")?.as_str()?, axis))
            })
            .collect(),
        seen: BTreeSet::new(),
        errors: Vec::new(),
    };
    let mut view_ids: Vec<Value> = Vec::new();
    for view in array(&normalize(data), "views") {
        let id = &view["id"];
        if view_ids.contains(id) {
            check
                .errors
                .push(format!("Layout view {} is defined twice", repr(id)));
        }
        view_ids.push(id.clone());
        let components = array(view, "components");
        check.components(components, &format!("view {}", repr(id)));
        // A range selection is shared by every chart of a view, so they must share an axis.
        let mut axes = BTreeSet::new();
        chart_axes(components, &check.charts, &mut axes);
        if axes.len() > 1 {
            check.errors.push(format!(
                "Layout view {}: every chart must use the same x; found {}",
                repr(id),
                list_repr(axes)
            ));
        }
    }
    check.errors
}
