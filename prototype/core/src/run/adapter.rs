//! Instrument profile to adapter: the one place a profile's settings become adapter settings.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;

use crate::ambit::{self, AmbitReplay, ReplaySettings};
use crate::contract::{InputKind, Instrument, InstrumentError};
use crate::ms_workbook::{MassSpecSeries, RAW_SHEET, read_raw_sheet};
use crate::pycompat::{format_g, os_error, str_repr, strip};
use crate::simulate::{ChannelValues, SimulatedFrame, SpoolSimulator};
use crate::spool::{self, EzViewSpool, SpoolSettings};
use crate::templates::{Paths, Template};

pub const SIMULATED_SPOOL: &str = "simulated-ezview-spool.txt";

/// An adapter ready to check and run, plus what the manifest says about where its data comes
/// from. A simulated spool comes with its simulator, which the run starts at the group start.
pub struct BuiltAdapter {
    pub adapter: Box<dyn Instrument>,
    pub simulator: Option<SpoolSimulator>,
    pub note: String,
    pub sources: Vec<PathBuf>,
}

pub fn build_adapter(
    profile: &Value,
    role: &str,
    template: &Template,
    capture_dir: &Path,
    speed: f64,
    paths: &Paths,
) -> Result<BuiltAdapter, InstrumentError> {
    let settings = &profile["settings"];
    let model = |default: &str| profile["model"].as_str().unwrap_or(default).to_string();
    match text(profile, "adapter")? {
        "ezview_spool" => {
            let mut spool = SpoolSettings {
                model: model(spool::DEFAULT_MODEL),
                aliases: aliases(profile),
                poll_interval: Duration::from_secs_f64(
                    settings["poll_interval_s"].as_f64().unwrap_or(0.1),
                ),
                spool_path: None,
                input_kind: InputKind::Simulated,
            };
            let sim = &profile["simulate"];
            if sim.as_object().is_some_and(|s| !s.is_empty()) {
                let workbook = paths.resolve_path(text(sim, "workbook")?);
                let frames = simulated_frames(sim, &read_raw_sheet(&workbook, RAW_SHEET)?)?;
                let path = capture_dir.join("raw").join(SIMULATED_SPOOL);
                create_empty(&path)?;
                spool.spool_path = Some(path.clone());
                let note = format!(
                    "{}: spool written now by the simulator at {}x. {}",
                    InputKind::Simulated.label(),
                    format_g(speed),
                    strip(text(sim, "note")?)
                );
                return Ok(BuiltAdapter {
                    adapter: Box::new(EzViewSpool::new(spool)),
                    simulator: Some(SpoolSimulator::new(path, frames, speed)),
                    note,
                    sources: vec![workbook],
                });
            }
            spool.input_kind = input_kind(profile)?;
            spool.spool_path = settings["spool_path"]
                .as_str()
                .filter(|p| !p.is_empty())
                .map(|p| paths.resolve_path(p));
            Ok(BuiltAdapter {
                adapter: Box::new(EzViewSpool::new(spool)),
                simulator: None,
                note: "EZView spool file".into(),
                sources: vec![],
            })
        }
        "ambit_replay" => {
            let recording = paths.resolve_path(text(settings, "recording")?);
            let note = format!(
                "{}: {} at {}x. Rows and device T are recorded values; host times are this replay's.",
                InputKind::Replay.label(),
                recording.file_name().unwrap_or_default().to_string_lossy(),
                format_g(speed)
            );
            Ok(BuiltAdapter {
                adapter: Box::new(AmbitReplay::new(ReplaySettings {
                    model: model(ambit::DEFAULT_MODEL),
                    csv_path: recording.clone(),
                    speed,
                    flash_red_level: template.flash_red_level(role),
                })),
                simulator: None,
                note,
                sources: vec![recording],
            })
        }
        other => Err(InstrumentError::new(
            "ValueError",
            format!("Unknown adapter {other}"),
        )),
    }
}

/// Workbook rows `first_row..=last_row` (spreadsheet numbering, header in row 1), with each
/// spool channel taken from the series column the profile names.
fn simulated_frames(
    sim: &Value,
    series: &MassSpecSeries,
) -> Result<Vec<SimulatedFrame>, InstrumentError> {
    let lo = usize::try_from(integer(sim, "first_row")? - 2).map_err(|_| out_of_range())?;
    let hi = usize::try_from(integer(sim, "last_row")? - 1).map_err(|_| out_of_range())?;
    let times = series.t_elapsed_s.get(lo..hi).ok_or_else(out_of_range)?;
    let mut channels = Vec::new();
    for (channel, name) in sim["channels"].as_object().into_iter().flatten() {
        let number = channel
            .get(2..)
            .and_then(|n| n.parse::<usize>().ok())
            .ok_or_else(|| {
                InstrumentError::new(
                    "ValueError",
                    format!("invalid literal for int() with base 10: {channel:?}"),
                )
            })?;
        let name = name.as_str().unwrap_or_default();
        channels.push((number, series_column(series, name)?));
    }
    Ok(times
        .iter()
        .enumerate()
        .map(|(i, &t_s)| SimulatedFrame {
            t_s,
            values: channels
                .iter()
                .map(|(ch, column)| (*ch, column[lo + i]))
                .collect::<ChannelValues>(),
        })
        .collect())
}

fn series_column<'a>(series: &'a MassSpecSeries, name: &str) -> Result<&'a [f64], InstrumentError> {
    match name {
        "t_elapsed_s" => Ok(&series.t_elapsed_s),
        "m32" => Ok(&series.m32),
        "m44" => Ok(&series.m44),
        "m45" => Ok(&series.m45),
        _ => Err(InstrumentError::new(
            "AttributeError",
            format!(
                "'MassSpecSeries' object has no attribute {}",
                str_repr(name)
            ),
        )),
    }
}

/// The simulator appends to this file once the group starts. It exists from preparation on,
/// so the spool adapter's readiness check finds it as it would find EZView's.
fn create_empty(path: &Path) -> Result<(), InstrumentError> {
    let parent = path.parent().unwrap_or(path);
    fs::create_dir_all(parent).map_err(|e| os_error(&e, parent))?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| os_error(&e, path))?;
    Ok(())
}

fn aliases(profile: &Value) -> BTreeMap<String, String> {
    profile["aliases"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(alias, column)| Some((alias.clone(), column.as_str()?.to_string())))
        .collect()
}

fn input_kind(profile: &Value) -> Result<InputKind, InstrumentError> {
    serde_json::from_value(profile["input_kind"].clone()).map_err(|_| {
        InstrumentError::new(
            "ValueError",
            format!("Unknown input kind {}", profile["input_kind"]),
        )
    })
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, InstrumentError> {
    value[key].as_str().ok_or_else(|| missing(key))
}

fn integer(value: &Value, key: &str) -> Result<i64, InstrumentError> {
    value[key].as_i64().ok_or_else(|| missing(key))
}

fn missing(key: &str) -> InstrumentError {
    InstrumentError::new("KeyError", str_repr(key))
}

fn out_of_range() -> InstrumentError {
    InstrumentError::new("IndexError", "list index out of range")
}
