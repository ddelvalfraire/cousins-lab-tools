//! The calibration file the legacy module 1 screen saves (`module1 main.py:1987-2021`): a
//! header of twelve names and one row of the calibration fields' text, in that order.

use crate::query::AnalysisError;

use super::carry::Carried;
use super::store::RecordId;

pub(super) const MODULE1_TEMPLATE: &str = "legacy-module1-rubisco";

/// Where a column of the file goes in the module 1 preset.
enum Column {
    Entry(&'static str),
    Step(&'static str, &'static str),
    /// A value the preset computes. It is loaded as an entry only when the file lacks what
    /// computes it, because an entry would stop later readings from changing it.
    Computed {
        parameter: &'static str,
        from: &'static str,
        /// Each group of column indices must hold at least that many numbers.
        needs: &'static [(&'static [usize], usize)],
    },
}

const CO2_POINTS: &[usize] = &[4, 5, 6, 7];
const BICARB_POINTS: &[usize] = &[8, 9, 10, 11];

const COLUMNS: [(&str, Column); 12] = [
    ("Temp", Column::Entry("temp_c")),
    (
        "O2 Calibration",
        Column::Computed {
            parameter: "o2_cal",
            from: "Temp and O2 Buffer Zero",
            needs: &[(&[0], 1), (&[2], 1)],
        },
    ),
    ("O2 Buffer Zero", Column::Step("o2_zero", "o2_zero_mv")),
    (
        "BiCarb/CO2",
        Column::Computed {
            parameter: "bicarb_per_co2",
            from: "the CO2 and BiCarb calibration points",
            needs: &[(CO2_POINTS, 2), (BICARB_POINTS, 2)],
        },
    ),
    ("CO2 Cal 0", Column::Step("co2_assay.zero", "m44")),
    ("CO2 Cal 6", Column::Step("co2_assay.ul6", "m44")),
    ("CO2 Cal 12", Column::Step("co2_assay.ul12", "m44")),
    ("CO2 Cal 18", Column::Step("co2_assay.ul18", "m44")),
    ("BiCarb Cal 0", Column::Step("bicarb.zero", "m44")),
    ("BiCarb Cal 2", Column::Step("bicarb.ul2", "m44")),
    ("BiCarb Cal 4", Column::Step("bicarb.ul4", "m44")),
    ("BiCarb Cal 6", Column::Step("bicarb.ul6", "m44")),
];

pub(super) fn is_module1_header(row: &[String]) -> bool {
    row.len() == COLUMNS.len() && row.iter().zip(&COLUMNS).all(|(f, (name, _))| f == name)
}

pub(super) fn module1_header() -> String {
    COLUMNS.map(|(name, _)| name).join(",")
}

fn invalid(message: impl Into<String>) -> AnalysisError {
    AnalysisError::Invalid(message.into())
}

/// The values of a legacy module 1 file whose header `rows[0]` is already checked, with a
/// note for each column left out. Legacy reads only the first row after the header, and an
/// empty field or `undef` (what legacy shows for a reading it could not take) holds nothing.
pub(super) fn module1_values(
    template_id: &str,
    rows: &[Vec<String>],
) -> Result<(Vec<Carried>, Vec<String>), AnalysisError> {
    let Some(data) = rows.get(1) else {
        return Err(invalid("The file holds no calibrations"));
    };
    if data.len() == 9 {
        return Err(invalid(
            "This is a legacy module 2 calibration file: 9 values under module 1's header. \
             Legacy module 2 saves and loads these wrongly (B20), so it is not loaded; \
             module 2 sessions load calibration files exported here",
        ));
    }
    if data.len() != COLUMNS.len() {
        return Err(invalid(format!(
            "Row 2 has {} fields; a legacy module 1 calibration file has {}",
            data.len(),
            COLUMNS.len()
        )));
    }
    if template_id != MODULE1_TEMPLATE {
        return Err(invalid(format!(
            "A legacy module 1 calibration file loads only into a session of template {MODULE1_TEMPLATE}; this session uses {template_id}"
        )));
    }
    let mut notes = Vec::new();
    if rows.len() > 2 {
        notes.push(format!(
            "Rows 3 to {} not loaded; legacy reads only the first row after the header",
            rows.len()
        ));
    }
    let values: Vec<Option<f64>> = data
        .iter()
        .zip(&COLUMNS)
        .map(|(text, (name, _))| match text.as_str() {
            "" | "undef" => {
                notes.push(format!("{name} holds no value; not loaded"));
                None
            }
            text => {
                let value = text.parse::<f64>().ok().filter(|v| v.is_finite());
                if value.is_none() {
                    notes.push(format!("{name} holds {text:?}, not a number; not loaded"));
                }
                value
            }
        })
        .collect();
    let record = RecordId::new(0);
    let mut carried = Vec::new();
    for ((name, column), value) in COLUMNS.iter().zip(&values) {
        let Some(value) = *value else { continue };
        let entry = |parameter: &str| Carried::Entry {
            parameter: parameter.into(),
            value,
            record: record.clone(),
        };
        match column {
            Column::Entry(parameter) => carried.push(entry(parameter)),
            Column::Step(step, reading) => carried.push(Carried::Step {
                step: (*step).into(),
                values: [((*reading).to_string(), value)].into_iter().collect(),
                record: record.clone(),
            }),
            Column::Computed {
                parameter,
                from,
                needs,
            } => {
                let computable = needs.iter().all(|(group, least)| {
                    group.iter().filter(|i| values[**i].is_some()).count() >= *least
                });
                if computable {
                    notes.push(format!(
                        "{name} {value} not loaded; the session computes it from {from}"
                    ));
                } else {
                    carried.push(entry(parameter));
                }
            }
        }
    }
    Ok((carried, notes))
}
