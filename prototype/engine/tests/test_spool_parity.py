"""The spool adapter must decode what the legacy reader decodes.

The legacy function is imported unchanged from module1 and run on spool files built in the
layout it parses, with its clock frozen so its relative time column is reproducible.

No real EZView spool is in the repository, so two layouts are tested:
- separated: a blank line follows each frame. The legacy reader reads and discards one line
  after every frame's terminating line (readEZView.py:65 then :57), which is harmless here.
- packed: frames back to back. The discarded line is the next frame's first line, so the
  legacy reader loses frames. The new reader keeps them.
"""

import importlib.util
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from cousinslab.simulate import encode_frame, spool_lines
from cousinslab.spool import SpoolFramer, frame_row, legacy_frame_csv, read_frames

REPO = Path(__file__).resolve().parents[3]
LEGACY_READER = REPO / "module1" / "application" / "read-data" / "readEZView.py"
FROZEN_START = datetime(2026, 9, 30, 9, 0, 0)

FRAMES = [
    {3: 0.8387536992994, 1: 0.0078532281596},
    {3: 0.8425176963779, 1: 0.0078895786891, 5: 0.5, 2: 12.3456},
    {3: 0.29397470695265, 1: 0.00164190367733, 11: 1.1, 12: 0.000999},
    {},
    {3: 0.5, 1: 0.005, 4: 0.0999},
]
STAMPS = [FROZEN_START + timedelta(seconds=1.25 + 0.5 * i, microseconds=137) for i in range(len(FRAMES))]


def write_spool(path: Path, separator: str) -> None:
    path.write_text("".join(spool_lines(t, encode_frame(v, gain="2a7")) + separator for t, v in zip(STAMPS, FRAMES)))


def run_legacy_reader(spool: Path, out_dir: Path, settle_s: float = 1.5) -> list[str]:
    pytest.importorskip("pandas")
    spec = importlib.util.spec_from_file_location("legacy_readEZView", LEGACY_READER)
    legacy = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(legacy)
    finally:
        sys.dont_write_bytecode = False

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return FROZEN_START

    legacy.datetime = FrozenDatetime
    out_dir.mkdir()
    threading.Thread(target=legacy.read_from_ezview, args=(str(out_dir), str(spool)), daemon=True).start()
    time.sleep(settle_s)
    return [(out_dir / f"{k}.csv").read_text() for k in range(len(list(out_dir.glob("*.csv"))))]


def new_reader_csvs(spool: Path) -> list[str]:
    with open(spool) as stream:
        return [legacy_frame_csv(frame_row(f, i, datetime.now(), FROZEN_START)) for i, f in enumerate(read_frames(stream))]


def test_separated_layout_is_byte_identical_to_legacy(tmp_path):
    spool = tmp_path / "spool.txt"
    write_spool(spool, separator="\n")
    legacy = run_legacy_reader(spool, tmp_path / "legacy")
    assert len(legacy) == len(FRAMES)
    assert new_reader_csvs(spool) == legacy


def test_packed_layout_new_reader_keeps_frames_legacy_drops(tmp_path):
    spool = tmp_path / "spool.txt"
    write_spool(spool, separator="")
    legacy = run_legacy_reader(spool, tmp_path / "legacy")
    ours = new_reader_csvs(spool)
    assert len(ours) == len(FRAMES)
    assert legacy == ours[:1], "legacy decodes the first frame, then loses every frame whose first line it discarded"


def test_source_timestamps_are_preserved(tmp_path):
    spool = tmp_path / "spool.txt"
    write_spool(spool, separator="")
    with open(spool) as stream:
        assert [f.source_time for f in read_frames(stream)] == STAMPS


def test_full_precision_values_survive_alongside_legacy_rounding(tmp_path):
    spool = tmp_path / "spool.txt"
    write_spool(spool, separator="")
    with open(spool) as stream:
        first = next(read_frames(stream))
    assert first.value(3) == pytest.approx(0.8387536992994, abs=20 / 234800968)
    assert first.value(9) is None and first.value(10) is None
    assert legacy_frame_csv(frame_row(first, 0, datetime.now(), FROZEN_START)).split(",")[4] == "0.839"


def test_frame_split_across_end_of_file_is_kept():
    first_line, second_line = spool_lines(FROZEN_START, encode_frame(FRAMES[0])).splitlines(keepends=True)
    framer = SpoolFramer()
    assert framer.feed(first_line) is None
    frame = framer.feed(second_line)
    assert frame is not None and frame.source_time == FROZEN_START


def test_value_the_decoder_cannot_produce_is_rejected():
    with pytest.raises(ValueError):
        encode_frame({5: -404.404})


def test_legacy_viewer_file_reader_accepts_exported_frames(tmp_path, monkeypatch):
    pytest.importorskip("pandas")
    read_data = REPO / "module1" / "application" / "read-data"
    monkeypatch.syspath_prepend(str(read_data))
    monkeypatch.setattr(sys, "dont_write_bytecode", True)
    from file import File  # module1's viewer reader, unchanged
    from sharedSingleton import SharedSingleton

    SharedSingleton().initialX = None
    spool = tmp_path / "spool.txt"
    write_spool(spool, separator="")
    with open(spool) as stream:
        frame = next(read_frames(stream))
    exported = tmp_path / "0.csv"
    exported.write_text(legacy_frame_csv(frame_row(frame, 0, datetime.now(), FROZEN_START)))
    x, means = File(str(exported)).__next__()
    assert x == 0.0
    assert means[3] == 0.839 and means[4] == 0.008, "viewer slots m44 and m45 hold ch3 and ch1"
