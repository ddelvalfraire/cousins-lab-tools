"""Replay an EZView recording into a file, a few lines at a time.

EZView logs the mass spectrometer's raw data stream to a text file as it
arrives. This script copies a recorded EZView file into an output file in
small batches, so Module 1 or Module 2 can read it as if the instrument were
running.

Run it from apps/legacy:

    python tools/EZviewTest.py

Then choose the output file (tools/output/EZView_DataCopy.txt by default)
with "Load EZView Data File" in the app. The script replaces that file before
it starts and stops at the end of the recording. By default it replays the
recording in reference/instruments/mass-spec/ezview.
"""

import argparse
import io
import random
import time
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = (
    REPO_ROOT
    / "reference/instruments/mass-spec/ezview/EZView Data - 03_27_2026_09_27_51.zip"
)
DEFAULT_DESTINATION = Path(__file__).resolve().parent / "output" / "EZView_DataCopy.txt"


def replay(source, destination, interval):
    """Append the zipped recording to the destination, 80-100 lines per batch."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        (member,) = [m for m in archive.infolist() if not m.is_dir()]
        with (
            io.TextIOWrapper(archive.open(member), newline="") as src,
            destination.open("w", newline="") as dest,
        ):
            while True:
                # Vary the batch size, as the instrument's output does.
                for _ in range(random.randint(80, 100)):
                    line = src.readline()
                    if not line:
                        print("Done copying the EZView recording!")
                        return
                    dest.write(line)
                    dest.flush()  # Make sure it's written to disk immediately
                    print("Copied line:", line.strip())
                time.sleep(interval)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Replay an EZView recording into a file, a few lines at a time."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="zip that holds one EZView text file (default: the 03/27/2026 recording)",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=DEFAULT_DESTINATION,
        help="file to write (default: tools/output/EZView_DataCopy.txt)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.08,
        help="seconds to wait between batches (default: 0.08)",
    )
    args = parser.parse_args(argv)
    replay(args.source, args.dest, args.interval)


if __name__ == "__main__":
    main()
