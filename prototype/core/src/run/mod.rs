//! Group runs: start every enabled role of a template together, each after its own delay.
//!
//! Requested start, the moment the engine started the adapter, and the first sample's receipt
//! time are recorded separately. Starting adapters together does not make the instruments
//! sample together; any relation between their samples comes from the clocks.

mod adapter;

use std::fmt;

use crate::contract::InstrumentError;
use crate::pycompat::str_repr;
use crate::session::SessionError;
use crate::templates::{Profiles, Template};

pub use adapter::{BuiltAdapter, SIMULATED_SPOOL, build_adapter};

#[derive(Debug)]
pub enum RunError {
    /// The request cannot start a run. The text is what the API shows.
    Invalid(String),
    /// A role names an instrument profile that is gone.
    UnknownInstrument(String),
    Instrument(InstrumentError),
    Session(SessionError),
}

impl fmt::Display for RunError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RunError::Invalid(message) => write!(f, "{message}"),
            RunError::UnknownInstrument(id) => write!(f, "Not found: {}", str_repr(id)),
            RunError::Instrument(e) => write!(f, "{e}"),
            RunError::Session(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for RunError {}

impl From<InstrumentError> for RunError {
    fn from(e: InstrumentError) -> Self {
        RunError::Instrument(e)
    }
}

impl From<SessionError> for RunError {
    fn from(e: SessionError) -> Self {
        RunError::Session(e)
    }
}

/// Refuses speeds outside 0.1x to 100x, and any speed but 1x when an enabled role reads
/// hardware, which cannot be sped up.
pub fn check_request(template: &Template, profiles: &Profiles, speed: f64) -> Result<(), RunError> {
    if !(0.1..=100.0).contains(&speed) {
        return Err(RunError::Invalid(
            "Replay speed must be between 0.1x and 100x".into(),
        ));
    }
    let mut hardware = Vec::new();
    for (role, cfg) in template.enabled_roles() {
        if profile(profiles, cfg)?["input_kind"] == "hardware" {
            hardware.push(role);
        }
    }
    if !hardware.is_empty() && speed != 1.0 {
        return Err(RunError::Invalid(format!(
            "Roles {} use hardware; hardware runs in real time (speed 1x)",
            hardware.join(", ")
        )));
    }
    Ok(())
}

fn profile<'a>(
    profiles: &'a Profiles,
    cfg: &serde_json::Value,
) -> Result<&'a serde_json::Value, RunError> {
    let id = cfg["instrument"].as_str().unwrap_or_default();
    profiles
        .get(id)
        .ok_or_else(|| RunError::UnknownInstrument(id.into()))
}

#[cfg(test)]
mod tests;
