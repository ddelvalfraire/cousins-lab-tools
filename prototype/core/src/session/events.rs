//! Capture events and operator markers, stored as segments with one fixed set of columns.

use crate::contract::{Cell, Column, ColumnType, Event, Row};

pub fn event_columns() -> Vec<Column> {
    use ColumnType::*;
    vec![
        Column::new("seq", Int64, "", ""),
        Column::new("kind", String, "", ""),
        Column::new("label", String, "", ""),
        Column::new(
            "t_host_utc",
            TimestampUtc,
            "",
            "Host clock when the event was recorded",
        ),
        Column::new(
            "clock",
            String,
            "",
            "Native clock column t_native is measured on",
        ),
        Column::new(
            "t_native",
            Float64,
            "s",
            "Event time on the capture's native clock, in seconds",
        ),
        Column::new("value", Float64, "", ""),
        Column::new("payload_json", String, "", ""),
    ]
}

/// A row for `event_columns()`. An empty payload is stored as null.
pub fn event_row(seq: i64, event: &Event) -> Row {
    let float = |v: Option<f64>| v.map_or(Cell::Null, Cell::Float);
    vec![
        Cell::Int(seq),
        Cell::Str(event.kind.clone()),
        Cell::Str(event.label.clone()),
        event.t_host_utc.map_or(Cell::Null, Cell::TimeUtc),
        event.clock.clone().map_or(Cell::Null, Cell::Str),
        float(event.t_native),
        float(event.value),
        if event.payload.is_empty() {
            Cell::Null
        } else {
            Cell::Str(serde_json::Value::Object(event.payload.clone()).to_string())
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::SegmentWriter;
    use chrono::{TimeZone, Utc};
    use serde_json::json;
    use std::time::Duration;

    #[test]
    fn event_rows_follow_the_event_columns() {
        let host = Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap();
        let flash = Event {
            kind: "flash".into(),
            label: "Flash 1".into(),
            t_host_utc: Some(host),
            clock: Some("t_device_ms".into()),
            t_native: Some(12.5),
            value: Some(3000.0),
            payload: json!({"n": 1}).as_object().unwrap().clone(),
        };
        assert_eq!(
            event_row(3, &flash),
            vec![
                Cell::Int(3),
                Cell::Str("flash".into()),
                Cell::Str("Flash 1".into()),
                Cell::TimeUtc(host),
                Cell::Str("t_device_ms".into()),
                Cell::Float(12.5),
                Cell::Float(3000.0),
                Cell::Str(r#"{"n":1}"#.into()),
            ]
        );
        let dir = tempfile::tempdir().unwrap();
        let mut writer =
            SegmentWriter::new(dir.path(), &event_columns(), 10, Duration::ZERO).unwrap();
        writer.append(vec![event_row(0, &flash)]).unwrap();
        assert_eq!(writer.rows_written(), 1);
    }

    #[test]
    fn missing_event_fields_and_an_empty_payload_are_null() {
        let marker = Event {
            kind: "needle_out".into(),
            label: "Needle out".into(),
            t_host_utc: None,
            clock: None,
            t_native: None,
            value: None,
            payload: Default::default(),
        };
        let row = event_row(0, &marker);
        assert!(row[3..].iter().all(|c| *c == Cell::Null), "{row:?}");
    }

    #[test]
    fn event_columns_match_the_python_table() {
        let columns = event_columns();
        let names: Vec<&str> = columns.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "seq",
                "kind",
                "label",
                "t_host_utc",
                "clock",
                "t_native",
                "value",
                "payload_json"
            ]
        );
        assert_eq!(columns[5].unit, "s");
        assert_eq!(columns[3].ty, ColumnType::TimestampUtc);
    }
}
