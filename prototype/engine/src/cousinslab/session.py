"""Session storage: a folder per session, a JSON manifest, and Parquet segments per capture.

    sessions/<id>/session.json              template snapshot, captures, timing, status
    sessions/<id>/captures/<cid>/samples/   part-NNNNN.parquet, rolled every few seconds
    sessions/<id>/captures/<cid>/events/    part-NNNNN.parquet
    sessions/<id>/captures/<cid>/raw/       source bytes (spool file, copies of imported files)
    sessions/<id>/markers/                  operator events, host clock
    sessions/<id>/alignments/<aid>.json     explicit offsets; never applied to stored data

A Parquet file is unreadable until its footer is written, so each segment is written to a
temporary name and renamed when complete. A crash loses at most the unflushed rows.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import socket
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

from .contract import Column, Event

ARROW_TYPES = {
    "int64": pa.int64(),
    "float64": pa.float64(),
    "string": pa.string(),
    "timestamp_utc": pa.timestamp("us", tz="UTC"),
    "timestamp_local": pa.timestamp("us"),
}

EVENT_COLUMNS = (
    Column("seq", "int64"),
    Column("kind", "string"),
    Column("label", "string"),
    Column("t_host_utc", "timestamp_utc", description="Host clock when the event was recorded"),
    Column("clock", "string", description="Native clock column t_native is measured on"),
    Column("t_native", "float64", "s", "Event time on the capture's native clock, in seconds"),
    Column("value", "float64"),
    Column("payload_json", "string"),
)

FINISHED = {"completed", "completed_with_failures", "cancelled", "interrupted", "not_ready", "imported", "failed"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(t: datetime | None) -> str | None:
    return t.isoformat() if t else None


def arrow_schema(columns: tuple[Column, ...] | list[Column]) -> pa.Schema:
    fields = [
        pa.field(c.name, ARROW_TYPES[c.type], metadata={"unit": c.unit, "description": c.description})
        for c in columns
    ]
    return pa.schema(fields)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "session"


class SegmentWriter:
    def __init__(self, directory: Path, schema: pa.Schema, flush_rows: int = 2000, flush_s: float = 2.0) -> None:
        self.dir, self.schema = directory, schema
        self.flush_rows, self.flush_s = flush_rows, flush_s
        self.dir.mkdir(parents=True, exist_ok=True)
        self._rows: list[dict[str, Any]] = []
        self._part = len(list(self.dir.glob("part-*.parquet")))
        self._last_flush = time.monotonic()
        self._lock = threading.Lock()
        self.rows_written = 0

    def append(self, rows: list[dict[str, Any]]) -> None:
        with self._lock:
            self._rows.extend(rows)
            due = len(self._rows) >= self.flush_rows or time.monotonic() - self._last_flush >= self.flush_s
        if due:
            self.flush()

    def flush(self) -> None:
        with self._lock:
            rows, self._rows = self._rows, []
            self._last_flush = time.monotonic()
            if not rows:
                return
            target = self.dir / f"part-{self._part:05d}.parquet"
            self._part += 1
            tmp = target.with_suffix(".parquet.tmp")
            pq.write_table(pa.Table.from_pylist(rows, schema=self.schema), tmp)
            os.replace(tmp, target)
            self.rows_written += len(rows)


class SessionStore:
    def __init__(self, data_dir: Path) -> None:
        self.dir = data_dir / "sessions"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def path(self, session_id: str) -> Path:
        return self.dir / session_id

    def create(self, name: str, kind: str, template: dict[str, Any]) -> dict[str, Any]:
        created = utc_now()
        session_id = f"{created:%Y%m%d-%H%M%S}-{slug(name)}"
        offset = datetime.now().astimezone().strftime("%z")
        manifest = {
            "id": session_id,
            "name": name,
            "kind": kind,
            "status": "preparing",
            "created_utc": iso(created),
            "host": {"hostname": socket.gethostname(), "utc_offset": offset},
            "template": template,
            "captures": {},
            "analysis": {"trial_params": {}},
        }
        self.path(session_id).mkdir(parents=True)
        self.save(manifest)
        return manifest

    def load(self, session_id: str) -> dict[str, Any]:
        return json.loads((self.path(session_id) / "session.json").read_text())

    def save(self, manifest: dict[str, Any]) -> None:
        with self._lock:
            target = self.path(manifest["id"]) / "session.json"
            tmp = target.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(manifest, indent=2, default=str))
            os.replace(tmp, target)

    def list(self) -> list[dict[str, Any]]:
        out = []
        for f in sorted(self.dir.glob("*/session.json"), reverse=True):
            out.append(json.loads(f.read_text()))
        return out

    def mark_interrupted(self) -> list[str]:
        """Sessions left running by a crash or kill are marked, never resumed silently."""
        found = []
        for manifest in self.list():
            if manifest["status"] not in FINISHED:
                manifest["status"] = "interrupted"
                for cap in manifest["captures"].values():
                    if cap["status"] not in FINISHED:
                        cap["status"] = "interrupted"
                for tmp in self.path(manifest["id"]).rglob("*.parquet.tmp"):
                    tmp.unlink()
                self.save(manifest)
                found.append(manifest["id"])
        return found

    def capture_dir(self, session_id: str, capture_id: str) -> Path:
        return self.path(session_id) / "captures" / capture_id


def event_row(seq: int, event: Event) -> dict[str, Any]:
    return {
        "seq": seq,
        "kind": event.kind,
        "label": event.label,
        "t_host_utc": event.t_host_utc,
        "clock": event.clock,
        "t_native": event.t_native,
        "value": event.value,
        "payload_json": json.dumps(event.payload) if event.payload else None,
    }
