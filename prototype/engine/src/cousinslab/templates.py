"""Experiment templates and instrument profiles: loading, validation, revisions, expressions.

Templates are YAML. Built-in templates live in `engine/templates/`; every saved edit
becomes a new immutable revision under `data/templates/<id>/`. Sessions keep a copy of the
revision they ran with, so later edits never change what a past run meant.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import yaml

from .ambit import AMBIT_COLUMNS, plan_protocol
from .ms_workbook import MS_IMPORT_COLUMNS
from .spool import SPOOL_COLUMNS

ENGINE_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = ENGINE_DIR.parents[1]
BUILTIN_TEMPLATES = ENGINE_DIR / "templates"
INSTRUMENT_DIR = ENGINE_DIR / "instruments"

ADAPTER_COLUMNS = {
    "ezview_spool": {c.name for c in SPOOL_COLUMNS},
    "ambit_replay": {c.name for c in AMBIT_COLUMNS},
}
IMPORT_COLUMNS = {
    "ms_workbook": {c.name for c in MS_IMPORT_COLUMNS},
    "ambit_csv": {c.name for c in AMBIT_COLUMNS},
}
ON_FAILURE = {"continue_others", "stop_group"}
REFERENCES = {"clock", "elapsed", "event"}

GRID_COLUMNS = 12
COMPONENT_SIZES = {"chart": (8, 4), "metric": (4, 2), "controls": (4, 3), "inputs": (6, 4), "captures": (12, 3), "group": (12, 5)}
UNSUPPORTED_KINDS = {"calibration": "the engine has no calibration model yet"}


class TemplateError(ValueError):
    pass


def resolve_path(text: str) -> Path:
    return Path(text.replace("${repo}", str(REPO_DIR)))


def load_profiles() -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in (yaml.safe_load(f.read_text()) for f in sorted(INSTRUMENT_DIR.glob("*.yaml")))}


_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d*)?(?:[eE][-+]?\d+)?)|([A-Za-z_]\w*)|([-+*/()]))")


@dataclass(frozen=True)
class Expression:
    text: str
    names: frozenset[str]
    tokens: tuple[tuple[str, str], ...]

    def sql(self, params: dict[str, float]) -> str:
        return "".join(repr(float(params[v])) if k == "name" and v in params else f'"{v}"' if k == "name" else v
                       for k, v in self.tokens)

    def python(self, params: dict[str, float]) -> Callable[[dict[str, Any]], float | None]:
        source = "".join(repr(float(params[v])) if k == "name" and v in params else f"r[{v!r}]" if k == "name" else v
                         for k, v in self.tokens)
        code = compile(source, "<derived>", "eval")

        def evaluate(r: dict[str, Any]) -> float | None:
            try:
                return eval(code, {"__builtins__": {}}, {"r": r})
            except (TypeError, ZeroDivisionError):
                return None

        return evaluate


def parse_expression(text: str) -> Expression:
    """Arithmetic over column and parameter names only, so it is safe to embed in SQL and Python."""
    tokens, pos = [], 0
    while pos < len(text.rstrip()):
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            raise TemplateError(f"Unsupported syntax in expression {text!r} at position {pos}")
        number, name, op = m.groups()
        tokens.append(("number", number) if number else ("name", name) if name else ("op", op))
        pos = m.end()
    return Expression(text, frozenset(v for k, v in tokens if k == "name"), tuple(tokens))


def default_layout(data: dict[str, Any]) -> dict[str, Any]:
    charts = [{"id": f"chart-{c['id']}", "kind": "chart", "chart": c["id"], "x": i % 2 * 6, "y": i // 2 * 4, "w": 6, "h": 4}
              for i, c in enumerate(data.get("charts", []))]
    bottom = (len(charts) + 1) // 2 * 4
    return {"views": [{"id": "run", "name": "Run", "components": [
        *charts,
        {"id": "controls", "kind": "controls", "x": 0, "y": bottom, "w": 4, "h": 3},
        {"id": "captures", "kind": "captures", "x": 4, "y": bottom, "w": 8, "h": 3},
    ]}]}


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _place(items: list[Any], prefix: str) -> list[Any]:
    """Fill per-kind sizes, and put a component without a row below everything before it."""
    out, bottom = [], 0
    for i, c in enumerate(items):
        if not isinstance(c, dict):
            out.append(c)
            continue
        w, h = COMPONENT_SIZES.get(c.get("kind"), (6, 3))
        c = {**c, "id": c.get("id") or f"{prefix}-{i + 1}"}
        c = {**c, "x": c.get("x", 0), "y": c.get("y", bottom), "w": c.get("w", w), "h": c.get("h", h)}
        if c["kind"] == "group":
            c["components"] = _place(c.get("components") or [], c["id"])
        if all(_is_int(c[k]) for k in "xywh"):
            bottom = max(bottom, c["y"] + c["h"])
        out.append(c)
    return out


def normalize_layout(data: dict[str, Any]) -> dict[str, Any]:
    views = (data.get("layout") or default_layout(data)).get("views")
    return {"columns": GRID_COLUMNS, "views": [
        {**v, "id": v.get("id") or f"view-{i + 1}", "name": v.get("name") or v.get("id") or f"View {i + 1}",
         "components": _place(v.get("components") or [], v.get("id") or f"view-{i + 1}")}
        for i, v in enumerate(views if isinstance(views, list) else []) if isinstance(v, dict)]}


def _overlap(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]


def _layout_errors(data: dict[str, Any]) -> list[str]:
    if "layout" in data and not (isinstance(data["layout"], dict) and isinstance(data["layout"].get("views"), list)
                                 and data["layout"]["views"]):
        return ["layout.views must be a non-empty list"]
    errors: list[str] = []
    seen: set[str] = set()
    charts, derived = {c["id"] for c in data.get("charts", [])}, set(data.get("derived", {}))

    def check(items: list[Any], where: str) -> None:
        placed = []
        for c in items:
            if not isinstance(c, dict):
                errors.append(f"Layout {where}: each component must be a mapping")
                continue
            name, kind = f"Layout component {c['id']!r}", c.get("kind")
            if c["id"] in seen:
                errors.append(f"{name} is defined twice")
            seen.add(c["id"])
            if kind in UNSUPPORTED_KINDS:
                errors.append(f"{name}: kind {kind!r} is not supported; {UNSUPPORTED_KINDS[kind]}")
                continue
            if kind not in COMPONENT_SIZES:
                errors.append(f"{name}: unknown kind {kind!r}; use one of {sorted(COMPONENT_SIZES)}")
                continue
            if not all(_is_int(c[k]) for k in "xywh"):
                errors.append(f"{name}: x, y, w and h must be whole numbers")
            elif c["x"] < 0 or c["y"] < 0 or c["w"] < 1 or c["h"] < 1 or c["x"] + c["w"] > GRID_COLUMNS:
                errors.append(f"{name} is outside the {GRID_COLUMNS}-column grid (x={c['x']}, y={c['y']}, w={c['w']}, h={c['h']})")
            else:
                errors.extend(f"Layout components {p['id']!r} and {c['id']!r} overlap in {where}" for p in placed if _overlap(p, c))
                placed.append(c)
            if c.get("role") is not None and c["role"] not in data["roles"]:
                errors.append(f"{name}: unknown role {c['role']!r}")
            if kind == "chart" and c.get("chart") not in charts:
                errors.append(f"{name}: unknown chart {c.get('chart')!r}")
            if kind == "metric" and c.get("value") not in derived:
                errors.append(f"{name}: {c.get('value')!r} is not a derived value")
            if kind == "inputs" and (unknown := set(c.get("parameters") or []) - set(data.get("parameters", {}))):
                errors.append(f"{name}: unknown parameters {sorted(unknown)}")
            if kind == "group":
                check(c["components"], f"group {c['id']!r}")

    view_ids: set[str] = set()
    for view in normalize_layout(data)["views"]:
        if view["id"] in view_ids:
            errors.append(f"Layout view {view['id']!r} is defined twice")
        view_ids.add(view["id"])
        check(view["components"], f"view {view['id']!r}")
    return errors


@dataclass(frozen=True)
class Template:
    data: dict[str, Any]

    @property
    def id(self) -> str:
        return self.data["id"]

    @property
    def revision(self) -> int:
        return int(self.data["revision"])

    def enabled_roles(self) -> dict[str, dict[str, Any]]:
        return {k: v for k, v in self.data["roles"].items() if v.get("enabled", True)}

    def params(self) -> dict[str, float]:
        return {k: float(v["value"]) for k, v in self.data.get("parameters", {}).items()}

    def derived(self) -> dict[str, tuple[dict[str, Any], Expression]]:
        return {k: (d, parse_expression(d["expr"])) for k, d in self.data.get("derived", {}).items()}

    def protocol_plan(self, role: str):
        name = self.data["roles"][role].get("protocol")
        return plan_protocol(self.data["protocols"][name]) if name else None

    def flash_red_level(self, role: str) -> int:
        name = self.data["roles"][role].get("protocol")
        return int(self.data["protocols"][name]["flash_red_level"]) if name else 2500

    def charts(self) -> list[dict[str, Any]]:
        roles = self.enabled_roles()
        out = []
        for chart in self.data.get("charts", []):
            series = [s for s in chart["series"] if s["role"] in roles]
            if series:
                out.append({**chart, "series": series})
        return out

    def layout(self) -> dict[str, Any]:
        return normalize_layout(self.data)

    def hidden_components(self) -> dict[str, str]:
        """Component id -> why it is not shown. Mirrors charts(): an excluded role takes its components with it."""
        roles, charts, derived = self.enabled_roles(), {c["id"] for c in self.charts()}, self.data.get("derived", {})
        hidden: dict[str, str] = {}

        def visit(items: list[dict[str, Any]]) -> None:
            for c in items:
                role = c.get("role") or (derived[c["value"]]["role"] if c["kind"] == "metric" else None)
                if role and role not in roles:
                    hidden[c["id"]] = f"Role {role} is excluded"
                elif c["kind"] == "chart" and c["chart"] not in charts:
                    hidden[c["id"]] = f"Every role in chart {c['chart']} is excluded"
                elif c["kind"] == "group":
                    visit(c["components"])
                    if all(child["id"] in hidden for child in c["components"]):
                        hidden[c["id"]] = "Every component in the group is hidden"

        for view in self.layout()["views"]:
            visit(view["components"])
        return hidden


def validate(data: dict[str, Any], profiles: dict[str, dict[str, Any]]) -> Template:
    errors: list[str] = []
    for key in ("id", "revision", "name", "roles"):
        if key not in data:
            errors.append(f"Missing '{key}'")
    if errors:
        raise TemplateError("; ".join(errors))

    params = set(data.get("parameters", {}))
    role_columns: dict[str, set[str]] = {}
    for name, role in data["roles"].items():
        profile = profiles.get(role.get("instrument", ""))
        if profile is None:
            errors.append(f"Role {name}: unknown instrument profile {role.get('instrument')!r}")
            continue
        columns = set(ADAPTER_COLUMNS[profile["adapter"]]) | set(profile.get("aliases", {}))
        if role.get("import"):
            columns &= IMPORT_COLUMNS[role["import"]]
        role_columns[name] = columns
        if not isinstance(role.get("start_delay_s", 0), (int, float)) or role.get("start_delay_s", 0) < 0:
            errors.append(f"Role {name}: start_delay_s must be a number of seconds >= 0")
        if role.get("on_failure", "continue_others") not in ON_FAILURE:
            errors.append(f"Role {name}: on_failure must be one of {sorted(ON_FAILURE)}")
        if role.get("protocol") and role["protocol"] not in data.get("protocols", {}):
            errors.append(f"Role {name}: unknown protocol {role['protocol']!r}")

    for key, d in data.get("derived", {}).items():
        try:
            expr = parse_expression(d["expr"])
        except TemplateError as e:
            errors.append(f"Derived {key}: {e}")
            continue
        if d["role"] not in data["roles"]:
            errors.append(f"Derived {key}: unknown role {d['role']!r}")
            continue
        unknown = expr.names - params - role_columns.get(d["role"], set())
        if unknown:
            errors.append(f"Derived {key}: unknown names {sorted(unknown)}")

    derived = set(data.get("derived", {}))
    for chart in data.get("charts", []):
        for s in chart.get("series", []):
            if s["role"] not in data["roles"]:
                errors.append(f"Chart {chart['id']}: unknown role {s['role']!r}")
            elif s["value"] not in derived | role_columns.get(s["role"], set()):
                errors.append(f"Chart {chart['id']}: {s['value']!r} is not a column or derived value of {s['role']}")

    alignment = data.get("alignment", {})
    if alignment.get("default_reference", "elapsed") not in REFERENCES:
        errors.append(f"alignment.default_reference must be one of {sorted(REFERENCES)}")
    if alignment.get("event") and alignment["event"] not in data.get("events", {}):
        errors.append(f"alignment.event {alignment['event']!r} is not defined under events")
    if alignment.get("trial_role") and alignment["trial_role"] not in data["roles"]:
        errors.append(f"alignment.trial_role {alignment['trial_role']!r} is not a role")
    errors.extend(_layout_errors(data))
    if errors:
        raise TemplateError("; ".join(errors))
    return Template(data)


class TemplateStore:
    def __init__(self, data_dir: Path) -> None:
        self.dir = data_dir / "templates"

    def _revisions(self) -> dict[str, dict[int, dict[str, Any]]]:
        found: dict[str, dict[int, dict[str, Any]]] = {}
        for f in [*BUILTIN_TEMPLATES.glob("*.yaml"), *self.dir.glob("*/rev-*.yaml")]:
            data = yaml.safe_load(f.read_text())
            found.setdefault(data["id"], {})[int(data["revision"])] = data
        return found

    def list(self) -> list[Template]:
        profiles = load_profiles()
        return [validate(revs[max(revs)], profiles) for revs in self._revisions().values()]

    def get(self, template_id: str, revision: int | None = None) -> Template:
        revs = self._revisions().get(template_id)
        if not revs:
            raise KeyError(template_id)
        return validate(revs[revision if revision is not None else max(revs)], load_profiles())

    def revisions(self, template_id: str) -> list[int]:
        return sorted(self._revisions().get(template_id, {}))

    def save_revision(self, data: dict[str, Any]) -> Template:
        revs = self._revisions().get(data.get("id", ""), {})
        data = {**data, "revision": max(revs, default=0) + 1}
        template = validate(data, load_profiles())
        target = self.dir / template.id / f"rev-{template.revision}.yaml"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
        return template
