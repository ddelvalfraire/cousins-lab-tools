//! What each source records: its stored columns and the clocks among them.
//!
//! Adapters, importers and template validation all read these tables, so a column a template
//! may reference is exactly a column some reader writes.

use crate::contract::{Clock, ClockKind, Column, ColumnType};

pub const FULL_SCALE_COUNTS: i64 = 234_800_968;

/// Range factor per EZView channel 1..=12. The legacy reader sets ch9 and ch10 to NaN, so they
/// have no value.
pub const CHANNEL_RANGES: [Option<f64>; 12] = [
    Some(0.2),
    Some(20.0),
    Some(20.0),
    Some(0.1),
    Some(1.0),
    Some(1.0),
    Some(1.0),
    Some(1.0),
    None,
    None,
    Some(1.0),
    Some(1.0),
];

pub fn spool_columns() -> Vec<Column> {
    use ColumnType::*;
    let mut columns = vec![
        Column::new("seq", Int64, "", "Frame number within this capture"),
        Column::new(
            "t_host_utc",
            TimestampUtc,
            "",
            "When the engine decoded the frame (host clock)",
        ),
        Column::new(
            "t_source_local",
            TimestampLocal,
            "",
            "Timestamp EZView wrote on the frame's first line",
        ),
        Column::new(
            "t_legacy_ms",
            Int64,
            "ms",
            "Legacy time: frame timestamp minus engine start, as readEZView.py:76",
        ),
        Column::new("gain", String, "", "Gain field, dropped by the legacy CSV"),
    ];
    for (i, range) in CHANNEL_RANGES.iter().enumerate() {
        let description = match range {
            Some(r) => format!("count / {FULL_SCALE_COUNTS} x {r:?}"),
            None => "Not decoded by legacy".to_string(),
        };
        columns.push(Column::new(
            &format!("ch{}", i + 1),
            Float64,
            "legacy scaled units (unverified; viewer labels mV)",
            &description,
        ));
    }
    for ch in 1..=12 {
        columns.push(Column::new(
            &format!("ch{ch}_counts"),
            Int64,
            "counts",
            "Raw word with first hex digit zeroed",
        ));
    }
    columns
}

pub fn spool_clocks() -> Vec<Clock> {
    vec![
        Clock::new(
            "t_source_local",
            ClockKind::SourceLocal,
            1.0,
            "EZView frame timestamp; which PC clock writes it is unverified",
        ),
        Clock::new(
            "t_host_utc",
            ClockKind::HostUtc,
            1.0,
            "Engine receipt time; includes spool write and poll delay",
        ),
    ]
}

pub fn ambit_columns() -> Vec<Column> {
    use ColumnType::*;
    vec![
        Column::new("seq", Int64, "", "Row number within this capture"),
        Column::new(
            "t_host_utc",
            TimestampUtc,
            "",
            "When the engine received the row (host clock)",
        ),
        Column::new(
            "t_device_ms",
            Int64,
            "ms",
            "Ambit T counter, from the device",
        ),
        Column::new("S", Int64, "counts", "Measuring signal"),
        Column::new("R", Int64, "counts", "Reference signal"),
        Column::new("F", Int64, "counts", "Meaning not documented"),
        Column::new("B", Int64, "counts", "Meaning not documented"),
        Column::new(
            "ACT",
            Int64,
            "0-255 setting",
            "Ambit actinic level commanded by the host",
        ),
        Column::new(
            "Blue",
            Int64,
            "DAC setting",
            "External blue LED level commanded by the host",
        ),
        Column::new(
            "Red",
            Int64,
            "DAC setting",
            "External red LED level commanded by the host",
        ),
    ]
}

pub fn ambit_clocks() -> Vec<Clock> {
    vec![
        Clock::new(
            "t_device_ms",
            ClockKind::DeviceRelative,
            0.001,
            "Ambit counter from run start; runs short of host time in both recordings",
        ),
        Clock::new("t_host_utc", ClockKind::HostUtc, 1.0, "Engine receipt time"),
    ]
}

/// An imported Ambit CSV keeps a null `t_host_utc` column but declares only the device clock,
/// which is why clock alignment refuses imports.
pub fn ambit_import_clocks() -> Vec<Clock> {
    vec![Clock::new(
        "t_device_ms",
        ClockKind::DeviceRelative,
        0.001,
        "Ambit counter from run start; the CSV records no clock time",
    )]
}

pub fn ms_import_columns() -> Vec<Column> {
    use ColumnType::*;
    vec![
        Column::new("seq", Int64, "", "Row number within the sheet's data"),
        Column::new(
            "t_elapsed_s",
            Float64,
            "s",
            "Workbook Time column: seconds since that acquisition started",
        ),
        Column::new(
            "m32",
            Float64,
            "legacy units (unverified)",
            "Mass 32; constant -404.404 in this file",
        ),
        Column::new(
            "m44",
            Float64,
            "mV per workbook calibration",
            "Mass 44 (CO2)",
        ),
        Column::new("m45", Float64, "legacy units (unverified)", "Mass 45"),
    ]
}

pub fn ms_import_clocks() -> Vec<Clock> {
    vec![Clock::new(
        "t_elapsed_s",
        ClockKind::Elapsed,
        1.0,
        "Seconds since the MS acquisition started; no clock time recorded",
    )]
}

/// Columns a live adapter writes, keyed by the profile's `adapter`.
pub fn adapter_columns(adapter: &str) -> Option<Vec<Column>> {
    match adapter {
        "ezview_spool" => Some(spool_columns()),
        "ambit_replay" => Some(ambit_columns()),
        _ => None,
    }
}

/// Columns an importer writes, keyed by the template role's `import`.
pub fn import_columns(importer: &str) -> Option<Vec<Column>> {
    match importer {
        "ms_workbook" => Some(ms_import_columns()),
        "ambit_csv" => Some(ambit_columns()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spool_records_five_fields_and_two_words_per_channel() {
        let columns = spool_columns();
        assert_eq!(columns.len(), 5 + 12 + 12);
        assert_eq!(columns[5].description, "count / 234800968 x 0.2");
        assert_eq!(columns[6].description, "count / 234800968 x 20.0");
        assert_eq!(columns[13].description, "Not decoded by legacy");
        assert_eq!(columns.last().unwrap().name, "ch12_counts");
    }

    #[test]
    fn every_clock_names_a_column_its_source_records() {
        for (columns, clocks) in [
            (spool_columns(), spool_clocks()),
            (ambit_columns(), ambit_clocks()),
            (ambit_columns(), ambit_import_clocks()),
            (ms_import_columns(), ms_import_clocks()),
        ] {
            for clock in clocks {
                assert!(
                    columns.iter().any(|c| c.name == clock.column),
                    "{}",
                    clock.column
                );
            }
        }
    }

    #[test]
    fn unknown_adapters_and_importers_have_no_columns() {
        assert!(adapter_columns("ambit_serial").is_none());
        assert!(import_columns("ambit_csv").is_some());
    }
}
