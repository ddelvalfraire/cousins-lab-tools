//! Experiment templates and instrument profiles: loading and validation.
//!
//! A template stays the YAML document it was written as, a `serde_json::Value`, so a session
//! can snapshot it and the UI can edit it as is. `validate` checks it by hand and keeps the
//! Python engine's error text word for word; a `Template` is a document that passed.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use serde_json::{Map, Value};

use crate::expr::{self, Expression, Params};
use crate::protocol::{self, ProtocolPlan};
use crate::repr::{list_repr, repr};
use crate::schemas;

const ON_FAILURE: [&str; 2] = ["continue_others", "stop_group"];
const REFERENCES: [&str; 3] = ["clock", "elapsed", "event"];
const IMPORTERS: [&str; 2] = ["ambit_csv", "ms_workbook"];
const DEFAULT_FLASH_RED_LEVEL: i64 = 2500;
static EMPTY: LazyLock<Map<String, Value>> = LazyLock::new(Map::new);

/// Where built-in templates, instrument profiles and the repository root live.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Paths {
    pub templates: PathBuf,
    pub instruments: PathBuf,
    pub repo: PathBuf,
}

impl Default for Paths {
    fn default() -> Self {
        let prototype = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("the crate sits inside prototype/");
        Paths {
            templates: prototype.join("engine/templates"),
            instruments: prototype.join("engine/instruments"),
            repo: prototype
                .parent()
                .expect("prototype/ sits inside the repository")
                .to_path_buf(),
        }
    }
}

impl Paths {
    /// A profile path with `${repo}` replaced by the repository root.
    pub fn resolve_path(&self, text: &str) -> PathBuf {
        PathBuf::from(text.replace("${repo}", &self.repo.to_string_lossy()))
    }
}

/// A YAML file that could not be read or parsed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileError {
    pub path: PathBuf,
    pub message: String,
}

impl fmt::Display for FileError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}: {}", self.path.display(), self.message)
    }
}

impl std::error::Error for FileError {}

pub fn parse_yaml(text: &str) -> Result<Value, String> {
    serde_norway::from_str(text).map_err(|e| e.to_string())
}

pub fn read_yaml(path: &Path) -> Result<Value, FileError> {
    let error = |message: String| FileError {
        path: path.to_path_buf(),
        message,
    };
    let text = fs::read_to_string(path).map_err(|e| error(e.to_string()))?;
    parse_yaml(&text).map_err(error)
}

/// The `*.yaml` files of a directory, sorted by name.
pub(crate) fn yaml_files(dir: &Path) -> Result<Vec<PathBuf>, FileError> {
    let entries = fs::read_dir(dir).map_err(|e| FileError {
        path: dir.to_path_buf(),
        message: e.to_string(),
    })?;
    let mut files: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.is_file() && p.extension().is_some_and(|ext| ext == "yaml"))
        .collect();
    files.sort();
    Ok(files)
}

/// Instrument profiles by id. They stay documents: manifests and the UI show them whole.
pub type Profiles = BTreeMap<String, Value>;

pub fn load_profiles(dir: &Path) -> Result<Profiles, FileError> {
    let mut profiles = Profiles::new();
    for path in yaml_files(dir)? {
        let profile = read_yaml(&path)?;
        let Some(id) = profile.get("id").and_then(Value::as_str) else {
            return Err(FileError {
                path,
                message: "An instrument profile needs a text id".into(),
            });
        };
        profiles.insert(id.to_string(), profile);
    }
    Ok(profiles)
}

/// Every reason a template was rejected, joined as the UI shows them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TemplateError(pub String);

impl fmt::Display for TemplateError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TemplateError {}

#[derive(Clone, Debug, PartialEq)]
pub struct DerivedValue {
    pub name: String,
    pub role: String,
    pub expr: Expression,
}

/// A template document that passed validation.
#[derive(Clone, Debug, PartialEq)]
pub struct Template {
    data: Value,
    derived: Vec<DerivedValue>,
    plans: BTreeMap<String, ProtocolPlan>,
}

impl Template {
    pub fn data(&self) -> &Value {
        &self.data
    }

    pub fn id(&self) -> &str {
        self.data["id"].as_str().unwrap_or_default()
    }

    pub fn revision(&self) -> i64 {
        self.data["revision"].as_i64().unwrap_or_default()
    }

    /// Every role, enabled or not, in template order.
    pub fn roles(&self) -> &Map<String, Value> {
        object(&self.data, "roles")
    }

    pub fn enabled_roles(&self) -> Vec<(&str, &Value)> {
        self.roles()
            .iter()
            .filter(|(_, role)| role.get("enabled").is_none_or(truthy))
            .map(|(name, role)| (name.as_str(), role))
            .collect()
    }

    pub fn params(&self) -> Params {
        object(&self.data, "parameters")
            .iter()
            .filter_map(|(k, p)| Some((k.clone(), p.get("value")?.as_f64()?)))
            .collect()
    }

    pub fn derived(&self) -> &[DerivedValue] {
        &self.derived
    }

    /// The requested timing of the role's protocol, or None when the role runs none.
    pub fn protocol_plan(&self, role: &str) -> Option<&ProtocolPlan> {
        self.plans.get(role)
    }

    pub fn flash_red_level(&self, role: &str) -> i64 {
        self.protocol(role)
            .and_then(|p| p.get("flash_red_level"))
            .and_then(Value::as_i64)
            .unwrap_or(DEFAULT_FLASH_RED_LEVEL)
    }

    fn protocol(&self, role: &str) -> Option<&Value> {
        let name = self.roles().get(role)?.get("protocol")?.as_str()?;
        self.data.get("protocols")?.get(name)
    }

    /// Charts with their series cut to enabled roles; a chart left with none is dropped.
    pub fn charts(&self) -> Vec<Value> {
        let enabled: BTreeSet<&str> = self.enabled_roles().into_iter().map(|(r, _)| r).collect();
        array(&self.data, "charts")
            .iter()
            .filter_map(|chart| {
                let series: Vec<Value> = array(chart, "series")
                    .iter()
                    .filter(|s| s["role"].as_str().is_some_and(|r| enabled.contains(r)))
                    .cloned()
                    .collect();
                let mut chart = chart.as_object()?.clone();
                (!series.is_empty()).then(|| {
                    chart.insert("series".into(), Value::Array(series));
                    Value::Object(chart)
                })
            })
            .collect()
    }
}

pub(crate) fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

pub(crate) fn object<'a>(value: &'a Value, key: &str) -> &'a Map<String, Value> {
    value.get(key).and_then(Value::as_object).unwrap_or(&EMPTY)
}

pub(crate) fn array<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn text_in<'a>(value: Option<&'a Value>, names: &Map<String, Value>) -> Option<&'a str> {
    value
        .and_then(Value::as_str)
        .filter(|s| names.contains_key(*s))
}

fn repr_of(value: Option<&Value>) -> String {
    value.map_or_else(|| "None".into(), repr)
}

/// Checks the document's shape where the Python engine would have crashed; there is no
/// point reporting finer reasons until these hold.
fn shape_errors(data: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    for key in ["id", "revision", "name", "roles"] {
        if data.get(key).is_none() {
            errors.push(format!("Missing '{key}'"));
        }
    }
    if !errors.is_empty() {
        return errors;
    }
    if !data["id"].is_string() {
        errors.push(format!("id must be text, not {}", repr(&data["id"])));
    }
    if data["revision"].as_i64().is_none() {
        errors.push(format!(
            "revision must be a whole number, not {}",
            repr(&data["revision"])
        ));
    }
    match data["roles"].as_object() {
        None => errors.push("roles must be a mapping of role names to settings".into()),
        Some(roles) => errors.extend(
            roles
                .iter()
                .filter(|(_, role)| !role.is_object())
                .map(|(name, _)| format!("Role {name}: settings must be a mapping")),
        ),
    }
    for (key, kind, ok) in [
        (
            "parameters",
            "a mapping",
            Value::is_object as fn(&Value) -> bool,
        ),
        ("derived", "a mapping", Value::is_object),
        ("charts", "a list", Value::is_array),
        ("alignment", "a mapping", Value::is_object),
    ] {
        if data.get(key).is_some_and(|v| !ok(v)) {
            errors.push(format!("{key} must be {kind}"));
        }
    }
    errors
}

pub fn validate(data: Value, profiles: &Profiles) -> Result<Template, TemplateError> {
    let errors = shape_errors(&data);
    if !errors.is_empty() {
        return Err(TemplateError(errors.join("; ")));
    }
    let mut errors = Vec::new();
    let roles = object(&data, "roles");
    let protocols = object(&data, "protocols");
    let mut role_columns: BTreeMap<&str, BTreeSet<String>> = BTreeMap::new();
    let mut plans = BTreeMap::new();
    for (name, role) in roles {
        let instrument = role.get("instrument");
        let Some(profile) = instrument
            .and_then(Value::as_str)
            .and_then(|i| profiles.get(i))
        else {
            errors.push(format!(
                "Role {name}: unknown instrument profile {}",
                repr_of(instrument)
            ));
            continue;
        };
        let adapter = profile.get("adapter");
        let Some(adapter_columns) = adapter
            .and_then(Value::as_str)
            .and_then(schemas::adapter_columns)
        else {
            errors.push(format!(
                "Role {name}: instrument profile {} has unknown adapter {}",
                repr_of(instrument),
                repr_of(adapter)
            ));
            continue;
        };
        let mut columns: BTreeSet<String> = adapter_columns.into_iter().map(|c| c.name).collect();
        columns.extend(object(profile, "aliases").keys().cloned());
        if let Some(import) = role.get("import").filter(|v| truthy(v)) {
            match import.as_str().and_then(schemas::import_columns) {
                Some(imported) => {
                    let imported: BTreeSet<String> = imported.into_iter().map(|c| c.name).collect();
                    columns.retain(|c| imported.contains(c));
                }
                None => errors.push(format!(
                    "Role {name}: unknown import {}; use one of {}",
                    repr(import),
                    list_repr(IMPORTERS)
                )),
            }
        }
        role_columns.insert(name, columns);
        if role
            .get("start_delay_s")
            .is_some_and(|d| d.as_f64().is_none_or(|s| s < 0.0))
        {
            errors.push(format!(
                "Role {name}: start_delay_s must be a number of seconds >= 0"
            ));
        }
        if role
            .get("on_failure")
            .is_some_and(|f| !f.as_str().is_some_and(|f| ON_FAILURE.contains(&f)))
        {
            errors.push(format!(
                "Role {name}: on_failure must be one of {}",
                list_repr(ON_FAILURE)
            ));
        }
        if let Some(wanted) = role.get("protocol").filter(|v| truthy(v)) {
            match text_in(Some(wanted), protocols) {
                None => errors.push(format!("Role {name}: unknown protocol {}", repr(wanted))),
                Some(p)
                    if protocols[p]
                        .get("flash_red_level")
                        .and_then(Value::as_i64)
                        .is_none() =>
                {
                    errors.push(format!(
                        "Role {name}: protocol {} needs a whole-number flash_red_level",
                        repr(wanted)
                    ));
                }
                Some(p) => match protocol::plan(&protocols[p]) {
                    Ok(plan) => {
                        plans.insert(name.clone(), plan);
                    }
                    Err(e) => errors.push(format!("Role {name}: protocol {}: {e}", repr(wanted))),
                },
            }
        }
    }

    let parameters = object(&data, "parameters");
    for (name, parameter) in parameters {
        if parameter.get("value").and_then(Value::as_f64).is_none() {
            errors.push(format!("Parameter {name}: value must be a number"));
        }
    }

    let no_columns = BTreeSet::new();
    let mut derived = Vec::new();
    for (key, d) in object(&data, "derived") {
        let Some(text) = d.get("expr").and_then(Value::as_str) else {
            errors.push(format!("Derived {key}: expr must be text"));
            continue;
        };
        let expr = match expr::parse(text) {
            Ok(expr) => expr,
            Err(e) => {
                errors.push(format!("Derived {key}: {e}"));
                continue;
            }
        };
        let Some(role) = text_in(d.get("role"), roles) else {
            errors.push(format!(
                "Derived {key}: unknown role {}",
                repr_of(d.get("role"))
            ));
            continue;
        };
        let columns = role_columns.get(role).unwrap_or(&no_columns);
        let unknown: Vec<&str> = expr
            .names()
            .iter()
            .filter(|n| !parameters.contains_key(*n) && !columns.contains(*n))
            .map(String::as_str)
            .collect();
        if !unknown.is_empty() {
            errors.push(format!(
                "Derived {key}: unknown names {}",
                list_repr(unknown)
            ));
        }
        derived.push(DerivedValue {
            name: key.clone(),
            role: role.to_string(),
            expr,
        });
    }

    let derived_names = object(&data, "derived");
    for chart in array(&data, "charts") {
        let Some(id) = chart.get("id").and_then(Value::as_str) else {
            errors.push(format!(
                "Chart ids must be text, not {}",
                repr_of(chart.get("id"))
            ));
            continue;
        };
        let series = match chart.get("series") {
            None => &[][..],
            Some(Value::Array(series)) => series,
            Some(_) => {
                errors.push(format!("Chart {id}: series must be a list"));
                continue;
            }
        };
        for s in series {
            let Some(role) = text_in(s.get("role"), roles) else {
                errors.push(format!(
                    "Chart {id}: unknown role {}",
                    repr_of(s.get("role"))
                ));
                continue;
            };
            let value = s.get("value");
            let columns = role_columns.get(role).unwrap_or(&no_columns);
            if !value
                .and_then(Value::as_str)
                .is_some_and(|v| derived_names.contains_key(v) || columns.contains(v))
            {
                errors.push(format!(
                    "Chart {id}: {} is not a column or derived value of {role}",
                    repr_of(value)
                ));
            }
        }
    }

    let alignment = object(&data, "alignment");
    if alignment
        .get("default_reference")
        .is_some_and(|r| !r.as_str().is_some_and(|r| REFERENCES.contains(&r)))
    {
        errors.push(format!(
            "alignment.default_reference must be one of {}",
            list_repr(REFERENCES)
        ));
    }
    if let Some(event) = alignment.get("event").filter(|v| truthy(v))
        && text_in(Some(event), object(&data, "events")).is_none()
    {
        errors.push(format!(
            "alignment.event {} is not defined under events",
            repr(event)
        ));
    }
    if let Some(role) = alignment.get("trial_role").filter(|v| truthy(v))
        && text_in(Some(role), roles).is_none()
    {
        errors.push(format!("alignment.trial_role {} is not a role", repr(role)));
    }

    if !errors.is_empty() {
        return Err(TemplateError(errors.join("; ")));
    }
    Ok(Template {
        data,
        derived,
        plans,
    })
}
