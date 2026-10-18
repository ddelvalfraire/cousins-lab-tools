import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionSummary } from "../status.js";

test("the status button counts the captures and shows the most urgent state among them", () => {
  const done = { a: { status: "imported" }, b: { status: "completed" } };
  assert.deepEqual(sessionSummary(done, "completed"), { label: "2 captures", tone: "good" });
  assert.deepEqual(sessionSummary({ a: { status: "running" } }, "running"), { label: "1 capture", tone: "active" });
  assert.deepEqual(sessionSummary({ a: { status: "waiting" } }, "preparing"), { label: "1 capture", tone: "pending" });
  assert.equal(sessionSummary({ a: { status: "running" }, b: { status: "failed" } }, "running").tone, "bad", "a failure outranks running");
  assert.equal(sessionSummary({ a: { status: "running", readiness: { ok: false } } }, "running").tone, "bad");
  assert.equal(sessionSummary({ a: { status: "completed" } }, "interrupted").tone, "bad");
  assert.deepEqual(sessionSummary({}, "completed"), { label: "0 captures", tone: "good" });
});
