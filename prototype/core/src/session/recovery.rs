//! Startup recovery for sessions a crash or kill left unfinished.

use std::fs;
use std::path::Path;

use super::{CaptureStatus, SessionError, SessionStatus, SessionStore, segment_rows, segments};

impl SessionStore {
    /// Marks every unfinished session and its unfinished captures `interrupted`, deletes
    /// half-written segments, and recounts each capture's rows from the segments that survived.
    /// Sessions are never resumed. Returns the ids it marked, newest first.
    pub fn mark_interrupted(&self) -> Result<Vec<String>, SessionError> {
        let mut found = Vec::new();
        for mut manifest in self.list()? {
            if manifest.status.is_finished() {
                continue;
            }
            manifest.status = SessionStatus::Interrupted;
            remove_tmp_segments(&self.path(&manifest.id))?;
            for (capture_id, capture) in manifest.captures.iter_mut() {
                if !capture.status.is_finished() {
                    capture.status = CaptureStatus::Interrupted;
                }
                let samples = self.capture_dir(&manifest.id, capture_id).join("samples");
                capture.rows = segments(&samples)?
                    .iter()
                    .map(|part| segment_rows(part))
                    .sum::<Result<u64, _>>()?;
            }
            self.save(&manifest)?;
            found.push(manifest.id);
        }
        Ok(found)
    }
}

fn remove_tmp_segments(dir: &Path) -> Result<(), SessionError> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            remove_tmp_segments(&path)?;
        } else if path.to_string_lossy().ends_with(".parquet.tmp") {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Cell, Column, ColumnType, InputKind};
    use crate::session::{Capture, Manifest, SegmentWriter, SessionKind};
    use arrow::array::AsArray;
    use arrow::datatypes::Int64Type;
    use indexmap::IndexMap;
    use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
    use serde_json::json;
    use std::fs::File;
    use std::time::Duration;

    fn columns() -> Vec<Column> {
        vec![
            Column::new("seq", ColumnType::Int64, "", ""),
            Column::new("value", ColumnType::Float64, "mV", ""),
        ]
    }

    fn live_capture(role: &str, status: CaptureStatus) -> Capture {
        Capture {
            role: role.into(),
            label: role.into(),
            instrument: Some(json!({"id": "probe"})),
            adapter: Some("ambit_replay".into()),
            model: Some("probe".into()),
            input_kind: InputKind::Replay,
            input_note: String::new(),
            sources: Vec::new(),
            capabilities: Some(vec!["acquire".into()]),
            columns: columns(),
            clocks: Vec::new(),
            aliases: IndexMap::new(),
            requested_delay_s: Some(0.0),
            host_delay_s: Some(0.0),
            on_failure: None,
            readiness: None,
            status,
            rows: 0,
            protocol_plan: None,
            start: None,
            ignored_columns: None,
            timing: None,
            requested_start_utc: None,
            start_command_utc: None,
            first_sample_utc: None,
            last_sample_utc: None,
            error: None,
            stopped_utc: None,
        }
    }

    fn rows(range: std::ops::Range<i64>) -> Vec<Vec<Cell>> {
        range
            .map(|i| vec![Cell::Int(i), Cell::Float(i as f64 / 10.0)])
            .collect()
    }

    fn running_session(store: &SessionStore, captures: &[(&str, CaptureStatus)]) -> Manifest {
        let mut manifest = store
            .create(
                "killed run",
                SessionKind::Run,
                json!({"id": "t", "revision": 1}),
            )
            .unwrap();
        manifest.status = SessionStatus::Running;
        for (role, status) in captures {
            manifest
                .captures
                .insert(role.to_string(), live_capture(role, *status));
        }
        store.save(&manifest).unwrap();
        manifest
    }

    fn count_and_max_seq(dir: &Path) -> (usize, i64) {
        let mut seqs = Vec::new();
        for part in segments(dir).unwrap() {
            let reader = ParquetRecordBatchReaderBuilder::try_new(File::open(part).unwrap())
                .unwrap()
                .build()
                .unwrap();
            for batch in reader {
                let batch = batch.unwrap();
                seqs.extend(
                    batch
                        .column(0)
                        .as_primitive::<Int64Type>()
                        .values()
                        .iter()
                        .copied(),
                );
            }
        }
        (seqs.len(), seqs.into_iter().max().unwrap())
    }

    #[test]
    fn running_session_is_marked_interrupted_with_rows_recounted() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let manifest = running_session(&store, &[("ms", CaptureStatus::Running)]);
        let samples = store.capture_dir(&manifest.id, "ms").join("samples");
        let mut writer =
            SegmentWriter::new(&samples, &columns(), 10, Duration::from_secs(3600)).unwrap();
        writer.append(rows(0..25)).unwrap();
        writer.append(rows(25..28)).unwrap();
        fs::write(samples.join("part-00099.parquet.tmp"), b"PAR1 half written").unwrap();

        let reopened = SessionStore::new(data.path()).unwrap();
        assert_eq!(reopened.mark_interrupted().unwrap(), [manifest.id.as_str()]);

        let recovered = store.load(&manifest.id).unwrap();
        assert_eq!(recovered.status, SessionStatus::Interrupted);
        let mut expected = live_capture("ms", CaptureStatus::Interrupted);
        expected.rows = 25;
        assert_eq!(recovered.captures["ms"], expected);
        let leftovers: Vec<_> = fs::read_dir(&samples)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
        assert_eq!(count_and_max_seq(&samples), (25, 24));
        let db = crate::query::SessionDb::open(&store.path(&manifest.id), &recovered).unwrap();
        let seen: (i64, i64) = db
            .connection()
            .query_row(r#"SELECT count(*), max(seq) FROM "cap:ms""#, [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(seen, (25, 24), "DuckDB reads only the finished parts");
    }

    #[test]
    fn finished_sessions_are_left_alone() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let mut manifest = store
            .create("done", SessionKind::Run, json!({"id": "t", "revision": 1}))
            .unwrap();
        manifest.status = SessionStatus::Completed;
        store.save(&manifest).unwrap();
        assert!(
            SessionStore::new(data.path())
                .unwrap()
                .mark_interrupted()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            store.load(&manifest.id).unwrap().status,
            SessionStatus::Completed
        );
    }

    #[test]
    fn captures_that_already_finished_keep_their_status() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let manifest = running_session(
            &store,
            &[
                ("ended", CaptureStatus::SourceEnded),
                ("delayed", CaptureStatus::NotStarted),
                ("broken", CaptureStatus::Failed),
                ("waiting", CaptureStatus::Waiting),
                ("live", CaptureStatus::Running),
            ],
        );
        store.mark_interrupted().unwrap();
        let statuses: Vec<CaptureStatus> = store
            .load(&manifest.id)
            .unwrap()
            .captures
            .values()
            .map(|c| c.status)
            .collect();
        use CaptureStatus::*;
        assert_eq!(
            statuses,
            [SourceEnded, NotStarted, Failed, Interrupted, Interrupted]
        );
    }

    #[test]
    fn recovery_runs_once_and_removes_tmp_segments_outside_samples() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let manifest = running_session(&store, &[("light", CaptureStatus::Starting)]);
        let markers = store.path(&manifest.id).join("markers");
        fs::create_dir_all(&markers).unwrap();
        fs::write(markers.join("part-00000.parquet.tmp"), b"PAR1").unwrap();

        assert_eq!(store.mark_interrupted().unwrap().len(), 1);
        assert!(!markers.join("part-00000.parquet.tmp").exists());
        assert_eq!(store.load(&manifest.id).unwrap().captures["light"].rows, 0);
        assert!(store.mark_interrupted().unwrap().is_empty());
    }
}
