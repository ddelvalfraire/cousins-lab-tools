"""Real recorded files, aligned the way the researcher aligned them in Excel.

The workbook's sheets 150-pl1 and 150-pl2 re-zero the mass-spec time at rows 7405 and
9683 (3701.772 s and 4840.772 s) and compute ubar CO2 = (m44 - mzero) * 1831.11 with
mzero 0.303 and 0.302. Entering those as explicit event times and trial parameters must
reproduce both sheets, while the stored data keeps its original times.
"""

from pathlib import Path

import pytest

from cousinslab.alignment import aligned_sql, chart_data, metric_series, propose, save_alignment
from cousinslab.importing import import_session
from cousinslab.ms_workbook import read_sample_sheet
from cousinslab.query import connect, open_session, session_events
from cousinslab.session import SessionStore
from cousinslab.templates import REPO_DIR, TemplateStore

REF = REPO_DIR / "reference" / "instruments"
WORKBOOK = REF / "mass-spec" / "Raw data-mass spec.xlsx"
PL1 = REF / "ambit" / "Ambit raw data_sample_150_pl1.csv"
PL2 = REF / "ambit" / "Ambit raw data_sample_150_pl2.csv"

MANUAL = {
    "light-150-pl1": {"ms-workbook": {"clock": "t_elapsed_s", "zero": 3701.772, "method": "Workbook 150-pl1 zero (row 7405)"}},
    "light-150-pl2": {"ms-workbook": {"clock": "t_elapsed_s", "zero": 4840.772, "method": "Workbook 150-pl2 zero (row 9683)"}},
}
TRIAL_PARAMS = {"light-150-pl2": {"co2_zero_mv": 0.302}}


@pytest.fixture(scope="module")
def imported(tmp_path_factory):
    data = tmp_path_factory.mktemp("data")
    template = TemplateStore(data).get("jii-leaf-co2-fluorescence")
    store = SessionStore(data)
    manifest = import_session(store, template, "Sample 150 import", [
        {"role": "ms", "path": str(WORKBOOK), "label": "workbook"},
        {"role": "light", "path": str(PL1), "label": "150-pl1"},
        {"role": "light", "path": str(PL2), "label": "150-pl2"},
    ])
    return store.path(manifest["id"]), manifest


def test_event_alignment_reproduces_both_workbook_sheets(imported):
    session_dir, manifest = imported
    alignment = save_alignment(session_dir, propose(session_dir, manifest, "event", MANUAL, TRIAL_PARAMS))
    assert alignment["unaligned"] == []
    con = connect(session_dir)
    con.execute(f"CREATE VIEW aligned AS {aligned_sql(manifest, alignment)}")
    for trial, sheet in (("light-150-pl1", "150-pl1"), ("light-150-pl2", "150-pl2")):
        expected = {x: ubar for x, ubar in read_sample_sheet(WORKBOOK, sheet)}
        got = con.execute("SELECT x_s, ubar_co2 FROM aligned WHERE trial = ? AND role = 'ms' ORDER BY x_s", [trial]).fetchall()
        assert got[0][0] == pytest.approx(-320, abs=1e-9) and got[-1][0] == pytest.approx(438.5, abs=1e-9)
        assert len(got) == 1518
        for x, ubar in got:
            assert ubar == pytest.approx(expected[round(x * 2) / 2], rel=1e-12, abs=1e-9)


def test_ambit_zero_is_the_detected_fourth_flash_on_the_device_clock(imported):
    session_dir, manifest = imported
    alignment = propose(session_dir, manifest, "event", MANUAL, TRIAL_PARAMS)
    light = {m["capture"]: m for t in alignment["trials"] for m in t["members"] if m["role"] == "light"}
    assert light["light-150-pl1"]["zero"] == pytest.approx(312.231)
    assert light["light-150-pl2"]["zero"] == pytest.approx(304.387)
    assert light["light-150-pl1"]["clock"]["column"] == "t_device_ms"
    assert "Saturation flash 4" in light["light-150-pl1"]["method"]
    assert light["light-150-pl1"]["uncertainty_s"] == pytest.approx(0.1, abs=0.002)


def test_without_entered_event_times_the_mass_spec_is_left_unaligned(imported):
    session_dir, manifest = imported
    alignment = propose(session_dir, manifest, "event")
    reasons = {(u["trial"], u["capture"]): u for u in alignment["unaligned"]}
    assert set(reasons) == {("light-150-pl1", "ms-workbook"), ("light-150-pl2", "ms-workbook")}
    assert all(u["needs_event_time"] for u in reasons.values())
    assert all(m["role"] == "light" for t in alignment["trials"] for m in t["members"])


def test_clock_alignment_is_refused_when_no_clock_time_was_recorded(imported):
    session_dir, manifest = imported
    alignment = propose(session_dir, manifest, "clock")
    assert alignment["trials"][0]["members"] == []
    assert len(alignment["unaligned"]) == 3
    assert all("Records no clock time" in u["reason"] for u in alignment["unaligned"])


def test_elapsed_alignment_uses_each_instruments_own_start(imported):
    session_dir, manifest = imported
    alignment = propose(session_dir, manifest, "elapsed")
    zeros = {m["capture"]: (m["zero"], m["clock"]["column"]) for t in alignment["trials"] for m in t["members"]}
    assert zeros["ms-workbook"] == (0.0, "t_elapsed_s")
    assert zeros["light-150-pl1"] == (0.0, "t_device_ms")


def test_original_timestamps_are_stored_unchanged(imported):
    session_dir, _ = imported
    con = connect(session_dir)
    assert con.execute('SELECT min(t_elapsed_s), max(t_elapsed_s), count(*) FROM "cap:ms-workbook"').fetchone() == (0.272, 13429.272, 26859)
    assert con.execute('SELECT min(t_device_ms), max(t_device_ms) FROM "cap:light-150-pl1"').fetchone() == (9, 756118)


def test_ambit_requested_versus_recorded_timing(imported):
    _, manifest = imported
    timing = manifest["captures"]["light-150-pl1"]["timing"]
    assert (timing["requested_samples"], timing["recorded_samples"], timing["missing_samples"]) == (8010, 7956, 54)
    assert timing["requested_s"] == 755.5 and timing["device_span_s"] == pytest.approx(756.109)


def test_notebook_helper_sees_the_same_aligned_view(imported):
    session_dir, manifest = imported
    saved = save_alignment(session_dir, propose(session_dir, manifest, "event", MANUAL, TRIAL_PARAMS))
    con = open_session(session_dir, saved["id"])
    n = con.execute("SELECT count(*) FROM aligned WHERE role = 'ms'").fetchone()[0]
    assert n == 2 * 1518


def test_metric_values_are_served_on_the_same_axis_as_the_charts(imported):
    session_dir, manifest = imported
    alignment = propose(session_dir, manifest, "event", MANUAL, TRIAL_PARAMS)
    charts = {c["id"]: c for c in chart_data(session_dir, manifest, alignment)}
    values = metric_series(session_dir, manifest, alignment)
    assert set(values) == {"ubar_co2", "fluorescence"}
    assert [s["points"] for s in values["ubar_co2"]] == [s["points"] for s in charts["co2"]["series"]]
    assert [s["trial"] for s in values["fluorescence"]] == ["light-150-pl1", "light-150-pl2"]


def test_imported_events_keep_their_native_time_and_have_no_run_clock(imported):
    session_dir, manifest = imported
    flashes = [e for e in session_events(session_dir, manifest) if e["kind"] == "sat_flash"]
    light = {cid for cid, c in manifest["captures"].items() if c["role"] == "light"}
    assert {e["source"] for e in flashes} == light
    assert all(e["x_run_s"] is None and e["t_host_utc"] is None and e["t_native"] > 0 for e in flashes)
    per_capture = [[e["t_native"] for e in flashes if e["source"] == cid] for cid in sorted(light)]
    assert all(times == sorted(times) and len(times) == 14 for times in per_capture)
