//! Reads the researcher's mass-spec workbook (`Raw data-mass spec.xlsx`).
//!
//! Sheet `RawDataAcquisition67Data` holds `Time, Mass 32, Mass 44, Mass 45` every 0.5 s.
//! Time is seconds from the start of that acquisition; the sheet records no clock time.
//! Which program produced the 0.5 s series is unknown. Formula cells are read through the
//! values Excel cached when the file was saved.

use std::path::Path;

use calamine::{Data, Range, Reader, Xlsx, XlsxError, open_workbook};

use crate::contract::{Cell, InstrumentError, Row};
use crate::pycompat::{float_repr, os_error, str_repr, strip};

pub const RAW_SHEET: &str = "RawDataAcquisition67Data";
pub const RAW_HEADER: [&str; 4] = ["Time", "Mass 32", "Mass 44", "Mass 45"];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MassSpecSeries {
    pub t_elapsed_s: Vec<f64>,
    pub m32: Vec<f64>,
    pub m44: Vec<f64>,
    pub m45: Vec<f64>,
}

impl MassSpecSeries {
    /// The series as stored rows, in the order of [`crate::schemas::ms_import_columns`].
    pub fn rows(&self) -> Vec<Row> {
        (0..self.t_elapsed_s.len())
            .map(|i| {
                vec![
                    Cell::Int(i as i64),
                    Cell::Float(self.t_elapsed_s[i]),
                    Cell::Float(self.m32[i]),
                    Cell::Float(self.m44[i]),
                    Cell::Float(self.m45[i]),
                ]
            })
            .collect()
    }
}

/// Columns A..D below the header, up to the first row whose A cell is empty.
pub fn read_raw_sheet(path: &Path, sheet: &str) -> Result<MassSpecSeries, InstrumentError> {
    let range = worksheet(path, sheet)?;
    let header: Vec<Option<&Data>> = (0..4).map(|col| cell(&range, 0, col)).collect();
    if header
        .iter()
        .zip(RAW_HEADER)
        .any(|(cell, name)| !matches!(cell, Some(Data::String(s)) if s == name))
    {
        let found = header.iter().map(|c| py_repr(*c)).collect::<Vec<_>>();
        let expected = RAW_HEADER.map(str_repr);
        return Err(InstrumentError::new(
            "ValueError",
            format!(
                "{sheet} header is ({}), expected ({})",
                found.join(", "),
                expected.join(", ")
            ),
        ));
    }
    let mut series = MassSpecSeries::default();
    for row in 1.. {
        if cell(&range, row, 0).is_none() {
            break;
        }
        series.t_elapsed_s.push(float(cell(&range, row, 0))?);
        series.m32.push(float(cell(&range, row, 1))?);
        series.m44.push(float(cell(&range, row, 2))?);
        series.m45.push(float(cell(&range, row, 3))?);
    }
    Ok(series)
}

/// `(T(s), ubar CO2)` pairs from a researcher's per-sample sheet such as `150-pl1`: columns A
/// and E from row 2 up to the first empty A cell.
pub fn read_sample_sheet(path: &Path, sheet: &str) -> Result<Vec<(f64, f64)>, InstrumentError> {
    let range = worksheet(path, sheet)?;
    let mut pairs = Vec::new();
    for row in 1.. {
        let Some(t) = cell(&range, row, 0) else {
            break;
        };
        pairs.push((float(Some(t))?, float(cell(&range, row, 4))?));
    }
    Ok(pairs)
}

fn worksheet(path: &Path, sheet: &str) -> Result<Range<Data>, InstrumentError> {
    let error = |e: XlsxError| match e {
        XlsxError::Io(io) => os_error(&io, path),
        XlsxError::WorksheetNotFound(_) => InstrumentError::new(
            "KeyError",
            str_repr(&format!("Worksheet {sheet} does not exist.")),
        ),
        other => InstrumentError::new("ValueError", other.to_string()),
    };
    let mut workbook: Xlsx<_> = open_workbook(path).map_err(error)?;
    workbook.worksheet_range(sheet).map_err(error)
}

/// The cell at a zero-based row and column of the sheet, `None` where openpyxl gives `None`.
fn cell(range: &Range<Data>, row: u32, col: u32) -> Option<&Data> {
    range
        .get_value((row, col))
        .filter(|data| !matches!(data, Data::Empty))
}

/// `float(value)` on what openpyxl returns for the cell.
fn float(data: Option<&Data>) -> Result<f64, InstrumentError> {
    let type_error = |name: &str| {
        InstrumentError::new(
            "TypeError",
            format!("float() argument must be a string or a real number, not '{name}'"),
        )
    };
    match data {
        None => Err(type_error("NoneType")),
        Some(Data::Float(v)) => Ok(*v),
        Some(Data::Int(v)) => Ok(*v as f64),
        Some(Data::Bool(v)) => Ok(f64::from(u8::from(*v))),
        Some(Data::String(s)) => parse_float(s),
        Some(Data::DateTime(_) | Data::DateTimeIso(_)) => Err(type_error("datetime.datetime")),
        Some(Data::DurationIso(_)) => Err(type_error("datetime.timedelta")),
        Some(Data::Error(e)) => parse_float(&e.to_string()),
        Some(Data::Empty) => unreachable!("cell() maps empty cells to None"),
    }
}

fn parse_float(text: &str) -> Result<f64, InstrumentError> {
    strip(text).parse().map_err(|_| {
        InstrumentError::new(
            "ValueError",
            format!("could not convert string to float: {}", str_repr(text)),
        )
    })
}

fn py_repr(data: Option<&Data>) -> String {
    match data {
        None => "None".into(),
        Some(Data::String(s)) => str_repr(s),
        Some(Data::Float(v)) if v.fract() == 0.0 && v.abs() < 1e15 => format!("{v:.0}"),
        Some(Data::Float(v)) => float_repr(*v),
        Some(Data::Int(v)) => v.to_string(),
        Some(Data::Bool(v)) => (if *v { "True" } else { "False" }).into(),
        Some(other) => str_repr(&other.to_string()),
    }
}
