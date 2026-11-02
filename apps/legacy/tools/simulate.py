"""Replay a recorded acquisition into a folder, one CSV at a time.

The mass spectrometer writes one CSV per scan into an acquisition folder.
This script copies the CSVs of a recorded acquisition into an output folder
in scan order, so Module 1 or Module 2 can watch the folder as if the
instrument were running.

Run it from apps/legacy:

    python tools/simulate.py

Then choose the output folder (tools/output/acquisition by default) as the
acquisition folder in the app. The script clears that folder before it
starts. By default it replays Acquisition-4971 from
reference/instruments/mass-spec/acquisitions.
"""

import argparse
import shutil
import time
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = (
    REPO_ROOT / "reference/instruments/mass-spec/acquisitions/Acquisition-4971.zip"
)
DEFAULT_DESTINATION = Path(__file__).resolve().parent / "output" / "acquisition"


def clear_folder(folder):
    """Create the folder if needed and delete everything in it."""
    folder.mkdir(parents=True, exist_ok=True)
    for path in folder.iterdir():
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        else:
            path.unlink()


def numbered_csvs(archive):
    """Return the archive's numbered CSVs in scan order: 1.csv, 2.csv, ..."""
    members = [
        member
        for member in archive.infolist()
        if not member.is_dir()
        and Path(member.filename).suffix == ".csv"
        and Path(member.filename).stem.isdigit()
    ]
    return sorted(members, key=lambda member: int(Path(member.filename).stem))


def replay(source, destination, interval):
    """Copy each CSV in the source zip into the destination, then wait."""
    clear_folder(destination)
    with zipfile.ZipFile(source) as archive:
        for member in numbered_csvs(archive):
            name = Path(member.filename).name
            # Write the file in place. The app only notices files that are
            # created in the folder, not files renamed into it.
            with archive.open(member) as src, (destination / name).open("wb") as dest:
                shutil.copyfileobj(src, dest)
            print(f"Copied {name} to {destination}")
            time.sleep(interval)
    print("Done copying all CSVs!")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Replay a recorded acquisition into a folder, one CSV at a time."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="zip of an acquisition folder (default: Acquisition-4971)",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=DEFAULT_DESTINATION,
        help="folder to copy the CSVs into (default: tools/output/acquisition)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.1,
        help="seconds to wait between files (default: 0.1)",
    )
    args = parser.parse_args(argv)
    replay(args.source, args.dest, args.interval)


if __name__ == "__main__":
    main()
