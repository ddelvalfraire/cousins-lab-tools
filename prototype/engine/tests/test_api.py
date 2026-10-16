"""The API the UI calls, exercised without a browser."""

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
