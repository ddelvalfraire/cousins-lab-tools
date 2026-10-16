"""EZView spool acquisition, decoded exactly as module1/application/read-data/readEZView.py does.

EZView writes one text line per serial chunk: `<MM/DD/YY HH:MM:SS.fraction><TAB><hex>`.
A frame is the hex accumulated until it ends in `ffffffff`; the 100 hex characters before
the terminator hold twelve 32-bit words and a gain field. Each word's first hex digit is
forced to 0, then it is read as a big-endian int32 and scaled by `count / 234800968 * range`.

Differences from the legacy reader, both deliberate:
- A frame split across the current end of file is kept and finished on the next poll.
  The legacy loop discarded it.
- Values are stored at full precision with the raw counts. The legacy CSV rounded to three
  decimals; the legacy-frames export reproduces that rounding.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, TextIO

from .contract import Clock, Column, InstrumentInfo, Readiness, Sink

FULL_SCALE_COUNTS = 234800968
TERMINATOR = "ffffffff"
TIMESTAMP_FORMAT = "%m/%d/%y %H:%M:%S.%f"
TIMESTAMP_TRAILING_CHARS = 4

CHANNEL_RANGES: dict[int, float | None] = {
    1: 0.2, 2: 20.0, 3: 20.0, 4: 0.1, 5: 1.0, 6: 1.0,
    7: 1.0, 8: 1.0, 9: None, 10: None, 11: 1.0, 12: 1.0,
}
"""Range factor per channel. The legacy reader sets ch9 and ch10 to NaN, so they have no value."""

LEGACY_FRAME_COLUMN_ORDER = ["t_legacy_ms", "ch5", "ch2", "ch4", "ch3", "ch1", "ch6", "ch7", "ch8", "ch11", "ch12"]
"""Column order of the legacy frame CSVs after the drop and the two swaps in readEZView.py:102-117."""


@dataclass(frozen=True)
class SpoolFrame:
    source_time: datetime
    counts: tuple[int, ...]
    gain: str

    def value(self, channel: int) -> float | None:
        scale = CHANNEL_RANGES[channel]
        return None if scale is None else self.counts[channel - 1] / FULL_SCALE_COUNTS * scale


def parse_timestamp(text: str) -> datetime:
    return datetime.strptime(text[:-TIMESTAMP_TRAILING_CHARS], TIMESTAMP_FORMAT)


def decode_payload(payload: str) -> tuple[tuple[int, ...], str]:
    counts = tuple(
        int.from_bytes(bytes.fromhex("0" + payload[8 * k + 1 : 8 * k + 8]), "big", signed=True)
        for k in range(12)
    )
    return counts, "0" + payload[97:]


class SpoolFramer:
    """Turns complete spool lines into frames, holding a partial frame between calls."""

    def __init__(self) -> None:
        self._hex = ""
        self._time: datetime | None = None

    def feed(self, line: str) -> SpoolFrame | None:
        chunks = line.strip().split("\t")
        if len(chunks) < 2:
            return None
        if not self._hex:
            self._time = parse_timestamp(chunks[0])
        self._hex += chunks[1].strip()
        if not self._hex.endswith(TERMINATOR):
            return None
        payload, frame_time = self._hex[-108:-8], self._time
        self._hex, self._time = "", None
        if len(payload) != 100 or frame_time is None:
            return None
        counts, gain = decode_payload(payload)
        return SpoolFrame(frame_time, counts, gain)


def read_frames(stream: TextIO) -> Iterator[SpoolFrame]:
    framer = SpoolFramer()
    for line in stream:
        if (frame := framer.feed(line)) is not None:
            yield frame


def frame_row(frame: SpoolFrame, seq: int, received: datetime, run_start_local: datetime) -> dict[str, Any]:
    row: dict[str, Any] = {
        "seq": seq,
        "t_host_utc": received,
        "t_source_local": frame.source_time,
        "t_legacy_ms": int((frame.source_time - run_start_local).total_seconds() * 1000),
        "gain": frame.gain,
    }
    for ch in range(1, 13):
        row[f"ch{ch}"] = frame.value(ch)
        row[f"ch{ch}_counts"] = frame.counts[ch - 1]
    return row


def legacy_frame_csv(row: dict[str, Any]) -> str:
    """One frame as the legacy reader wrote it: headerless, rounded to 3 decimals, LF ending.

    pandas wrote the time column as a float ("1250.0") because it was concatenated onto an
    empty frame; that is pandas-version behavior observed here, not a documented format.
    """
    cells = [repr(float(row["t_legacy_ms"]))] + [repr(round(row[c], 3)) for c in LEGACY_FRAME_COLUMN_ORDER[1:]]
    return ",".join(cells) + "\n"


SPOOL_COLUMNS = (
    Column("seq", "int64", description="Frame number within this capture"),
    Column("t_host_utc", "timestamp_utc", description="When the engine decoded the frame (host clock)"),
    Column("t_source_local", "timestamp_local", description="Timestamp EZView wrote on the frame's first line"),
    Column("t_legacy_ms", "int64", "ms", "Legacy time: frame timestamp minus engine start, as readEZView.py:76"),
    Column("gain", "string", description="Gain field, dropped by the legacy CSV"),
    *(
        Column(f"ch{ch}", "float64", "legacy scaled units (unverified; viewer labels mV)",
               f"count / {FULL_SCALE_COUNTS} x {CHANNEL_RANGES[ch]}" if CHANNEL_RANGES[ch] else "Not decoded by legacy")
        for ch in range(1, 13)
    ),
    *(Column(f"ch{ch}_counts", "int64", "counts", "Raw word with first hex digit zeroed") for ch in range(1, 13)),
)

SPOOL_CLOCKS = (
    Clock("t_source_local", "source_local", 1.0, "EZView frame timestamp; which PC clock writes it is unverified"),
    Clock("t_host_utc", "host_utc", 1.0, "Engine receipt time; includes spool write and poll delay"),
)


class EZViewSpool:
    """Tails an EZView spool file. Reads from the beginning, as the legacy reader did."""

    def __init__(self, profile: dict[str, Any], spool_path: Path | None, input_kind: str) -> None:
        self.profile = profile
        self.spool_path = spool_path
        self.input_kind = input_kind
        self.poll_interval_s = float(profile.get("settings", {}).get("poll_interval_s", 0.1))

    def describe(self) -> InstrumentInfo:
        return InstrumentInfo(
            adapter="ezview_spool",
            model=self.profile.get("model", "Mass spectrometer via EZ-Tap and EZView"),
            input_kind=self.input_kind,  # type: ignore[arg-type]
            capabilities=frozenset({"acquire"}),
            columns=SPOOL_COLUMNS,
            clocks=SPOOL_CLOCKS,
            aliases=dict(self.profile.get("aliases", {})),
        )

    def check_ready(self) -> Readiness:
        if self.spool_path is None:
            return Readiness(False, "No spool file configured. Set settings.spool_path in the instrument profile.")
        if not self.spool_path.exists():
            return Readiness(False, f"Spool file not found: {self.spool_path}. Is EZView spooling?")
        return Readiness(True, f"Spool file present: {self.spool_path.name}")

    def run(self, sink: Sink, stop: threading.Event) -> None:
        assert self.spool_path is not None
        framer, seq, pending = SpoolFramer(), 0, ""
        run_start_local = datetime.now()
        with open(self.spool_path, "r", newline="") as spool:
            while not stop.is_set():
                chunk = spool.read()
                if not chunk:
                    stop.wait(self.poll_interval_s)
                    continue
                received = datetime.now(timezone.utc)
                lines = (pending + chunk).split("\n")
                pending = lines.pop()
                rows = []
                for line in lines:
                    if (frame := framer.feed(line)) is not None:
                        rows.append(frame_row(frame, seq, received, run_start_local))
                        seq += 1
                if rows:
                    sink.rows(rows)

    def cancel(self) -> None:
        pass

