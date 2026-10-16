"""DuckDB over a session's Parquet files. Nothing is copied into a database file.

Every capture becomes two views, `"cap:<capture>"` for samples and `"ev:<capture>"` for
events. Alias columns from the instrument profile (m44 for ch3, for example) are added
to the samples view. Session markers are the view `markers`. Notebooks can use the same
views through `open_session`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

CLOCK_SECONDS = {
    "host_utc": 'epoch_us("{c}") / 1e6',
    "source_local": 'epoch_us("{c}") / 1e6',
    "device_relative": '"{c}" * {k}',
    "elapsed": '"{c}" * {k}',
}


def clock_seconds_sql(clock: dict[str, Any]) -> str:
    return CLOCK_SECONDS[clock["kind"]].format(c=clock["column"], k=repr(float(clock["seconds_per_unit"])))


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def has_parquet(directory: Path) -> bool:
    return any(directory.glob("part-*.parquet"))


def connect(session_dir: Path) -> duckdb.DuckDBPyConnection:
    manifest = json.loads((session_dir / "session.json").read_text())
    con = duckdb.connect()
    con.execute("SET TimeZone = 'UTC'")
    for cid, cap in manifest["captures"].items():
        cdir = session_dir / "captures" / cid
        if has_parquet(cdir / "samples"):
            aliases = "".join(f', "{col}" AS "{alias}"' for alias, col in cap.get("aliases", {}).items())
            glob = sql_string(str(cdir / "samples" / "part-*.parquet"))
            con.execute(f'CREATE VIEW "cap:{cid}" AS SELECT *{aliases} FROM read_parquet({glob})')
        if has_parquet(cdir / "events"):
            con.execute(f'CREATE VIEW "ev:{cid}" AS SELECT * FROM read_parquet({sql_string(str(cdir / "events" / "part-*.parquet"))})')
    if has_parquet(session_dir / "markers"):
        con.execute(f"CREATE VIEW markers AS SELECT * FROM read_parquet({sql_string(str(session_dir / 'markers' / 'part-*.parquet'))})")
    return con


def open_session(session_dir: str | Path, alignment_id: str | None = None) -> duckdb.DuckDBPyConnection:
    """For notebooks: a read-only view of a session, optionally with an `aligned` view."""
    from .alignment import aligned_sql, load_alignment

    session_dir = Path(session_dir)
    con = connect(session_dir)
    if alignment_id:
        manifest = json.loads((session_dir / "session.json").read_text())
        con.execute(f"CREATE VIEW aligned AS {aligned_sql(manifest, load_alignment(session_dir, alignment_id))}")
    return con


def rows_as_dicts(con: duckdb.DuckDBPyConnection, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    cur = con.execute(sql, params or [])
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row)) for row in cur.fetchall()]


def session_events(session_dir: Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Every capture event and operator marker, with its stored times and, for runs, seconds on the run clock."""
    con = connect(session_dir)
    views = {r[0] for r in con.execute("SELECT view_name FROM duckdb_views() WHERE NOT internal").fetchall()}
    start = manifest.get("run", {}).get("group_start_utc")
    x_run = f"epoch_us(t_host_utc) / 1e6 - epoch_us({sql_string(start)}::TIMESTAMPTZ) / 1e6" if start else "NULL::DOUBLE"
    sources = [(cid, f"ev:{cid}") for cid in manifest["captures"]] + [("operator", "markers")]
    events = []
    for source, view in sources:
        if view in views:
            events += rows_as_dicts(con, f'SELECT ? AS source, kind, label, t_host_utc, clock, t_native, value, '
                                         f'{x_run} AS x_run_s FROM "{view}" ORDER BY seq', [source])
    for e in events:
        e["t_host_utc"] = e["t_host_utc"].isoformat() if e["t_host_utc"] else None
    return sorted(events, key=lambda e: (e["x_run_s"] is None, e["x_run_s"] or 0))
