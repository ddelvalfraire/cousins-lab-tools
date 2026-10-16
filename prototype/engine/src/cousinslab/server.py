"""HTTP API and static UI host. The UI holds no instrument or timing logic; it calls this API.

Binds to 127.0.0.1 only. A Tauri shell would start this process and load the same UI.
"""

from __future__ import annotations

import json
import mimetypes
import re
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

import yaml

from .alignment import aligned_sql, chart_data, list_alignments, load_alignment, metric_series, propose, save_alignment
from .ambit import AMBIT_CLOCKS, AMBIT_COLUMNS
from .export import export_aligned, export_legacy_frames
from .importing import import_session
from .query import connect, rows_as_dicts, session_events
from .run import GroupRun
from .session import SessionStore
from .spool import SPOOL_CLOCKS, SPOOL_COLUMNS
from .templates import REPO_DIR, TemplateError, TemplateStore, load_profiles

UI_DIR = REPO_DIR / "prototype" / "acquisition-ui"
REFERENCE_DIR = REPO_DIR / "reference" / "instruments"
ADAPTER_INFO = {
    "ezview_spool": {"capabilities": ["acquire"], "columns": SPOOL_COLUMNS, "clocks": SPOOL_CLOCKS,
                     "control": "None. EZView owns the instrument; the app reads its spool file."},
    "ambit_replay": {"capabilities": ["acquire"], "columns": AMBIT_COLUMNS, "clocks": AMBIT_CLOCKS,
                     "control": "Deferred. Serial protocol control (G, A, E; pulser DAC/LED) is documented but not implemented."},
}
MAX_QUERY_ROWS = 500


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class App:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.templates = TemplateStore(data_dir)
        self.sessions = SessionStore(data_dir)
        self.runs: dict[str, GroupRun] = {}
        self.interrupted = self.sessions.mark_interrupted()
        self.routes: list[tuple[str, re.Pattern, Callable]] = []
        for method, pattern, handler in [
            ("GET", r"/api/templates", self.list_templates),
            ("GET", r"/api/templates/(?P<tid>[\w-]+)", self.get_template),
            ("POST", r"/api/templates/(?P<tid>[\w-]+)/revisions", self.save_template),
            ("GET", r"/api/instruments", self.list_instruments),
            ("GET", r"/api/recordings", self.list_recordings),
            ("GET", r"/api/sessions", self.list_sessions),
            ("POST", r"/api/runs", self.start_run),
            ("POST", r"/api/imports", self.create_import),
            ("GET", r"/api/sessions/(?P<sid>[\w-]+)", self.get_session),
            ("GET", r"/api/sessions/(?P<sid>[\w-]+)/live", self.live),
            ("GET", r"/api/sessions/(?P<sid>[\w-]+)/events", self.events),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/(?P<action>stop|cancel)", self.stop_run),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/mark", self.mark),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/alignment/preview", self.preview_alignment),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/alignments", self.save_alignment),
            ("GET", r"/api/sessions/(?P<sid>[\w-]+)/alignments/(?P<aid>[\w-]+)/charts", self.alignment_charts),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/alignments/(?P<aid>[\w-]+)/export", self.export),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/legacy-frames", self.legacy_frames),
            ("POST", r"/api/sessions/(?P<sid>[\w-]+)/query", self.query),
        ]:
            self.routes.append((method, re.compile(f"^{pattern}$"), handler))

    def session_dir(self, sid: str) -> Path:
        path = self.sessions.path(sid)
        if not (path / "session.json").exists():
            raise ApiError(404, f"No session {sid}")
        return path

    def manifest(self, sid: str) -> dict[str, Any]:
        run = self.runs.get(sid)
        return run.manifest if run else self.sessions.load(sid)

    def list_templates(self, body, query):
        return [self._template_view(t) for t in self.templates.list()]

    def get_template(self, body, query, tid):
        revision = int(query["revision"][0]) if "revision" in query else None
        try:
            return self._template_view(self.templates.get(tid, revision))
        except KeyError:
            raise ApiError(404, f"No template {tid}")

    def _template_view(self, t):
        plans = {role: (p.__dict__ if (p := t.protocol_plan(role)) else None) for role in t.data["roles"]}
        return {"data": t.data, "yaml": yaml.safe_dump(t.data, sort_keys=False, allow_unicode=True),
                "revisions": self.templates.revisions(t.id), "charts": t.charts(), "protocol_plans": plans,
                "enabled_roles": list(t.enabled_roles()), "layout": t.layout(), "hidden_components": t.hidden_components()}

    def save_template(self, body, query, tid):
        data = yaml.safe_load(body["yaml"]) if "yaml" in body else body["data"]
        if data.get("id") != tid:
            raise ApiError(400, "The template id cannot change in a revision. Copy it under a new id instead.")
        try:
            return self._template_view(self.templates.save_revision(data))
        except (TemplateError, yaml.YAMLError) as e:
            raise ApiError(422, str(e))

    def list_instruments(self, body, query):
        out = []
        for p in load_profiles().values():
            info = ADAPTER_INFO[p["adapter"]]
            out.append({**p, "capabilities": info["capabilities"], "control": info["control"],
                        "columns": [c.__dict__ for c in info["columns"]], "clocks": [c.__dict__ for c in info["clocks"]]})
        return out

    def list_recordings(self, body, query):
        return {
            "ms_workbook": [str(p) for p in sorted(REFERENCE_DIR.rglob("*.xlsx"))],
            "ambit_csv": [str(p) for p in sorted(REFERENCE_DIR.rglob("Ambit*.csv"))],
        }

    def list_sessions(self, body, query):
        return [{k: m.get(k) for k in ("id", "name", "kind", "status", "created_utc")} |
                {"template": f"{m['template']['name']} r{m['template']['revision']}",
                 "inputs": sorted({c.get("input_kind") for c in m["captures"].values()}),
                 "live": m["id"] in self.runs and m["status"] in ("running", "stopping")}
                for m in self.sessions.list()]

    def start_run(self, body, query):
        template = self.templates.get(body["template_id"], body.get("revision"))
        speed = float(body.get("speed", 10))
        if not 0.1 <= speed <= 100:
            raise ApiError(400, "Replay speed must be between 0.1x and 100x")
        profiles = load_profiles()
        hardware = [r for r, cfg in template.enabled_roles().items() if profiles[cfg["instrument"]]["input_kind"] == "hardware"]
        if hardware and speed != 1:
            raise ApiError(400, f"Roles {', '.join(hardware)} use hardware; hardware runs in real time (speed 1x)")
        manifest = self.sessions.create(body.get("name") or template.data["name"], "run", template.data)
        run = GroupRun(self.sessions, manifest, template, profiles, speed)
        self.runs[manifest["id"]] = run
        if run.prepare():
            run.start()
        return run.manifest

    def create_import(self, body, query):
        template = self.templates.get(body["template_id"], body.get("revision"))
        for f in body["files"]:
            if not Path(f["path"]).is_file():
                raise ApiError(400, f"File not found: {f['path']}")
        return import_session(self.sessions, template, body.get("name") or "Imported recording", body["files"])

    def get_session(self, body, query, sid):
        session_dir = self.session_dir(sid)
        manifest = self.manifest(sid)
        return {"manifest": manifest, "alignments": list_alignments(session_dir),
                "live": sid in self.runs and manifest["status"] in ("running", "stopping"),
                "interrupted_at_startup": sid in self.interrupted}

    def live(self, body, query, sid):
        run = self.runs.get(sid)
        if not run:
            raise ApiError(409, "This session is not running in this engine process")
        return run.live(json.loads(query.get("cursors", ["{}"])[0]))

    def events(self, body, query, sid):
        return session_events(self.session_dir(sid), self.manifest(sid))

    def stop_run(self, body, query, sid, action):
        run = self.runs.get(sid)
        if not run or run.manifest["status"] != "running":
            raise ApiError(409, "This session is not running")
        threading.Thread(target=run.stop, kwargs={"cancel": action == "cancel"}, daemon=True).start()
        return {"status": "stopping"}

    def mark(self, body, query, sid):
        run = self.runs.get(sid)
        if not run or run.manifest["status"] != "running":
            raise ApiError(409, "Markers can only be added while the run is going")
        return run.mark(body["event"])

    def _proposal(self, sid, body):
        return propose(self.session_dir(sid), self.manifest(sid), body.get("reference", "event"),
                       body.get("manual") or {}, body.get("trial_params") or {})

    def preview_alignment(self, body, query, sid):
        return self._aligned_view(sid, {**self._proposal(sid, body), "id": "preview"})

    def save_alignment(self, body, query, sid):
        return save_alignment(self.session_dir(sid), self._proposal(sid, body))

    def alignment_charts(self, body, query, sid, aid):
        return self._aligned_view(sid, load_alignment(self.session_dir(sid), aid))

    def _aligned_view(self, sid, alignment):
        session_dir, manifest = self.session_dir(sid), self.manifest(sid)
        return {"alignment": alignment, "charts": chart_data(session_dir, manifest, alignment),
                "values": metric_series(session_dir, manifest, alignment)}

    def export(self, body, query, sid, aid):
        return export_aligned(self.session_dir(sid), self.manifest(sid), load_alignment(self.session_dir(sid), aid))

    def legacy_frames(self, body, query, sid):
        capture = self.manifest(sid)["captures"].get(body["capture"])
        if not capture or capture.get("adapter") != "ezview_spool":
            raise ApiError(400, "Legacy frame export applies to EZView spool captures")
        return export_legacy_frames(self.session_dir(sid), body["capture"])

    def query(self, body, query, sid):
        session_dir = self.session_dir(sid)
        con = connect(session_dir)
        if body.get("alignment_id"):
            con.execute(f"CREATE VIEW aligned AS {aligned_sql(self.manifest(sid), load_alignment(session_dir, body['alignment_id']))}")
        views = [r[0] for r in con.execute("SELECT view_name FROM duckdb_views() WHERE NOT internal ORDER BY 1").fetchall()]
        try:
            rows = rows_as_dicts(con, f"SELECT * FROM ({body['sql'].rstrip().rstrip(';')}) LIMIT {MAX_QUERY_ROWS + 1}")
        except Exception as e:
            raise ApiError(400, f"{type(e).__name__}: {e}")
        return {"views": views, "rows": rows[:MAX_QUERY_ROWS], "truncated": len(rows) > MAX_QUERY_ROWS}


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _send(self, status: int, payload: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

        def _json(self, status: int, value: Any) -> None:
            self._send(status, json.dumps(value, default=str).encode(), "application/json")

        def _dispatch(self, method: str) -> None:
            url = urlparse(self.path)
            if method == "GET" and url.path == "/api/file":
                return self._file(parse_qs(url.query))
            if not url.path.startswith("/api/"):
                return self._static(url.path)
            for m, pattern, handler in app.routes:
                match = pattern.match(url.path)
                if m == method and match:
                    try:
                        length = int(self.headers.get("Content-Length") or 0)
                        body = json.loads(self.rfile.read(length) or b"{}") if length else {}
                        return self._json(200, handler(body, parse_qs(url.query), **match.groupdict()))
                    except ApiError as e:
                        return self._json(e.status, {"error": str(e)})
                    except KeyError as e:
                        return self._json(404, {"error": f"Not found: {e}"})
                    except Exception as e:  # report engine errors to the UI instead of dropping the connection
                        traceback.print_exc()
                        return self._json(500, {"error": f"{type(e).__name__}: {e}"})
            self._json(404, {"error": f"No route {method} {url.path}"})

        def _static(self, path: str) -> None:
            target = (UI_DIR / (path.lstrip("/") or "index.html")).resolve()
            if not target.is_relative_to(UI_DIR) or not target.is_file():
                target = UI_DIR / "index.html"
            self._send(200, target.read_bytes(), mimetypes.guess_type(target.name)[0] or "application/octet-stream")

        def _file(self, query) -> None:
            target = Path(query.get("path", [""])[0]).resolve()
            if not target.is_relative_to(app.data_dir.resolve()) or not target.is_file():
                return self._json(404, {"error": "File not available"})
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{target.name}"')
            self.send_header("Content-Length", str(target.stat().st_size))
            self.end_headers()
            self.wfile.write(target.read_bytes())

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

    return Handler


def serve(data_dir: Path, port: int) -> None:
    app = App(data_dir)
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    print(f"Cousins Lab engine on http://127.0.0.1:{port}  data: {data_dir}", flush=True)
    if app.interrupted:
        print(f"Marked interrupted: {', '.join(app.interrupted)}", flush=True)
    server.serve_forever()
