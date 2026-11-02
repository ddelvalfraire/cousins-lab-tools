"""Tests for the acquisition and EZView simulators in tools/."""

import zipfile

from tools import EZviewTest, simulate


def make_zip(path, files):
    with zipfile.ZipFile(path, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return path


def test_simulate_copies_numbered_csvs_in_scan_order(tmp_path, capsys):
    source = make_zip(
        tmp_path / "Acquisition-1.zip",
        {
            "Acquisition-1/10.csv": "ten",
            "Acquisition-1/2.csv": "two",
            "Acquisition-1/1.csv": "one",
            "Acquisition-1/notes.txt": "not a scan",
        },
    )
    dest = tmp_path / "out"
    dest.mkdir()
    (dest / "old.csv").write_text("left over from the last run")

    simulate.replay(source, dest, interval=0)

    assert sorted(p.name for p in dest.iterdir()) == ["1.csv", "10.csv", "2.csv"]
    assert (dest / "10.csv").read_text() == "ten"
    copied = [line.split()[1] for line in capsys.readouterr().out.splitlines()[:-1]]
    assert copied == ["1.csv", "2.csv", "10.csv"]


def test_ezview_copies_the_recording_unchanged_and_stops_at_the_end(tmp_path):
    recording = "".join(
        f"03/27/26 09:27:54.{i:03}.000\t{i:02x} \t0\t\t\t\r\n" for i in range(250)
    )
    source = make_zip(tmp_path / "ezview.zip", {"EZView Data.txt": recording})
    dest = tmp_path / "out" / "EZView_DataCopy.txt"

    EZviewTest.replay(source, dest, interval=0)

    assert dest.read_bytes() == recording.encode()


def test_default_sources_hold_the_recorded_data():
    with zipfile.ZipFile(simulate.DEFAULT_SOURCE) as archive:
        assert len(simulate.numbered_csvs(archive)) == 11223
    with zipfile.ZipFile(EZviewTest.DEFAULT_SOURCE) as archive:
        assert archive.namelist() == ["EZView Data - 03_27_2026_09_27_51.txt"]
