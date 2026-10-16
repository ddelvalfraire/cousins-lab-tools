"""A session left running by a killed engine is marked interrupted on the next start."""

from cousinslab.contract import Column
from cousinslab.query import connect
from cousinslab.session import SegmentWriter, SessionStore, arrow_schema

COLUMNS = (Column("seq", "int64"), Column("value", "float64", "mV"))


def test_running_session_is_marked_interrupted_with_rows_recounted(tmp_path):
    store = SessionStore(tmp_path)
    manifest = store.create("killed run", "run", {"id": "t", "revision": 1})
    manifest["status"] = "running"
    manifest["captures"]["ms"] = {"status": "running", "rows": 0, "aliases": {}}
    store.save(manifest)
    samples = store.capture_dir(manifest["id"], "ms") / "samples"
    writer = SegmentWriter(samples, arrow_schema(COLUMNS), flush_rows=10)
    writer.append([{"seq": i, "value": i / 10} for i in range(25)])
    writer.append([{"seq": i, "value": i / 10} for i in range(25, 28)])  # still buffered when the process dies
    (samples / "part-00099.parquet.tmp").write_bytes(b"PAR1 half written")

    assert SessionStore(tmp_path).mark_interrupted() == [manifest["id"]]

    recovered = store.load(manifest["id"])
    assert recovered["status"] == "interrupted"
    assert recovered["captures"]["ms"] == {"status": "interrupted", "rows": 25, "aliases": {}}
    assert not list(samples.glob("*.tmp"))
    assert connect(store.path(manifest["id"])).execute('SELECT count(*), max(seq) FROM "cap:ms"').fetchone() == (25, 24)


def test_finished_sessions_are_left_alone(tmp_path):
    store = SessionStore(tmp_path)
    manifest = store.create("done", "run", {"id": "t", "revision": 1})
    manifest["status"] = "completed"
    store.save(manifest)
    assert SessionStore(tmp_path).mark_interrupted() == []
    assert store.load(manifest["id"])["status"] == "completed"
