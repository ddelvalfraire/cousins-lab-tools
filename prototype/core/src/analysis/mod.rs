//! Session analysis: what the operator read, typed and tabled during a session, kept as an
//! immutable log, and the state that log folds to.

mod fold;
mod store;

pub use fold::{AnalysisState, fold};
pub use store::{Action, Record, RecordId, append, load_records};
