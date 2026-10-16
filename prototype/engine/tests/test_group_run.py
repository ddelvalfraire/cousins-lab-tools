"""Grouped acquisition with simulated and replayed inputs, at high replay speed."""

import copy
import threading
import time
from datetime import datetime, timezone

import pytest

from cousinslab import run as run_module
from cousinslab.alignment import propose
from cousinslab.contract import InstrumentInfo, Readiness
from cousinslab.query import connect
from cousinslab.run import GroupRun
from cousinslab.session import SessionStore
from cousinslab.templates import Template, TemplateStore, load_profiles

SPEED = 50.0


def template_with(data_dir, **role_changes) -> Template:
    data = copy.deepcopy(TemplateStore(data_dir).get("jii-leaf-co2-fluorescence").data)
    for role, changes in role_changes.items():
        data["roles"][role].update(changes)
    return Template(data)


def start(data_dir, template: Template) -> GroupRun:
    store = SessionStore(data_dir)
    manifest = store.create("group test", "run", template.data)
    run = GroupRun(store, manifest, template, load_profiles(), SPEED)
    assert run.prepare(), manifest["captures"]
    run.start()
    return run


def wait_until(predicate, timeout=20.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def test_roles_start_after_their_delays_and_record_requested_and_actual_times(tmp_path):
    run = start(tmp_path, template_with(tmp_path, light={"start_delay_s": 75}))
    caps = run.manifest["captures"]
    assert wait_until(lambda: caps["light"]["rows"] > 200 and caps["ms"]["rows"] > 20)
    run.mark("closed_system")
    time.sleep(0.5)
    run.stop()

    t0 = datetime.fromisoformat(run.manifest["run"]["group_start_utc"])
    light = caps["light"]
    requested = datetime.fromisoformat(light["requested_start_utc"])
    commanded = datetime.fromisoformat(light["start_command_utc"])
    first = datetime.fromisoformat(light["first_sample_utc"])
    assert light["host_delay_s"] == pytest.approx(75 / SPEED)
    assert (requested - t0).total_seconds() == pytest.approx(75 / SPEED)
    assert 0 <= (commanded - requested).total_seconds() < 0.2
    assert first >= commanded
    assert light["timing"]["requested_samples"] == 8010
    assert light["timing"]["recorded_samples"] == light["rows"]
    assert run.manifest["status"] == "completed"
    assert {c["status"] for c in caps.values()} <= {"completed", "source_ended"}

    con = connect(run.store.path(run.manifest["id"]))
    assert con.execute('SELECT count(*) FROM "cap:light"').fetchone()[0] == light["rows"]
    assert con.execute('SELECT count(*) FROM "cap:ms"').fetchone()[0] == caps["ms"]["rows"]
    assert con.execute('SELECT min(t_device_ms) FROM "cap:light"').fetchone()[0] == 9
    offset_s = datetime.now().astimezone().utcoffset().total_seconds()
    lag = con.execute(f'SELECT min(epoch_us(t_host_utc) - epoch_us(t_source_local)) / 1e6 + {offset_s}, '
                      f'max(epoch_us(t_host_utc) - epoch_us(t_source_local)) / 1e6 + {offset_s} FROM "cap:ms"').fetchone()
    assert 0 <= lag[0] <= lag[1] < 1.0, f"spool receipt lag {lag}"
    assert (run.store.path(run.manifest["id"]) / "captures" / "ms" / "raw" / "simulated-ezview-spool.txt").stat().st_size > 0


def test_live_session_aligns_on_the_host_clock_and_on_the_operator_marker(tmp_path):
    run = start(tmp_path, template_with(tmp_path, light={"start_delay_s": 25}))
    assert wait_until(lambda: run.manifest["captures"]["light"]["rows"] > 100)
    marker = run.mark("closed_system")
    time.sleep(0.3)
    run.stop()
    session_dir = run.store.path(run.manifest["id"])

    clock = propose(session_dir, run.manifest, "clock")
    assert clock["unaligned"] == []
    assert {m["clock"]["kind"] for m in clock["trials"][0]["members"]} == {"host_utc"}
    assert len({m["zero"] for m in clock["trials"][0]["members"]}) == 1, "one shared clock origin, no per-capture offsets"
    ms = next(m for m in clock["trials"][0]["members"] if m["capture"] == "ms")
    assert ms["uncertainty_s"] >= 0.05, "spool frames arrive in polls; receipt time cannot be finer than the poll interval"

    event = propose(session_dir, run.manifest, "event")
    marker_epoch = datetime.fromisoformat(marker["t_host_utc"]).timestamp()
    assert [m["zero"] for t in event["trials"] for m in t["members"]] == [pytest.approx(marker_epoch, abs=1e-6)] * 2
    assert all("Operator marker" in m["method"] for t in event["trials"] for m in t["members"])


def test_detected_flash_is_transferred_to_the_mass_spec_over_the_host_clock(tmp_path):
    run = start(tmp_path, template_with(tmp_path, light={"start_delay_s": 0}))
    assert wait_until(lambda: run.manifest["captures"]["light"]["rows"] > 3300, timeout=30)
    run.stop()
    event = propose(run.store.path(run.manifest["id"]), run.manifest, "event")
    members = {m["capture"]: m for t in event["trials"] for m in t["members"]}
    assert event["unaligned"] == []
    assert members["ms"]["zero"] == members["light"]["zero"]
    assert members["ms"]["method"].startswith("Transferred over the host clock")
    assert members["light"]["method"] == "Detected Saturation flash 4 (receipt time)"


def test_disabling_a_role_runs_the_remaining_roles_only(tmp_path):
    run = start(tmp_path, template_with(tmp_path, light={"enabled": False}))
    assert wait_until(lambda: run.manifest["captures"]["ms"]["rows"] > 10)
    run.stop()
    assert set(run.manifest["captures"]) == {"ms"}
    assert [c["id"] for c in Template(run.manifest["template"]).charts()] == ["co2", "mass44"]


class FailingAdapter:
    def describe(self):
        return InstrumentInfo("failing", "test", "simulated", frozenset({"acquire"}), (), ())

    def check_ready(self):
        return Readiness(True, "ok")

    def run(self, sink, stop):
        raise ConnectionError("device unplugged")

    def cancel(self):
        pass


@pytest.mark.parametrize("policy,ms_status", [("continue_others", "running"), ("stop_group", "completed")])
def test_failure_policy(tmp_path, monkeypatch, policy, ms_status):
    real = run_module.build_adapter

    def build(profile, role, template, capture_dir, speed):
        if role == "light":
            return FailingAdapter(), None, "test adapter", []
        return real(profile, role, template, capture_dir, speed)

    monkeypatch.setattr(run_module, "build_adapter", build)
    run = start(tmp_path, template_with(tmp_path, light={"start_delay_s": 0, "on_failure": policy}))
    caps = run.manifest["captures"]
    assert wait_until(lambda: caps["light"]["status"] == "failed")
    time.sleep(0.5)
    assert caps["light"]["error"] == "ConnectionError: device unplugged"
    assert caps["ms"]["status"] == ms_status
    run.stop()
    assert run.manifest["status"] == "completed_with_failures"


def test_not_ready_instrument_prevents_the_whole_group_from_starting(tmp_path):
    template = template_with(tmp_path, ms={"instrument": "ms2-ezview"})
    store = SessionStore(tmp_path)
    run = GroupRun(store, store.create("not ready", "run", template.data), template, load_profiles(), SPEED)
    assert not run.prepare()
    assert run.manifest["status"] == "not_ready"
    assert "No spool file configured" in run.manifest["captures"]["ms"]["readiness"]["detail"]
    assert run.manifest["captures"]["light"]["status"] == "ready"
    assert "start_command_utc" not in run.manifest["captures"]["light"]
