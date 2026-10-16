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
