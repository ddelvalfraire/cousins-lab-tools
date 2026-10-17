//! The sessions folder: one directory per session, each with its `session.json`.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde_json::Value;

use super::{Host, Manifest, SessionError, SessionKind, SessionStatus, session_id, utc_now};

const MANIFEST: &str = "session.json";

pub struct SessionStore {
    dir: PathBuf,
}

impl SessionStore {
    pub fn new(data_dir: &Path) -> Result<Self, SessionError> {
        let dir = data_dir.join("sessions");
        fs::create_dir_all(&dir)?;
        Ok(SessionStore { dir })
    }

    pub fn path(&self, session_id: &str) -> PathBuf {
        self.dir.join(session_id)
    }

    pub fn capture_dir(&self, session_id: &str, capture_id: &str) -> PathBuf {
        self.path(session_id).join("captures").join(capture_id)
    }

    /// A new session in `preparing`, saved before it is returned.
    pub fn create(
        &self,
        name: &str,
        kind: SessionKind,
        template: Value,
    ) -> Result<Manifest, SessionError> {
        self.create_at(utc_now(), name, kind, template)
    }

    fn create_at(
        &self,
        created: DateTime<Utc>,
        name: &str,
        kind: SessionKind,
        template: Value,
    ) -> Result<Manifest, SessionError> {
        let manifest = Manifest {
            id: self.claim_id(&session_id(created, name))?,
            name: name.into(),
            kind,
            status: SessionStatus::Preparing,
            created_utc: created,
            host: Host::current(),
            template,
            captures: IndexMap::new(),
            run: None,
            stopped_by: None,
        };
        self.save(&manifest)?;
        Ok(manifest)
    }

    /// Creates the session directory under `base`, or `base-2`, `base-3` and so on when a
    /// session with the same name started in the same second.
    fn claim_id(&self, base: &str) -> Result<String, SessionError> {
        let mut n = 1;
        loop {
            let id = if n == 1 {
                base.to_string()
            } else {
                format!("{base}-{n}")
            };
            match fs::create_dir(self.path(&id)) {
                Ok(()) => return Ok(id),
                Err(e) if e.kind() == ErrorKind::AlreadyExists => n += 1,
                Err(e) => return Err(e.into()),
            }
        }
    }

    pub fn load(&self, session_id: &str) -> Result<Manifest, SessionError> {
        let text = fs::read_to_string(self.path(session_id).join(MANIFEST))?;
        Ok(serde_json::from_str(&text)?)
    }

    /// Writes `session.json.tmp`, then renames it over `session.json`, so a reader never sees
    /// half a manifest. Callers serialize saves of one session; the store holds no lock.
    pub fn save(&self, manifest: &Manifest) -> Result<(), SessionError> {
        let target = self.path(&manifest.id).join(MANIFEST);
        let tmp = target.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(manifest)?)?;
        fs::rename(&tmp, &target)?;
        Ok(())
    }

    /// Every saved session, newest id first.
    pub fn list(&self) -> Result<Vec<Manifest>, SessionError> {
        let mut ids = Vec::new();
        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            if entry.path().join(MANIFEST).is_file() {
                ids.push(entry.file_name().to_string_lossy().into_owned());
            }
        }
        ids.sort_unstable_by(|a, b| b.cmp(a));
        ids.iter().map(|id| self.load(id)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    fn template() -> Value {
        json!({"id": "t", "revision": 1})
    }

    #[test]
    fn a_new_session_is_saved_as_preparing_with_python_top_level_keys() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let manifest = store
            .create("Killed run", SessionKind::Run, template())
            .unwrap();
        assert!(manifest.id.ends_with("-killed-run"), "{}", manifest.id);
        assert_eq!(manifest.status, SessionStatus::Preparing);
        assert_eq!(store.load(&manifest.id).unwrap(), manifest);

        let path = store.path(&manifest.id);
        let saved: Value =
            serde_json::from_str(&fs::read_to_string(path.join(MANIFEST)).unwrap()).unwrap();
        let keys: Vec<&str> = saved
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            [
                "id",
                "name",
                "kind",
                "status",
                "created_utc",
                "host",
                "template",
                "captures"
            ]
        );
        assert_eq!(saved["kind"], "run");
        assert_eq!(saved["template"], template());
        let names: Vec<_> = fs::read_dir(&path)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, [MANIFEST]);
    }

    #[test]
    fn sessions_with_one_name_in_one_second_get_numbered_ids() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let second = Utc.with_ymd_and_hms(2026, 10, 16, 22, 9, 52).unwrap();
        let ids: Vec<String> = (0..3)
            .map(|_| {
                store
                    .create_at(second, "group test", SessionKind::Run, template())
                    .unwrap()
                    .id
            })
            .collect();
        assert_eq!(
            ids,
            [
                "20261016-220952-group-test",
                "20261016-220952-group-test-2",
                "20261016-220952-group-test-3"
            ]
        );
        for id in &ids {
            assert_eq!(&store.load(id).unwrap().id, id);
        }
    }

    #[test]
    fn saving_replaces_the_manifest() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let mut manifest = store
            .create("done", SessionKind::Import, template())
            .unwrap();
        manifest.status = SessionStatus::Imported;
        store.save(&manifest).unwrap();
        assert_eq!(
            store.load(&manifest.id).unwrap().status,
            SessionStatus::Imported
        );
        assert!(!store.path(&manifest.id).join("session.json.tmp").exists());
    }

    #[test]
    fn list_returns_saved_sessions_newest_first() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        let early = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
        let late = Utc.with_ymd_and_hms(2026, 10, 16, 10, 0, 0).unwrap();
        store
            .create_at(early, "a", SessionKind::Run, template())
            .unwrap();
        store
            .create_at(late, "b", SessionKind::Run, template())
            .unwrap();
        fs::create_dir(store.path("not-a-session")).unwrap();
        let ids: Vec<String> = store.list().unwrap().into_iter().map(|m| m.id).collect();
        assert_eq!(ids, ["20261016-100000-b", "20261016-090000-a"]);
    }

    #[test]
    fn loading_a_missing_session_fails() {
        let data = tempfile::tempdir().unwrap();
        let store = SessionStore::new(data.path()).unwrap();
        assert!(matches!(store.load("nope"), Err(SessionError::Io(_))));
    }
}
