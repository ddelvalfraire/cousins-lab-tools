"""CSV exports: aligned analysis data with a JSON sidecar, and legacy frame folders."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .alignment import aligned_sql
from .query import connect, sql_string
from .spool import legacy_frame_csv


def export_aligned(session_dir: Path, manifest: dict[str, Any], alignment: dict[str, Any]) -> dict[str, str]:
    """One header row, original time columns kept beside x_s; metadata in a sidecar, not in comment lines."""
    out = session_dir / "exports" / alignment["id"]
    out.mkdir(parents=True, exist_ok=True)
    con = connect(session_dir)
    con.execute(f"CREATE VIEW aligned AS {aligned_sql(manifest, alignment)}")
    csv_path = out / "aligned.csv"
    con.execute(f"COPY (SELECT * FROM aligned ORDER BY trial, capture, x_s) TO {sql_string(str(csv_path))} (HEADER, DELIMITER ',')")
    columns = [{"name": r[0], "type": r[1]} for r in con.execute("DESCRIBE aligned").fetchall()]
    units = {c["name"]: c.get("unit", "") for cap in manifest["captures"].values() for c in cap["columns"]}
    template = manifest["template"]
    units.update({k: d.get("unit", "") for k, d in template.get("derived", {}).items()})
    units.update(x_s=f"s relative to {alignment['reference']}" + (f" '{alignment['event']}'" if alignment.get("event") else ""),
                 x_uncertainty_s="s")
    sidecar = {
        "session": {k: manifest[k] for k in ("id", "name", "kind", "created_utc", "host")},
        "template": {"id": template["id"], "revision": template["revision"]},
        "alignment": alignment,
        "captures": {cid: {k: c.get(k) for k in ("role", "label", "input_kind", "input_note", "sources", "clocks")}
                     for cid, c in manifest["captures"].items()},
        "columns": [{**c, "unit": units.get(c["name"], "")} for c in columns],
        "notes": [
            "x_s is computed from the named clock column minus the member's zero; original time columns are unchanged.",
            "Rows from different captures are not resampled onto a common grid.",
        ],
    }
    json_path = out / "aligned.json"
    json_path.write_text(json.dumps(sidecar, indent=2, default=str))
    return {"csv": str(csv_path), "metadata": str(json_path)}


def export_legacy_frames(session_dir: Path, capture_id: str) -> dict[str, Any]:
    """Headerless one-frame CSVs that modules 1-3 can open, as readEZView.py wrote them."""
    out = session_dir / "exports" / f"legacy-frames-{capture_id}"
    out.mkdir(parents=True, exist_ok=True)
    cur = connect(session_dir).execute(f'SELECT * FROM "cap:{capture_id}" ORDER BY seq')
    names = [d[0] for d in cur.description]
    count = 0
    for count, row in enumerate(cur.fetchall(), start=1):
        (out / f"{count - 1}.csv").write_text(legacy_frame_csv(dict(zip(names, row))))
    return {"folder": str(out), "files": count}
