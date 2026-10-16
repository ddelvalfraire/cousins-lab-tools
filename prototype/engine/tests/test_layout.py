"""The run-page layout is template configuration: defaults, validation, and role-driven visibility."""

import copy
import re

import pytest

from cousinslab.templates import TemplateError, TemplateStore, load_profiles, validate

TEMPLATE = "jii-leaf-co2-fluorescence"


@pytest.fixture
def data(tmp_path):
    return copy.deepcopy(TemplateStore(tmp_path).get(TEMPLATE).data)


def with_layout(data, *components, views=None):
    data["layout"] = {"views": views or [{"id": "run", "name": "Run", "components": list(components)}]}
    return data


def test_sizes_default_by_kind_and_unplaced_components_stack_below_the_last_one(data):
    template = validate(with_layout(
        data,
        {"id": "co2", "kind": "chart", "chart": "co2"},
        {"id": "now", "kind": "metric", "value": "ubar_co2", "x": 8, "y": 0},
        {"id": "ctl", "kind": "controls"},
        {"id": "caps", "kind": "captures"},
        {"id": "params", "kind": "inputs"},
        {"id": "box", "kind": "group", "components": [{"id": "inner", "kind": "metric", "value": "fluorescence"}]},
    ), load_profiles())
    placed = {c["id"]: (c["x"], c["y"], c["w"], c["h"]) for c in template.layout()["views"][0]["components"]}
    assert placed == {
        "co2": (0, 0, 8, 4),
        "now": (8, 0, 4, 2),
        "ctl": (0, 4, 4, 3),
        "caps": (0, 7, 12, 3),
        "params": (0, 10, 6, 4),
        "box": (0, 14, 12, 5),
    }
    assert template.layout()["views"][0]["components"][-1]["components"][0]["w"] == 4


def test_a_template_without_a_layout_gets_one_view_with_every_chart_then_controls_and_captures(data):
    data.pop("layout", None)
    layout = validate(data, load_profiles()).layout()
    assert layout["columns"] == 12 and len(layout["views"]) == 1
    components = layout["views"][0]["components"]
    assert [(c["kind"], c.get("chart")) for c in components] == [
        ("chart", "co2"), ("chart", "fluorescence"), ("chart", "mass44"), ("controls", None), ("captures", None)]
    assert [(c["x"], c["y"], c["w"], c["h"]) for c in components] == [
        (0, 0, 6, 4), (6, 0, 6, 4), (0, 4, 6, 4), (0, 8, 4, 3), (4, 8, 8, 3)]


@pytest.mark.parametrize("components, message", [
    ([{"id": "a", "kind": "sparkline"}], "unknown kind 'sparkline'"),
    ([{"id": "a", "kind": "calibration"}], "no calibration model"),
    ([{"id": "a", "kind": "metric", "value": "ubar_co2", "x": 10, "w": 4}], "outside the 12-column grid"),
    ([{"id": "a", "kind": "metric", "value": "ubar_co2", "h": 0}], "outside the 12-column grid"),
    ([{"id": "a", "kind": "metric", "value": "ubar_co2", "x": "left"}], "x, y, w and h must be whole numbers"),
    ([{"id": "a", "kind": "chart", "chart": "co2", "x": 0, "y": 0},
      {"id": "b", "kind": "metric", "value": "ubar_co2", "x": 6, "y": 2}], "'a' and 'b' overlap"),
    ([{"id": "a", "kind": "chart", "chart": "o2"}], "unknown chart 'o2'"),
    ([{"id": "a", "kind": "chart"}], "unknown chart None"),
    ([{"id": "a", "kind": "metric", "value": "m44"}], "'m44' is not a derived value"),
    ([{"id": "a", "kind": "controls", "role": "pulser"}], "unknown role 'pulser'"),
    ([{"id": "a", "kind": "inputs", "parameters": ["gain"]}], "unknown parameters ['gain']"),
    ([{"id": "a", "kind": "controls"}, {"id": "a", "kind": "captures"}], "'a' is defined twice"),
    ([{"id": "g", "kind": "group", "components": [{"id": "x", "kind": "chart", "chart": "nope"}]}], "unknown chart 'nope'"),
])
def test_invalid_layouts_are_rejected_with_the_reason(data, components, message):
    with pytest.raises(TemplateError, match=re.escape(message)):
        validate(with_layout(data, *components), load_profiles())


def test_a_layout_needs_at_least_one_view_and_unique_view_ids(data):
    data["layout"] = {"views": []}
    with pytest.raises(TemplateError, match="non-empty list"):
        validate(data, load_profiles())
    twice = [{"id": "run", "components": []}, {"id": "run", "components": []}]
    with pytest.raises(TemplateError, match="view 'run' is defined twice"):
        validate(with_layout(data, views=twice), load_profiles())


def test_components_bound_to_an_excluded_role_are_hidden_and_the_rest_stay(data):
    data["roles"]["light"]["enabled"] = False
    template = validate(with_layout(
        data,
        {"id": "co2", "kind": "chart", "chart": "co2", "w": 4},
        {"id": "fl", "kind": "chart", "chart": "fluorescence", "x": 4, "y": 0, "w": 4},
        {"id": "fl-now", "kind": "metric", "value": "fluorescence", "x": 8, "y": 0},
        {"id": "light-ctl", "kind": "controls", "role": "light"},
        {"id": "ctl", "kind": "controls"},
        {"id": "box", "kind": "group", "components": [{"id": "inner", "kind": "metric", "value": "fluorescence"}]},
    ), load_profiles())
    assert template.hidden_components() == {
        "fl": "Every role in chart fluorescence is excluded",
        "fl-now": "Role light is excluded",
        "light-ctl": "Role light is excluded",
        "inner": "Role light is excluded",
        "box": "Every component in the group is hidden",
    }
