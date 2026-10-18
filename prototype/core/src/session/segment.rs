//! Parquet segments: buffered rows written as `part-NNNNN.parquet`, one row group each.

use std::collections::HashMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use arrow::array::{
    Array, ArrayRef, AsArray, Float64Array, Int64Array, StringArray, TimestampMicrosecondArray,
};
use arrow::datatypes::{
    DataType, Field, Float64Type, Int64Type, Schema, SchemaRef, TimeUnit, TimestampMicrosecondType,
};
use arrow::record_batch::RecordBatch;
use chrono::DateTime;
use parquet::arrow::ArrowWriter;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::basic::Compression;
use parquet::file::properties::WriterProperties;
use parquet::file::reader::{FileReader, SerializedFileReader};

use super::SessionError;
use crate::contract::{Cell, Column, ColumnType, Row};

pub const FLUSH_ROWS: usize = 2000;
pub const FLUSH_EVERY: Duration = Duration::from_secs(2);

/// Every field carries `unit` and `description` metadata, empty when the column has none.
pub fn arrow_schema(columns: &[Column]) -> Schema {
    let fields: Vec<Field> = columns
        .iter()
        .map(|c| {
            let ty = match c.ty {
                ColumnType::Int64 => DataType::Int64,
                ColumnType::Float64 => DataType::Float64,
                ColumnType::String => DataType::Utf8,
                ColumnType::TimestampUtc => {
                    DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into()))
                }
                ColumnType::TimestampLocal => DataType::Timestamp(TimeUnit::Microsecond, None),
            };
            Field::new(&c.name, ty, true).with_metadata(HashMap::from([
                ("unit".to_string(), c.unit.clone()),
                ("description".to_string(), c.description.clone()),
            ]))
        })
        .collect();
    Schema::new(fields)
}

/// Rows in one finished segment, read from its footer.
pub fn segment_rows(path: &Path) -> Result<u64, SessionError> {
    let reader = SerializedFileReader::new(File::open(path)?)?;
    Ok(reader.metadata().file_metadata().num_rows() as u64)
}

/// The rows of one finished segment as cells in the order of `columns`. A value of a type
/// other than its column's, or a column the part lacks, reads as null.
pub fn read_segment(path: &Path, columns: &[Column]) -> Result<Vec<Row>, SessionError> {
    let reader = ParquetRecordBatchReaderBuilder::try_new(File::open(path)?)?.build()?;
    let mut rows = Vec::new();
    for batch in reader {
        let batch = batch?;
        let arrays: Vec<Option<&ArrayRef>> = columns
            .iter()
            .map(|c| batch.column_by_name(&c.name))
            .collect();
        for i in 0..batch.num_rows() {
            let row = columns
                .iter()
                .zip(&arrays)
                .map(|(c, array)| array.map_or(Cell::Null, |a| cell(c.ty, a, i)))
                .collect();
            rows.push(row);
        }
    }
    Ok(rows)
}

fn cell(ty: ColumnType, array: &ArrayRef, i: usize) -> Cell {
    if array.is_null(i) {
        return Cell::Null;
    }
    let micros = || {
        array
            .as_primitive_opt::<TimestampMicrosecondType>()
            .and_then(|a| DateTime::from_timestamp_micros(a.value(i)))
    };
    let cell = match ty {
        ColumnType::Int64 => array
            .as_primitive_opt::<Int64Type>()
            .map(|a| Cell::Int(a.value(i))),
        ColumnType::Float64 => array
            .as_primitive_opt::<Float64Type>()
            .map(|a| Cell::Float(a.value(i))),
        ColumnType::String => array
            .as_string_opt::<i32>()
            .map(|a| Cell::Str(a.value(i).to_string())),
        ColumnType::TimestampUtc => micros().map(Cell::TimeUtc),
        ColumnType::TimestampLocal => micros().map(|t| Cell::TimeLocal(t.naive_utc())),
    };
    cell.unwrap_or(Cell::Null)
}

/// Finished segments in `dir`, in part order. A missing directory has none.
pub fn segments(dir: &Path) -> Result<Vec<PathBuf>, SessionError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut parts = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with("part-") && name.ends_with(".parquet") {
            parts.push(path);
        }
    }
    parts.sort();
    Ok(parts)
}

/// Buffers rows for one directory and writes them as numbered Parquet parts. One thread owns
/// each writer.
pub struct SegmentWriter {
    dir: PathBuf,
    columns: Vec<Column>,
    schema: SchemaRef,
    flush_rows: usize,
    flush_every: Duration,
    rows: Vec<Row>,
    part: usize,
    last_flush: Instant,
    rows_written: u64,
}

impl SegmentWriter {
    /// Numbering continues after the parts already in `dir`, so a reopened capture appends.
    pub fn new(
        dir: &Path,
        columns: &[Column],
        flush_rows: usize,
        flush_every: Duration,
    ) -> Result<Self, SessionError> {
        fs::create_dir_all(dir)?;
        Ok(SegmentWriter {
            dir: dir.to_path_buf(),
            columns: columns.to_vec(),
            schema: Arc::new(arrow_schema(columns)),
            flush_rows,
            flush_every,
            rows: Vec::new(),
            part: segments(dir)?.len(),
            last_flush: Instant::now(),
            rows_written: 0,
        })
    }

    pub fn rows_written(&self) -> u64 {
        self.rows_written
    }

    /// Buffers `rows`, then flushes once `flush_rows` are buffered or `flush_every` has passed
    /// since the last flush. A row that does not fit the columns rejects the whole call.
    pub fn append(&mut self, rows: Vec<Row>) -> Result<(), SessionError> {
        for row in &rows {
            check_row(&self.columns, row)?;
        }
        self.rows.extend(rows);
        if self.rows.len() >= self.flush_rows || self.last_flush.elapsed() >= self.flush_every {
            self.flush()?;
        }
        Ok(())
    }

    /// Writes every buffered row as the next part. Rows stay buffered if the write fails.
    pub fn flush(&mut self) -> Result<(), SessionError> {
        self.last_flush = Instant::now();
        if self.rows.is_empty() {
            return Ok(());
        }
        let target = self.dir.join(format!("part-{:05}.parquet", self.part));
        let tmp = target.with_extension("parquet.tmp");
        let batch = record_batch(&self.schema, &self.columns, &self.rows)?;
        let props = WriterProperties::builder()
            .set_compression(Compression::SNAPPY)
            .build();
        let mut writer =
            ArrowWriter::try_new(File::create(&tmp)?, self.schema.clone(), Some(props))?;
        writer.write(&batch)?;
        writer.close()?;
        fs::rename(&tmp, &target)?;
        self.part += 1;
        self.rows_written += self.rows.len() as u64;
        self.rows.clear();
        Ok(())
    }
}

fn check_row(columns: &[Column], row: &Row) -> Result<(), SessionError> {
    if row.len() != columns.len() {
        return Err(SessionError::BadRow(format!(
            "row has {} cells for {} columns",
            row.len(),
            columns.len()
        )));
    }
    for (column, cell) in columns.iter().zip(row) {
        let fits = matches!(
            (column.ty, cell),
            (_, Cell::Null)
                | (ColumnType::Int64, Cell::Int(_))
                | (ColumnType::Float64, Cell::Float(_))
                | (ColumnType::String, Cell::Str(_))
                | (ColumnType::TimestampUtc, Cell::TimeUtc(_))
                | (ColumnType::TimestampLocal, Cell::TimeLocal(_))
        );
        if !fits {
            return Err(SessionError::BadRow(format!(
                "column {} is {:?} but got {cell:?}",
                column.name, column.ty
            )));
        }
    }
    Ok(())
}

/// Rows have passed `check_row`, so a cell of another kind than its column can only be null.
fn record_batch(
    schema: &SchemaRef,
    columns: &[Column],
    rows: &[Row],
) -> Result<RecordBatch, SessionError> {
    let arrays = columns
        .iter()
        .enumerate()
        .map(|(i, column)| -> ArrayRef {
            let cells = rows.iter().map(|row| &row[i]);
            match column.ty {
                ColumnType::Int64 => Arc::new(Int64Array::from_iter(cells.map(|c| match c {
                    Cell::Int(v) => Some(*v),
                    _ => None,
                }))),
                ColumnType::Float64 => Arc::new(Float64Array::from_iter(cells.map(|c| match c {
                    Cell::Float(v) => Some(*v),
                    _ => None,
                }))),
                ColumnType::String => Arc::new(StringArray::from_iter(cells.map(|c| match c {
                    Cell::Str(s) => Some(s.as_str()),
                    _ => None,
                }))),
                ColumnType::TimestampUtc => Arc::new(
                    TimestampMicrosecondArray::from_iter(cells.map(|c| match c {
                        Cell::TimeUtc(t) => Some(t.timestamp_micros()),
                        _ => None,
                    }))
                    .with_timezone("UTC"),
                ),
                ColumnType::TimestampLocal => Arc::new(TimestampMicrosecondArray::from_iter(
                    cells.map(|c| match c {
                        Cell::TimeLocal(t) => Some(t.and_utc().timestamp_micros()),
                        _ => None,
                    }),
                )),
            }
        })
        .collect();
    Ok(RecordBatch::try_new(schema.clone(), arrays)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow::array::{Array, AsArray};
    use arrow::datatypes::{Float64Type, Int64Type, TimestampMicrosecondType};
    use chrono::{NaiveDate, TimeZone, Utc};
    use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

    fn columns() -> Vec<Column> {
        vec![
            Column::new("seq", ColumnType::Int64, "", ""),
            Column::new("value", ColumnType::Float64, "mV", "Probe voltage"),
        ]
    }

    fn rows(range: std::ops::Range<i64>) -> Vec<Row> {
        range
            .map(|i| vec![Cell::Int(i), Cell::Float(i as f64 / 10.0)])
            .collect()
    }

    fn read(path: &Path) -> RecordBatch {
        let mut reader = ParquetRecordBatchReaderBuilder::try_new(File::open(path).unwrap())
            .unwrap()
            .build()
            .unwrap();
        reader.next().unwrap().unwrap()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn appends_flush_every_buffered_row_once_the_threshold_is_reached() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer =
            SegmentWriter::new(dir.path(), &columns(), 10, Duration::from_secs(3600)).unwrap();
        writer.append(rows(0..9)).unwrap();
        assert!(names(dir.path()).is_empty());
        writer.append(rows(9..25)).unwrap();
        writer.append(rows(25..28)).unwrap();
        assert_eq!(names(dir.path()), ["part-00000.parquet"]);
        assert_eq!(
            segment_rows(&dir.path().join("part-00000.parquet")).unwrap(),
            25
        );
        assert_eq!(writer.rows_written(), 25);
        writer.flush().unwrap();
        assert_eq!(
            names(dir.path()),
            ["part-00000.parquet", "part-00001.parquet"]
        );
        assert_eq!(writer.rows_written(), 28);
    }

    #[test]
    fn a_zero_interval_writes_a_part_per_append() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer =
            SegmentWriter::new(dir.path(), &columns(), FLUSH_ROWS, Duration::ZERO).unwrap();
        writer.append(rows(0..1)).unwrap();
        writer.append(rows(1..2)).unwrap();
        assert_eq!(
            names(dir.path()),
            ["part-00000.parquet", "part-00001.parquet"]
        );
    }

    #[test]
    fn a_writer_without_rows_writes_no_file() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = SegmentWriter::new(dir.path(), &columns(), 10, Duration::ZERO).unwrap();
        writer.append(Vec::new()).unwrap();
        writer.flush().unwrap();
        assert!(names(dir.path()).is_empty());
    }

    #[test]
    fn a_reopened_directory_continues_part_numbering() {
        let dir = tempfile::tempdir().unwrap();
        for _ in 0..2 {
            let mut writer =
                SegmentWriter::new(dir.path(), &columns(), 10, Duration::ZERO).unwrap();
            writer.append(rows(0..3)).unwrap();
        }
        fs::write(dir.path().join("part-00002.parquet.tmp"), b"PAR1").unwrap();
        let mut writer = SegmentWriter::new(dir.path(), &columns(), 10, Duration::ZERO).unwrap();
        writer.append(rows(0..3)).unwrap();
        assert_eq!(
            names(dir.path()),
            [
                "part-00000.parquet",
                "part-00001.parquet",
                "part-00002.parquet"
            ]
        );
        assert_eq!(segments(dir.path()).unwrap().len(), 3);
    }

    #[test]
    fn rows_that_do_not_fit_the_columns_are_rejected_before_buffering() {
        let dir = tempfile::tempdir().unwrap();
        let mut writer = SegmentWriter::new(dir.path(), &columns(), 10, Duration::ZERO).unwrap();
        let wrong_type = vec![vec![Cell::Int(1), Cell::Str("1.5".into())]];
        let error = writer.append(wrong_type).unwrap_err().to_string();
        assert!(error.contains("column value is Float64"), "{error}");
        assert!(writer.append(vec![vec![Cell::Int(1)]]).is_err());
        writer.flush().unwrap();
        assert!(names(dir.path()).is_empty());
    }

    #[test]
    fn segments_keep_arrow_types_nulls_and_field_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let columns = vec![
            Column::new("seq", ColumnType::Int64, "", ""),
            Column::new(
                "t_native",
                ColumnType::Float64,
                "s",
                "Seconds on the device clock",
            ),
            Column::new("label", ColumnType::String, "", ""),
            Column::new("t_host_utc", ColumnType::TimestampUtc, "", "Host clock"),
            Column::new("t_local", ColumnType::TimestampLocal, "", ""),
        ];
        let host = Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap()
            + chrono::Duration::microseconds(316_483);
        let local = NaiveDate::from_ymd_opt(2026, 10, 16)
            .unwrap()
            .and_hms_micro_opt(15, 9, 52, 1)
            .unwrap();
        let full = vec![
            Cell::Int(7),
            Cell::Float(12.5),
            Cell::Str("Flash 1".into()),
            Cell::TimeUtc(host),
            Cell::TimeLocal(local),
        ];
        let mut writer = SegmentWriter::new(dir.path(), &columns, 10, Duration::ZERO).unwrap();
        writer.append(vec![full, vec![Cell::Null; 5]]).unwrap();

        let batch = read(&dir.path().join("part-00000.parquet"));
        let schema = batch.schema();
        let types: Vec<&DataType> = schema.fields().iter().map(|f| f.data_type()).collect();
        assert_eq!(
            types,
            [
                &DataType::Int64,
                &DataType::Float64,
                &DataType::Utf8,
                &DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into())),
                &DataType::Timestamp(TimeUnit::Microsecond, None),
            ]
        );
        let t_native = schema.field(1).metadata();
        assert_eq!(t_native["unit"], "s");
        assert_eq!(t_native["description"], "Seconds on the device clock");
        assert_eq!(schema.field(0).metadata()["unit"], "");
        assert_eq!(schema.field(0).metadata()["description"], "");

        assert_eq!(batch.column(0).as_primitive::<Int64Type>().value(0), 7);
        assert_eq!(batch.column(1).as_primitive::<Float64Type>().value(0), 12.5);
        assert_eq!(batch.column(2).as_string::<i32>().value(0), "Flash 1");
        assert_eq!(
            batch
                .column(3)
                .as_primitive::<TimestampMicrosecondType>()
                .value(0),
            host.timestamp_micros()
        );
        assert_eq!(
            batch
                .column(4)
                .as_primitive::<TimestampMicrosecondType>()
                .value(0),
            local.and_utc().timestamp_micros()
        );
        for column in batch.columns() {
            assert!(column.is_null(1));
        }
    }

    /// Spool rows as the EZView adapter produces them: 29 cells, ch9 and ch10 null.
    fn spool_rows(n: i64) -> Vec<Row> {
        let start = Utc.with_ymd_and_hms(2026, 10, 16, 22, 0, 0).unwrap();
        (0..n)
            .map(|i| {
                let t = start + chrono::Duration::milliseconds(500 * i);
                let mut row = vec![
                    Cell::Int(i),
                    Cell::TimeUtc(t),
                    Cell::TimeLocal(t.naive_utc()),
                    Cell::Int(500 * i),
                    Cell::Str("000".into()),
                ];
                for ch in 1..=12 {
                    row.push(if ch == 9 || ch == 10 {
                        Cell::Null
                    } else {
                        Cell::Float(ch as f64 + i as f64 / 1000.0)
                    });
                }
                row.extend((1..=12).map(|ch| Cell::Int(1_000_000 * ch + i)));
                row
            })
            .collect()
    }

    /// Run with `cargo test --release -- --ignored --nocapture`. pyarrow 26 took a median of 26
    /// to 64 ms for the same 2000 rows on the machine the port was measured on.
    #[test]
    #[ignore]
    fn time_to_append_and_flush_2000_spool_rows() {
        let columns = crate::schemas::spool_columns();
        let dir = tempfile::tempdir().unwrap();
        let mut times = Vec::new();
        for run in 0..50 {
            let rows = spool_rows(2000);
            let part_dir = dir.path().join(run.to_string());
            let mut writer =
                SegmentWriter::new(&part_dir, &columns, FLUSH_ROWS, FLUSH_EVERY).unwrap();
            let started = Instant::now();
            writer.append(rows).unwrap();
            times.push(started.elapsed());
            assert_eq!(writer.rows_written(), 2000);
        }
        times.sort();
        println!(
            "append+flush 2000 spool rows: median {:?}, min {:?}, max {:?}",
            times[times.len() / 2],
            times[0],
            times[times.len() - 1]
        );
    }
}
