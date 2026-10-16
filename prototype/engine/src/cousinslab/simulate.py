"""Writes a simulated EZView spool so the spool adapter can run without the instrument.

The values come from a recording; the timestamps are this machine's clock at write time.
The line layout follows what readEZView.py parses. No real spool file has been checked
against it yet, so the trailing timestamp digits and line splitting are assumptions.
"""

from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Sequence

from .spool import CHANNEL_RANGES, FULL_SCALE_COUNTS, TERMINATOR

FIRST_LINE_HEX_CHARS = 56


def encode_counts(channel: int, value: float) -> int:
    scale = CHANNEL_RANGES[channel]
    assert scale is not None, f"ch{channel} is not decoded"
    counts = round(value / scale * FULL_SCALE_COUNTS)
    if not 0 <= counts < 1 << 28:
        raise ValueError(f"ch{channel}={value} cannot be represented: the decoder zeroes the first hex digit")
    return counts


def encode_frame(values: dict[int, float], gain: str = "000") -> str:
    words = "".join(f"{encode_counts(ch, values[ch]) if ch in values else 0:08x}" for ch in range(1, 13))
    return words + "0" + gain + TERMINATOR


def spool_lines(when: datetime, frame_hex: str) -> str:
    stamp = when.strftime("%m/%d/%y %H:%M:%S.%f") + "0000"
    head, tail = frame_hex[:FIRST_LINE_HEX_CHARS], frame_hex[FIRST_LINE_HEX_CHARS:]
    return f"{stamp}\t{head}\n{stamp}\t{tail}\n"


class SpoolSimulator:
    """Appends frames to `path` at the recording's own spacing divided by `speed`."""

    def __init__(self, path: Path, times_s: Sequence[float], values: Sequence[dict[int, float]], speed: float) -> None:
        self.path, self.times_s, self.values, self.speed = path, times_s, values, speed
        self.frames_written = 0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._run, name="ezview-simulator", daemon=True)

    def start(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch()
        self.thread.start()

    def _run(self) -> None:
        with open(self.path, "a", newline="") as spool:
            previous = self.times_s[0]
            for t, values in zip(self.times_s, self.values):
                if self.stop.wait((t - previous) / self.speed):
                    return
                previous = t
                spool.write(spool_lines(datetime.now(), encode_frame(values)))
                spool.flush()
                self.frames_written += 1

    def close(self) -> None:
        self.stop.set()
        self.thread.join(timeout=5)
