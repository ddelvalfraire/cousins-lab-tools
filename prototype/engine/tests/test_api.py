"""The API the UI calls, exercised without a browser."""

import time

import pytest

from cousinslab.server import ApiError, App

TEMPLATE = "jii-leaf-co2-fluorescence"


@pytest.fixture
def app(tmp_path):
    return App(tmp_path)


def test_template_edit_becomes_a_new_revision_and_the_old_one_is_unchanged(app):
    data = app.get_template({}, {}, TEMPLATE)["data"]
    data["roles"]["light"]["start_delay_s"] = 120
    saved = app.save_template({"data": data}, {}, TEMPLATE)
    assert saved["data"]["revision"] == 2 and saved["revisions"] == [1, 2]
    assert app.get_template({}, {"revision": ["1"]}, TEMPLATE)["data"]["roles"]["light"]["start_delay_s"] == 30


def test_invalid_template_edit_is_rejected_with_the_reason(app):
    data = app.get_template({}, {}, TEMPLATE)["data"]
    data["derived"]["ubar_co2"]["expr"] = "(m44 - not_a_parameter) * ubar_per_mv"
    with pytest.raises(ApiError) as error:
        app.save_template({"data": data}, {}, TEMPLATE)
    assert error.value.status == 422 and "not_a_parameter" in str(error.value)


def test_hardware_profile_runs_only_in_real_time_and_reports_why_it_is_not_ready(app):
    data = app.get_template({}, {}, TEMPLATE)["data"]
    data["roles"]["ms"]["instrument"] = "ms2-ezview"
    revision = app.save_template({"data": data}, {}, TEMPLATE)["data"]["revision"]
    with pytest.raises(ApiError, match="real time"):
        app.start_run({"template_id": TEMPLATE, "revision": revision, "speed": 20}, {})
    manifest = app.start_run({"template_id": TEMPLATE, "revision": revision, "speed": 1}, {})
    assert manifest["status"] == "not_ready"
    assert "No spool file configured" in manifest["captures"]["ms"]["readiness"]["detail"]


def test_template_view_carries_the_layout_and_what_an_excluded_role_hides(app):
    view = app.get_template({}, {}, TEMPLATE)
    acquisition = {c["id"]: c for c in view["layout"]["views"][0]["components"]}
    assert (acquisition["co2-chart"]["x"], acquisition["fluorescence-chart"]["x"]) == (0, 4), "charts side by side"
    assert {acquisition[k]["value"] for k in ("co2-now", "fluorescence-now")} == {"ubar_co2", "fluorescence"}
    assert acquisition["captures"]["y"] == max(c["y"] + c["h"] for c in acquisition.values() if c["id"] != "captures")
    assert view["hidden_components"] == {}

    view["data"]["roles"]["light"]["enabled"] = False
    r2 = app.save_template({"data": view["data"]}, {}, TEMPLATE)
    assert r2["hidden_components"] == {"fluorescence-chart": "Every role in chart fluorescence is excluded",
                                       "fluorescence-now": "Role light is excluded"}
    assert r2["layout"] == view["layout"], "hiding is resolved per revision; the stored layout is untouched"


def test_layout_edit_becomes_a_new_revision_and_the_old_layout_is_unchanged(app):
    data = app.get_template({}, {}, TEMPLATE)["data"]
    data["layout"]["views"].reverse()
    data["layout"]["views"][1]["components"][0]["x"] = 4
    data["layout"]["views"][1]["components"][1]["x"] = 0
    r2 = app.save_template({"data": data}, {}, TEMPLATE)
    assert [v["id"] for v in r2["layout"]["views"]] == ["signals", "acquisition"]
    assert [c["x"] for c in r2["layout"]["views"][1]["components"][:2]] == [4, 0]
    r1 = app.get_template({}, {"revision": ["1"]}, TEMPLATE)
    assert [v["id"] for v in r1["layout"]["views"]] == ["acquisition", "signals"]
    assert r1["layout"]["views"][0]["components"][0]["x"] == 0


def test_overlapping_layout_edit_is_rejected_with_the_reason(app):
    data = app.get_template({}, {}, TEMPLATE)["data"]
    data["layout"]["views"][0]["components"][1]["x"] = 2
    with pytest.raises(ApiError) as error:
        app.save_template({"data": data}, {}, TEMPLATE)
    assert error.value.status == 422 and "'co2-chart' and 'fluorescence-chart' overlap" in str(error.value)


def test_a_finished_run_serves_its_events_and_replay_values_without_changing_stored_files(app):
    manifest = app.start_run({"template_id": TEMPLATE, "speed": 50}, {})
    run = app.runs[manifest["id"]]
    deadline = time.monotonic() + 20
    while run.manifest["captures"]["light"]["rows"] < 200 and time.monotonic() < deadline:
        time.sleep(0.05)
    app.mark({"event": "closed_system"}, {}, manifest["id"])
    run.stop()
    session_dir = app.session_dir(manifest["id"])
    before = {p: p.read_bytes() for p in session_dir.rglob("*.parquet")}

    events = app.events({}, {}, manifest["id"])
    assert [e["kind"] for e in events if e["source"] == "operator"] == ["closed_system"]
    for reference in ("event", "elapsed", "clock"):
        view = app.preview_alignment({"reference": reference}, {}, manifest["id"])
        assert view["values"]["ubar_co2"][0]["points"] and view["values"]["fluorescence"][0]["points"]
    assert {p: p.read_bytes() for p in session_dir.rglob("*.parquet")} == before
