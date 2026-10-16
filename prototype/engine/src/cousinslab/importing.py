"""Imports recorded files into a session so they can be aligned and analysed like live captures.

Imported captures keep only the clocks their files contain. The workbook has elapsed
seconds; the Ambit CSVs have the device counter. Neither has clock time, so they can be
compared relative to their own starts or to a shared event, never on the wall clock.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .ambit import AMBIT_COLUMNS, detect_events, read_ambit_csv, timing_summary
from .contract import INPUT_KIND_LABELS, Clock
from .ms_workbook import MS_IMPORT_CLOCKS, MS_IMPORT_COLUMNS, read_raw_sheet
from .session import EVENT_COLUMNS, SegmentWriter, SessionStore, arrow_schema, event_row, sha256, slug
from .templates import Template

AMBIT_IMPORT_CLOCKS = (Clock("t_device_ms", "device_relative", 0.001, "Ambit counter from run start; the CSV records no clock time"),)


def import_session(store: SessionStore, template: Template, name: str, files: list[dict[str, str]]) -> dict[str, Any]:
    manifest = store.create(name, "import", template.data)
    roles = template.data["roles"]
    for item in files:
        role, source = item["role"], Path(item["path"])
        importer = roles[role]["import"]
        capture_id = f"{role}-{slug(item.get('label') or source.stem)}"
        cdir = store.capture_dir(manifest["id"], capture_id)
        (cdir / "raw").mkdir(parents=True)
        shutil.copy2(source, cdir / "raw" / source.name)
        meta: dict[str, Any] = {
            "role": role,
            "label": item.get("label") or source.stem,
            "input_kind": "import",
            "input_note": f"{INPUT_KIND_LABELS['import']}: {source.name}",
            "sources": [{"path": str(source), "name": source.name, "sha256": sha256(source), "bytes": source.stat().st_size}],
            "status": "imported",
        }
        if importer == "ms_workbook":
            series = read_raw_sheet(source)
            rows = [{"seq": i, "t_elapsed_s": t, "m32": a, "m44": b, "m45": c}
                    for i, (t, a, b, c) in enumerate(zip(series.t_elapsed_s, series.m32, series.m44, series.m45))]
            columns, clocks, events = MS_IMPORT_COLUMNS, MS_IMPORT_CLOCKS, []
        elif importer == "ambit_csv":
            recording = read_ambit_csv(source)
            rows = [{"seq": i, "t_host_utc": None, "t_device_ms": r["T"], **{k: r[k] for k in ("S", "R", "F", "B", "ACT", "Blue", "Red")}}
                    for i, r in enumerate(recording.rows)]
            columns, clocks = AMBIT_COLUMNS, AMBIT_IMPORT_CLOCKS
            events = detect_events(recording.rows, template.flash_red_level(role))
            plan = template.protocol_plan(role)
            meta["ignored_columns"] = recording.ignored_columns
            meta["timing"] = timing_summary(recording.rows, plan)
            meta["protocol_plan"] = plan.__dict__ if plan else None
        else:
            raise ValueError(f"Unknown importer {importer}")
        writer = SegmentWriter(cdir / "samples", arrow_schema(columns), flush_rows=10**9, flush_s=10**9)
        writer.append(rows)
        writer.flush()
        event_writer = SegmentWriter(cdir / "events", arrow_schema(EVENT_COLUMNS), flush_rows=10**9, flush_s=10**9)
        event_writer.append([event_row(i, e) for i, e in enumerate(events)])
        event_writer.flush()
        meta.update(rows=len(rows), columns=[c.__dict__ for c in columns], clocks=[c.__dict__ for c in clocks], aliases={})
        manifest["captures"][capture_id] = meta
    manifest["status"] = "imported"
    store.save(manifest)
    return manifest
