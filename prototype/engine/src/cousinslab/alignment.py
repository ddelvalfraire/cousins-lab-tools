"""Explicit, reproducible alignment of captures onto a shared time axis.

An alignment never edits stored data. For every member capture it names the clock used,
the zero on that clock, how the zero was chosen, and an uncertainty. The aligned time is
`x_s = clock_seconds - zero`. Three references are supported:

- clock: actual clock time. Only captures that recorded host clock time can take part.
- elapsed: each capture from its own start. Starts are not assumed to be the same moment.
- event: each capture relative to a named experimental event, found by detection, an
  operator marker, transfer over a shared host clock, or a value the researcher enters.

A capture with no way to place it is listed as unaligned with the reason, never guessed.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

from .query import clock_seconds_sql, connect, rows_as_dicts, sql_string
from .templates import Template

ELAPSED_PREFERENCE = ("device_relative", "elapsed", "source_local", "host_utc")
MAX_POINTS_PER_SERIES = 4000


def clock_of(cap: dict[str, Any], kind: str) -> dict[str, Any] | None:
    return next((c for c in cap["clocks"] if c["kind"] == kind), None)


def sample_interval_s(con: duckdb.DuckDBPyConnection, cid: str, clock: dict[str, Any]) -> float | None:
    """Median gap between distinct times. Frames decoded in one spool poll share a receipt time."""
    sec = clock_seconds_sql(clock)
    value = con.execute(
        f'SELECT median(d) FILTER (WHERE d > 0) FROM (SELECT {sec} - lag({sec}) OVER (ORDER BY seq) AS d FROM "cap:{cid}")'
    ).fetchone()[0]
    return round(float(value), 6) if value is not None else None


def first_value(con: duckdb.DuckDBPyConnection, cid: str, clock: dict[str, Any]) -> float | None:
    return con.execute(f'SELECT min({clock_seconds_sql(clock)}) FROM "cap:{cid}"').fetchone()[0]


def detected_event(con, cid: str, kind: str, number: int | None) -> dict[str, Any] | None:
    try:
        rows = rows_as_dicts(con, f'SELECT * FROM "ev:{cid}" WHERE kind = ? ORDER BY seq', [kind])
    except duckdb.CatalogException:
        return None
    if number is not None:
        rows = [r for r in rows if r["value"] == number]
    return rows[0] if rows else None


def marker_epoch(con, event_id: str) -> float | None:
    try:
        return con.execute("SELECT epoch_us(t_host_utc) / 1e6 FROM markers WHERE kind = ? ORDER BY seq LIMIT 1", [event_id]).fetchone()[0]
    except (duckdb.CatalogException, TypeError):
        return None


def trials_of(manifest: dict[str, Any], template: Template) -> list[dict[str, Any]]:
    trial_role = template.data.get("alignment", {}).get("trial_role")
    captures = manifest["captures"]
    leads = [cid for cid, c in captures.items() if c["role"] == trial_role]
    if not leads:
        return [{"id": "all", "label": "All captures", "captures": list(captures)}]
    shared = [cid for cid, c in captures.items() if c["role"] != trial_role]
    return [{"id": cid, "label": captures[cid].get("label", cid), "captures": [*shared, cid]} for cid in leads]


def propose(session_dir: Path, manifest: dict[str, Any], reference: str,
            manual: dict[str, dict[str, dict[str, Any]]] | None = None,
            trial_params: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
    template = Template(manifest["template"])
    spec = template.data.get("alignment", {})
    event_id = spec.get("event") if reference == "event" else None
    event_spec = template.data.get("events", {}).get(event_id or "", {})
    detect = event_spec.get("detect", {})
    manual = manual or {}
    con = connect(session_dir)
    captures = manifest["captures"]
    trials = [{"id": "all", "label": "All captures", "captures": list(captures)}] if reference == "clock" else trials_of(manifest, template)

    clock_origin = None
    if reference == "clock":
        firsts = [first_value(con, cid, clock_of(c, "host_utc")) for cid, c in captures.items() if clock_of(c, "host_utc")]
        firsts = [f for f in firsts if f is not None]
        clock_origin = min(firsts) if firsts else None

    marker = marker_epoch(con, event_id) if event_id else None
    out_trials, unaligned = [], []
    for trial in trials:
        members = []
        detect_cid = next((cid for cid in trial["captures"] if captures[cid]["role"] == detect.get("role")), None)
        detected = detected_event(con, detect_cid, detect["kind"], detect.get("number")) if detect_cid and detect else None
        for cid in trial["captures"]:
            cap = captures[cid]
            if not cap.get("rows"):
                unaligned.append({"trial": trial["id"], "capture": cid, "reason": "No samples recorded"})
                continue
            host = clock_of(cap, "host_utc")
            member: dict[str, Any] | None = None
            override = manual.get(trial["id"], {}).get(cid)
            if reference == "clock":
                if host and clock_origin is not None:
                    member = {"clock": host, "zero": clock_origin, "method": "Host clock; zero is the earliest first sample in the session"}
                else:
                    kinds = ", ".join(c["kind"] for c in cap["clocks"])
                    unaligned.append({"trial": trial["id"], "capture": cid,
                                      "reason": f"Records no clock time, only: {kinds}. Use elapsed or event alignment."})
            elif reference == "elapsed":
                clock = next(c for k in ELAPSED_PREFERENCE for c in cap["clocks"] if c["kind"] == k)
                if clock["kind"] in ("device_relative", "elapsed"):
                    member = {"clock": clock, "zero": 0.0, "method": f"Origin of {clock['column']} (the instrument's own start)"}
                else:
                    member = {"clock": clock, "zero": first_value(con, cid, clock), "method": f"First sample on {clock['column']}"}
            elif override is not None:
                clock = next(c for c in cap["clocks"] if c["column"] == override["clock"])
                member = {"clock": clock, "zero": float(override["zero"]), "method": override.get("method", "Entered by researcher")}
            elif host and marker is not None:
                member = {"clock": host, "zero": marker, "method": f"Operator marker '{event_id}' on the host clock"}
            elif host and detected and detected.get("t_host_utc") is not None:
                how = "Detected" if cid == detect_cid else f"Transferred over the host clock from {captures[detect_cid].get('label', detect_cid)}:"
                member = {"clock": host, "zero": detected["t_host_utc"].timestamp(), "method": f"{how} {detected['label']} (receipt time)"}
            elif cid == detect_cid and detected:
                clock = next(c for c in cap["clocks"] if c["column"] == detected["clock"])
                member = {"clock": clock, "zero": float(detected["t_native"]), "method": f"Detected: {detected['label']} on {clock['column']}"}
            else:
                columns = ", ".join(c["column"] for c in cap["clocks"])
                unaligned.append({"trial": trial["id"], "capture": cid, "needs_event_time": True, "clocks": columns,
                                  "reason": f"No shared clock with the other captures. Enter when '{event_spec.get('label', event_id)}' happened on {columns}."})
            if member:
                member.update(capture=cid, role=cap["role"], label=cap.get("label", cid),
                              uncertainty_s=sample_interval_s(con, cid, member["clock"]))
                members.append(member)
        params = {**template.params(), **(trial_params or {}).get(trial["id"], {})}
        out_trials.append({"id": trial["id"], "label": trial["label"], "members": members, "params": params})

    return {
        "reference": reference,
        "event": event_id,
        "event_label": event_spec.get("label"),
        "event_note": event_spec.get("note"),
        "window_s": spec.get("window_s") if reference == "event" else None,
        "clock_origin_utc": datetime.fromtimestamp(clock_origin, timezone.utc).isoformat() if clock_origin else None,
        "trials": out_trials,
        "unaligned": unaligned,
        "uncertainty_note": "One sample interval on the member's clock. Receipt latency and clock drift are not characterized.",
        "template": {"id": template.id, "revision": template.revision},
        "inputs": {"reference": reference, "manual": manual, "trial_params": trial_params or {}},
    }


def aligned_sql(manifest: dict[str, Any], alignment: dict[str, Any]) -> str:
    template = Template(manifest["template"])
    derived = template.derived()
    window = alignment.get("window_s")
    parts = []
    for trial in alignment["trials"]:
        for m in trial["members"]:
            x = f"({clock_seconds_sql(m['clock'])}) - {float(m['zero'])!r}"
            exprs = "".join(f', {expr.sql(trial["params"])} AS "{name}"'
                            for name, (d, expr) in derived.items() if d["role"] == m["role"])
            where = f" WHERE {x} BETWEEN {float(window[0])!r} AND {float(window[1])!r}" if window else ""
            unc = "NULL" if m["uncertainty_s"] is None else repr(float(m["uncertainty_s"]))
            parts.append(
                f"SELECT {sql_string(alignment.get('id', 'proposal'))} AS alignment_id, {sql_string(trial['id'])} AS trial, "
                f"{sql_string(m['capture'])} AS capture, {sql_string(m['role'])} AS role, {x} AS x_s, "
                f"{unc} AS x_uncertainty_s{exprs}, * FROM \"cap:{m['capture']}\"{where}"
            )
    if not parts:
        return "SELECT NULL AS trial, NULL AS capture, NULL AS role, NULL::DOUBLE AS x_s WHERE false"
    return " UNION ALL BY NAME ".join(parts)


def decimate(points: list[list[float]], limit: int = MAX_POINTS_PER_SERIES) -> list[list[float]]:
    """Keeps each bucket's min and max so short events such as flashes stay visible."""
    if len(points) <= limit:
        return points
    size = len(points) / (limit // 2)
    out = []
    for b in range(limit // 2):
        bucket = points[int(b * size): int((b + 1) * size)]
        if bucket:
            lo, hi = min(bucket, key=lambda p: p[1]), max(bucket, key=lambda p: p[1])
            out.extend(sorted([lo, hi]) if lo is not hi else [lo])
    return out


def _aligned(session_dir: Path, manifest: dict[str, Any], alignment: dict[str, Any]):
    con = connect(session_dir)
    con.execute(f"CREATE VIEW aligned AS {aligned_sql(manifest, alignment)}")
    columns = {r[0] for r in con.execute("DESCRIBE aligned").fetchall()}
    labels = {m["capture"]: m["label"] for t in alignment["trials"] for m in t["members"]}
    return con, columns, labels


def _series(con, role: str, value: str, labels: dict[str, str]) -> list[dict[str, Any]]:
    rows = con.execute(f'SELECT trial, capture, x_s, "{value}" FROM aligned WHERE role = ? AND "{value}" IS NOT NULL '
                       "ORDER BY trial, capture, x_s", [role]).fetchall()
    grouped: dict[tuple[str, str], list[list[float]]] = {}
    for trial, capture, x, y in rows:
        grouped.setdefault((trial, capture), []).append([x, y])
    return [{"trial": trial, "capture": capture, "role": role, "value": value,
             "name": f"{labels.get(capture, capture)} · {value}", "points": decimate(pts)}
            for (trial, capture), pts in grouped.items()]


def metric_series(session_dir: Path, manifest: dict[str, Any], alignment: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Aligned series for each value a visible metric shows, so replay can read a metric at any x."""
    con, columns, labels = _aligned(session_dir, manifest, alignment)
    return {value: _series(con, role, value, labels)
            for value, role in Template(manifest["template"]).metric_bindings().items() if value in columns}


def chart_data(session_dir: Path, manifest: dict[str, Any], alignment: dict[str, Any]) -> list[dict[str, Any]]:
    template = Template(manifest["template"])
    con, columns, labels = _aligned(session_dir, manifest, alignment)
    charts = []
    for chart in template.charts():
        series = [x for s in chart["series"] if s["value"] in columns for x in _series(con, s["role"], s["value"], labels)]
        markers = []
        if chart.get("markers"):
            spec = chart["markers"]
            for trial in alignment["trials"]:
                for m in trial["members"]:
                    if m["role"] != spec["role"]:
                        continue
                    sec = "epoch_us(t_host_utc) / 1e6" if m["clock"]["kind"] == "host_utc" else "t_native"
                    try:
                        for label, x in con.execute(
                                f'SELECT label, {sec} - ? FROM "ev:{m["capture"]}" WHERE kind = ? ORDER BY seq',
                                [float(m["zero"]), spec["kind"]]).fetchall():
                            if x is not None:
                                markers.append({"trial": trial["id"], "label": label, "x": x})
                    except duckdb.CatalogException:
                        pass
        charts.append({"id": chart["id"], "title": chart["title"], "unit": chart.get("unit", ""), "series": series, "markers": markers})
    return charts


def save_alignment(session_dir: Path, alignment: dict[str, Any]) -> dict[str, Any]:
    created = datetime.now(timezone.utc)
    record = {**alignment, "id": f"aln-{created:%Y%m%d-%H%M%S}-{alignment['reference']}", "created_utc": created.isoformat()}
    target = session_dir / "alignments" / f"{record['id']}.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(record, indent=2))
    return record


def load_alignment(session_dir: Path, alignment_id: str) -> dict[str, Any]:
    return json.loads((session_dir / "alignments" / f"{alignment_id}.json").read_text())


def list_alignments(session_dir: Path) -> list[dict[str, Any]]:
    return [json.loads(f.read_text()) for f in sorted((session_dir / "alignments").glob("*.json"))]
