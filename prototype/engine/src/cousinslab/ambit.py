"""Ambit fluorometer: recorded-file reader, protocol model, flash detection, and replay adapter.

Facts from `Python script to control Ambit system.ipynb`: the host sends `G` for each
sample and the device answers `T:<ms>,S:..,R:..,F:..,B:..`. The host appends the light
state it last commanded (ACT, Blue, Red). T is the device's millisecond counter; the CSV
carries no clock time because START_TIME stayed in `data.attrs`. Serial control is not
implemented here: running commands against the instrument needs explicit authorization.
"""

from __future__ import annotations

import csv
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract import Clock, Column, Event, InstrumentInfo, Readiness, Sink

FIELDS = ("T", "S", "R", "F", "B", "ACT", "Blue", "Red")
HEADER_ALIASES = {"T (ms)": "T"}

AMBIT_COLUMNS = (
    Column("seq", "int64", description="Row number within this capture"),
    Column("t_host_utc", "timestamp_utc", description="When the engine received the row (host clock)"),
    Column("t_device_ms", "int64", "ms", "Ambit T counter, from the device"),
    Column("S", "int64", "counts", "Measuring signal"),
    Column("R", "int64", "counts", "Reference signal"),
    Column("F", "int64", "counts", "Meaning not documented"),
    Column("B", "int64", "counts", "Meaning not documented"),
    Column("ACT", "int64", "0-255 setting", "Ambit actinic level commanded by the host"),
    Column("Blue", "int64", "DAC setting", "External blue LED level commanded by the host"),
    Column("Red", "int64", "DAC setting", "External red LED level commanded by the host"),
)

AMBIT_CLOCKS = (
    Clock("t_device_ms", "device_relative", 0.001, "Ambit counter from run start; runs short of host time in both recordings"),
    Clock("t_host_utc", "host_utc", 1.0, "Engine receipt time"),
)


@dataclass(frozen=True)
class AmbitRecording:
    rows: list[dict[str, int]]
    ignored_columns: list[str]


def read_ambit_csv(path: Path) -> AmbitRecording:
    """Reads notebook exports and their spreadsheet-edited copies by header name."""
    with open(path, newline="") as f:
        reader = csv.reader(f)
        header = [HEADER_ALIASES.get(h.strip(), h.strip()) for h in next(reader)]
        index = {name: header.index(name) for name in FIELDS}
        ignored = [h for i, h in enumerate(header) if h and i not in index.values()]
        rows = [{name: int(float(line[i])) for name, i in index.items()} for line in reader if line and line[0].strip()]
    return AmbitRecording(rows, ignored)


@dataclass(frozen=True)
class ProtocolPlan:
    samples: int
    nominal_s: float
    flashes: int
    segments: list[dict[str, Any]]


def expand_protocol(protocol: dict[str, Any]) -> list[list[Any]]:
    blocks = protocol.get("blocks", {})
    steps: list[list[Any]] = []
    for step in protocol["steps"]:
        if isinstance(step, dict):
            steps.extend(blocks[step["block"]] * int(step.get("repeat", 1)))
        else:
            steps.append(step)
    return [[protocol.get("vars", {}).get(x, x) if isinstance(x, str) and x.startswith("$") else x for x in s] for s in steps]


def plan_protocol(protocol: dict[str, Any]) -> ProtocolPlan:
    """Requested timing, as the notebook's print_protocol computes it."""
    flash_level = protocol.get("flash_red_level")
    t, samples, flashes, segments = 0.0, 0, 0, []
    for step in expand_protocol(protocol):
        if step[0] == "M":
            _, n, interval, act = step
            segments.append({"start_s": round(t, 6), "samples": n, "interval_s": interval, "ambit_actinic": act})
            t += n * interval
            samples += n
        elif step[0] == "W":
            t += step[1]
        elif step[0] == "A" and step[1] == "R" and flash_level is not None and step[2] == flash_level:
            flashes += 1
    return ProtocolPlan(samples, round(t, 6), flashes, segments)


def detect_events(rows: list[dict[str, int]], flash_red_level: int) -> list[Event]:
    """Light changes in the recorded host state, and saturation flashes numbered from 1."""
    events, flash, previous = [], 0, None
    for row in rows:
        if previous is not None:
            for key, kind in (("Red", "red_led"), ("ACT", "ambit_actinic"), ("Blue", "blue_led")):
                if row[key] != previous[key]:
                    events.append(Event(kind, f"{key} {previous[key]} to {row[key]}", None, "t_device_ms", row["T"] / 1000, row[key]))
            if row["Red"] == flash_red_level and previous["Red"] != flash_red_level:
                flash += 1
                events.append(Event("sat_flash", f"Saturation flash {flash}", None, "t_device_ms", row["T"] / 1000, flash))
        previous = row
    return events


def timing_summary(rows: list[dict[str, int]], plan: ProtocolPlan | None) -> dict[str, Any]:
    deltas = [b["T"] - a["T"] for a, b in zip(rows, rows[1:])]
    span_s = (rows[-1]["T"] - rows[0]["T"]) / 1000 if rows else 0.0
    summary: dict[str, Any] = {
        "recorded_samples": len(rows),
        "device_span_s": span_s,
        "first_device_ms": rows[0]["T"] if rows else None,
        "gaps_over_150ms": sum(1 for d in deltas if d > 150),
        "largest_gap_ms": max(deltas, default=0),
    }
    if plan:
        summary.update(
            requested_samples=plan.samples,
            requested_s=plan.nominal_s,
            missing_samples=plan.samples - len(rows),
            device_span_minus_requested_s=round(span_s - plan.nominal_s, 3),
        )
    return summary


class AmbitReplay:
    """Replays a recorded Ambit CSV at its own device-time spacing divided by `speed`."""

    def __init__(self, profile: dict[str, Any], csv_path: Path, speed: float, flash_red_level: int) -> None:
        self.profile, self.csv_path, self.speed, self.flash_red_level = profile, csv_path, speed, flash_red_level

    def describe(self) -> InstrumentInfo:
        return InstrumentInfo(
            adapter="ambit_replay",
            model=self.profile.get("model", "Ambit fluorometer with external LED pulser"),
            input_kind="replay",
            capabilities=frozenset({"acquire"}),
            columns=AMBIT_COLUMNS,
            clocks=AMBIT_CLOCKS,
            aliases=dict(self.profile.get("aliases", {})),
        )

    def check_ready(self) -> Readiness:
        if not self.csv_path.exists():
            return Readiness(False, f"Recording not found: {self.csv_path}")
        return Readiness(True, f"Replaying {self.csv_path.name} at {self.speed:g}x")

    def run(self, sink: Sink, stop: threading.Event) -> None:
        recording = read_ambit_csv(self.csv_path)
        events = iter(detect_events(recording.rows, self.flash_red_level))
        next_event = next(events, None)
        previous_t = recording.rows[0]["T"]
        for seq, row in enumerate(recording.rows):
            if stop.wait((row["T"] - previous_t) / 1000 / self.speed):
                return
            previous_t = row["T"]
            received = datetime.now(timezone.utc)
            sink.rows([{"seq": seq, "t_host_utc": received, "t_device_ms": row["T"], **{k: row[k] for k in FIELDS[1:]}}])
            while next_event is not None and next_event.t_native is not None and next_event.t_native * 1000 <= row["T"]:
                sink.event(Event(next_event.kind, next_event.label, received, next_event.clock, next_event.t_native, next_event.value))
                next_event = next(events, None)

    def cancel(self) -> None:
        pass
