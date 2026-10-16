"""Group runs: start every role of a template together, each after its configured delay.

Requested start, the moment the engine actually started the adapter, and the first sample's
receipt time are recorded separately. Starting adapters together does not make the
instruments sample together; any relation between their samples comes from the clocks.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pyarrow.parquet as pq

from .ambit import AmbitReplay, timing_summary
from .contract import INPUT_KIND_LABELS, Event, Instrument
from .ms_workbook import read_raw_sheet
from .session import EVENT_COLUMNS, SegmentWriter, SessionStore, arrow_schema, event_row, iso, utc_now
from .simulate import SpoolSimulator
from .spool import EZViewSpool
from .templates import Template, resolve_path

LIVE_BUFFER_ROWS = 50_000


def build_adapter(profile: dict[str, Any], role: str, template: Template, capture_dir, speed: float):
    """Returns (adapter, simulator or None, input note, source files)."""
    settings = profile.get("settings", {})
    if profile["adapter"] == "ezview_spool":
        sim = profile.get("simulate")
        if sim:
            series = read_raw_sheet(resolve_path(sim["workbook"]))
            lo, hi = sim["first_row"] - 2, sim["last_row"] - 1
            columns = {int(ch[2:]): getattr(series, name) for ch, name in sim["channels"].items()}
            values = [{ch: col[i] for ch, col in columns.items()} for i in range(lo, hi)]
            spool = capture_dir / "raw" / "simulated-ezview-spool.txt"
            simulator = SpoolSimulator(spool, series.t_elapsed_s[lo:hi], values, speed)
            note = f"{INPUT_KIND_LABELS['simulated']}: spool written now by the simulator at {speed:g}x. {sim['note'].strip()}"
            return EZViewSpool(profile, spool, "simulated"), simulator, note, [resolve_path(sim["workbook"])]
        path = settings.get("spool_path")
        return EZViewSpool(profile, resolve_path(path) if path else None, profile["input_kind"]), None, "EZView spool file", []
    if profile["adapter"] == "ambit_replay":
        recording = resolve_path(settings["recording"])
        note = f"{INPUT_KIND_LABELS['replay']}: {recording.name} at {speed:g}x. Rows and device T are recorded values; host times are this replay's."
        return AmbitReplay(profile, recording, speed, template.flash_red_level(role)), None, note, [recording]
    raise ValueError(f"Unknown adapter {profile['adapter']}")


@dataclass
class LiveCapture:
    role: str
    adapter: Instrument
    writer: SegmentWriter
    events: SegmentWriter
    stop: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)
    buffer: deque = field(default_factory=lambda: deque(maxlen=LIVE_BUFFER_ROWS))
    live_events: list = field(default_factory=list)
    count: int = 0
    event_seq: int = 0
    thread: threading.Thread | None = None


class GroupRun:
    def __init__(self, store: SessionStore, manifest: dict[str, Any], template: Template,
                 profiles: dict[str, dict[str, Any]], speed: float) -> None:
        self.store, self.manifest, self.template, self.profiles, self.speed = store, manifest, template, profiles, speed
        self.captures: dict[str, LiveCapture] = {}
        self.simulators: list[SpoolSimulator] = []
        self.lock = threading.Lock()
        self.t0_monotonic: float | None = None
        self.t0_utc = None
        self.markers = SegmentWriter(store.path(manifest["id"]) / "markers", arrow_schema(EVENT_COLUMNS), flush_s=0)
        self.marker_seq = 0
        self.live_markers: list[dict[str, Any]] = []
        self.derived = {k: (d, e.python(template.params())) for k, (d, e) in template.derived().items()}

    def _save(self) -> None:
        with self.lock:
            self.store.save(self.manifest)

    def prepare(self) -> bool:
        session_id = self.manifest["id"]
        ready = True
        for role, cfg in self.template.enabled_roles().items():
            profile = self.profiles[cfg["instrument"]]
            cdir = self.store.capture_dir(session_id, role)
            adapter, simulator, note, sources = build_adapter(profile, role, self.template, cdir, self.speed)
            if simulator:
                simulator.start()
                self.simulators.append(simulator)
            info = adapter.describe()
            readiness = adapter.check_ready()
            ready &= readiness.ok
            self.captures[role] = LiveCapture(
                role, adapter,
                SegmentWriter(cdir / "samples", arrow_schema(info.columns)),
                SegmentWriter(cdir / "events", arrow_schema(EVENT_COLUMNS), flush_s=0),
            )
            plan = self.template.protocol_plan(role)
            self.manifest["captures"][role] = {
                "role": role,
                "label": cfg.get("label", role),
                "instrument": profile,
                "adapter": info.adapter,
                "model": info.model,
                "input_kind": info.input_kind,
                "input_note": note,
                "sources": [{"path": str(p), "name": p.name} for p in sources],
                "capabilities": sorted(info.capabilities),
                "columns": [c.__dict__ for c in info.columns],
                "clocks": [c.__dict__ for c in info.clocks],
                "aliases": info.aliases,
                "requested_delay_s": float(cfg.get("start_delay_s", 0)),
                "host_delay_s": float(cfg.get("start_delay_s", 0)) / self.speed,
                "on_failure": cfg.get("on_failure", "continue_others"),
                "readiness": {"ok": readiness.ok, "detail": readiness.detail},
                "status": "ready" if readiness.ok else "not_ready",
                "rows": 0,
                "protocol_plan": plan.__dict__ if plan else None,
            }
        self.manifest["run"] = {
            "speed": self.speed,
            "note": "Simulated and replayed inputs: data, device counters, and start delays are compressed by the speed factor; host clock times are real.",
        }
        if not ready:
            self.manifest["status"] = "not_ready"
            for sim in self.simulators:
                sim.close()
        self._save()
        return ready

    def start(self) -> None:
        self.t0_monotonic, self.t0_utc = time.monotonic(), utc_now()
        self.manifest["status"] = "running"
        self.manifest["run"]["group_start_utc"] = iso(self.t0_utc)
        for role, cap in self.captures.items():
            delay = self.manifest["captures"][role]["host_delay_s"]
            self.manifest["captures"][role]["requested_start_utc"] = iso(self.t0_utc + timedelta(seconds=delay))
            self.manifest["captures"][role]["status"] = "waiting" if delay else "starting"
            cap.thread = threading.Thread(target=self._run_capture, args=(role,), name=f"capture-{role}", daemon=True)
        self._save()
        for cap in self.captures.values():
            cap.thread.start()

    def _run_capture(self, role: str) -> None:
        cap, meta = self.captures[role], self.manifest["captures"][role]
        if cap.stop.wait(meta["host_delay_s"]):
            meta["status"] = "not_started"
            self._save()
            return
        meta["start_command_utc"] = iso(utc_now())
        meta["status"] = "running"
        self._save()
        sink = _CaptureSink(self, role)
        try:
            cap.adapter.run(sink, cap.stop)
            meta["status"] = "completed" if cap.stop.is_set() else "source_ended"
        except Exception as error:  # an adapter failure must not take down the other captures
            meta["status"], meta["error"] = "failed", f"{type(error).__name__}: {error}"
            if meta["on_failure"] == "stop_group":
                self.manifest["stopped_by"] = f"{role} failed and its policy is stop_group"
                for other in self.captures.values():
                    other.stop.set()
        finally:
            cap.writer.flush()
            cap.events.flush()
            meta["stopped_utc"] = iso(utc_now())
            meta["rows"] = cap.count
            self._save()

    def x_run_s(self, when) -> float:
        return (when - self.t0_utc).total_seconds()

    def mark(self, event_id: str) -> dict[str, Any]:
        spec = self.template.data.get("events", {}).get(event_id, {})
        now = utc_now()
        self.markers.append([event_row(self.marker_seq, Event(event_id, spec.get("label", event_id), now, "t_host_utc"))])
        self.marker_seq += 1
        marker = {"kind": event_id, "label": spec.get("label", event_id), "x_run_s": self.x_run_s(now), "t_host_utc": iso(now)}
        self.live_markers.append(marker)
        return marker

    def stop(self, cancel: bool = False) -> None:
        self.manifest["status"] = "stopping"
        self._save()
        for cap in self.captures.values():
            if cancel:
                cap.adapter.cancel()
            cap.stop.set()
        for cap in self.captures.values():
            if cap.thread:
                cap.thread.join(timeout=10)
        for sim in self.simulators:
            sim.close()
        self.markers.flush()
        for role in self.captures:
            plan = self.template.protocol_plan(role)
            samples = self.store.capture_dir(self.manifest["id"], role) / "samples"
            if plan and any(samples.glob("part-*.parquet")):
                device_ms = pq.read_table(samples, columns=["t_device_ms"]).column("t_device_ms").to_pylist()
                self.manifest["captures"][role]["timing"] = timing_summary([{"T": t} for t in device_ms], plan)
        statuses = {c["status"] for c in self.manifest["captures"].values()}
        self.manifest["status"] = "cancelled" if cancel else "completed_with_failures" if "failed" in statuses else "completed"
        self.manifest["run"]["stopped_utc"] = iso(utc_now())
        self._save()

    def live(self, cursors: dict[str, int]) -> dict[str, Any]:
        out = {}
        for role, cap in self.captures.items():
            start = cursors.get(role, 0)
            with cap.lock:
                rows = list(cap.buffer)[max(0, start - (cap.count - len(cap.buffer))):]
                count = cap.count
            out[role] = {
                "next": count,
                "rows": rows,
                "events": cap.live_events[cursors.get(role + ":events", 0):],
                "events_next": len(cap.live_events),
                "status": self.manifest["captures"][role]["status"],
                "rows_total": count,
            }
        return {
            "status": self.manifest["status"],
            "elapsed_s": time.monotonic() - self.t0_monotonic if self.t0_monotonic else 0,
            "captures": out,
            "markers": self.live_markers,
            "manifest_captures": self.manifest["captures"],
        }


class _CaptureSink:
    def __init__(self, run: GroupRun, role: str) -> None:
        self.run, self.role = run, role
        self.cap = run.captures[role]
        self.meta = run.manifest["captures"][role]
        self.aliases = self.meta["aliases"]
        self.values = run.template.live_values(role)

    def rows(self, rows: list[dict[str, Any]]) -> None:
        self.cap.writer.append(rows)
        points = []
        for row in rows:
            named = {**row, **{alias: row.get(col) for alias, col in self.aliases.items()}}
            point = {"x": self.run.x_run_s(row["t_host_utc"])}
            for value in self.values:
                derived = self.run.derived.get(value)
                point[value] = derived[1](named) if derived and derived[0]["role"] == self.role else named.get(value)
            points.append(point)
        if self.cap.count == 0:
            self.meta["first_sample_utc"] = iso(rows[0]["t_host_utc"])
        with self.cap.lock:
            self.cap.buffer.extend(points)
            self.cap.count += len(rows)
        self.meta["last_sample_utc"] = iso(rows[-1]["t_host_utc"])
        self.meta["rows"] = self.cap.count

    def event(self, event: Event) -> None:
        self.cap.events.append([event_row(self.cap.event_seq, event)])
        self.cap.event_seq += 1
        x = self.run.x_run_s(event.t_host_utc) if event.t_host_utc else None
        self.cap.live_events.append({"kind": event.kind, "label": event.label, "x_run_s": x, "value": event.value})

