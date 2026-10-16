"""The instrument contract every adapter implements.

An adapter describes what it records (columns, clocks, capabilities), reports whether it
is ready, and runs a blocking acquisition loop that pushes rows and events into a sink
until asked to stop. Rows carry every timestamp the source provides; nothing is rewritten.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol

InputKind = Literal["hardware", "simulated", "replay", "import"]
ColumnType = Literal["int64", "float64", "string", "timestamp_utc", "timestamp_local"]
ClockKind = Literal["host_utc", "source_local", "device_relative", "elapsed"]

INPUT_KIND_LABELS = {
    "hardware": "Hardware",
    "simulated": "Simulated input",
    "replay": "Replay of a recording",
    "import": "Imported file",
}


@dataclass(frozen=True)
class Column:
    name: str
    type: ColumnType
    unit: str = ""
    description: str = ""


@dataclass(frozen=True)
class Clock:
    """A time column and what it means. `seconds_per_unit` converts the stored value to seconds."""

    column: str
    kind: ClockKind
    seconds_per_unit: float
    description: str


@dataclass(frozen=True)
class InstrumentInfo:
    adapter: str
    model: str
    input_kind: InputKind
    capabilities: frozenset[str]
    columns: tuple[Column, ...]
    clocks: tuple[Clock, ...]
    aliases: dict[str, str] = field(default_factory=dict)

    def column(self, name: str) -> Column:
        return next(c for c in self.columns if c.name == self.aliases.get(name, name))


@dataclass(frozen=True)
class Readiness:
    ok: bool
    detail: str


@dataclass(frozen=True)
class Event:
    kind: str
    label: str
    t_host_utc: datetime | None
    clock: str | None = None
    t_native: float | None = None
    value: float | None = None
    payload: dict[str, Any] = field(default_factory=dict)


class Sink(Protocol):
    def rows(self, rows: list[dict[str, Any]]) -> None: ...

    def event(self, event: Event) -> None: ...


class Instrument(Protocol):
    def describe(self) -> InstrumentInfo: ...

    def check_ready(self) -> Readiness: ...

    def run(self, sink: Sink, stop: threading.Event) -> None:
        """Acquire until `stop` is set or the source ends. Raise to report a failure."""
        ...

    def cancel(self) -> None:
        """Drive the device to a safe state immediately. Passive sources do nothing."""
        ...
