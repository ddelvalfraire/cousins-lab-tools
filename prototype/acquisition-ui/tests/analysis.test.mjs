import assert from "node:assert/strict";
import { test } from "node:test";
import { capturesFor, readingRows } from "../analysis.js";

const m44 = (value, n) => ({ m44: { stat: "mean", of: "m44", value, n, t_first_s: 0.21, t_last_s: 0.42 } });
const analysis = {
  rev: 2,
  steps: {
    "co2.ul1": { label: "CO2 Cal 1 µl", owner: "co2", role: "ms", kind: "point", known: 1,
      reading: { record: "rec-000002", created_utc: "2026-10-18T10:00:00+00:00", capture: "ms-x", range_s: [0.2, 0.45], values: m44(191.442, 3) } },
    co2_zero: { label: "CO2 Zero", owner: "co2_zero", role: "ms", kind: "set", known: null, reading: null },
    "sample.co2": { label: "CO2 Sample", owner: "sample", role: "ms", kind: "measure", known: null, reading: null },
  },
};
const steps = ["co2.ul1", "co2_zero", "sample.co2"];

test("each step shows its saved reading, its known value when it is a line point, and Remove only when read", () => {
  const rows = readingRows(steps, analysis, { selection: null, capture: "ms-x" });
  assert.deepEqual(rows.map(r => [r.step, r.label, r.known, r.remove]), [
    ["co2.ul1", "CO2 Cal 1 µl", 1, "rec-000002"],
    ["co2_zero", "CO2 Zero", null, null],
    ["sample.co2", "CO2 Sample", null, null],
  ]);
  assert.deepEqual(rows[0].saved, { record: "rec-000002", range_s: [0.2, 0.45], values: ["mean m44 191.442 · 3 rows"] });
  assert.equal(rows[1].saved, null);
});

test("reading buttons are disabled without a selection or without a capture of the step's role", () => {
  const none = readingRows(steps, analysis, { selection: null, capture: "ms-x" });
  assert.ok(none.every(r => r.read.disabled && r.read.why === "Select a range on a chart first"));
  const ready = readingRows(steps, analysis, { selection: { from: 0.2, to: 0.45 }, capture: "ms-x" });
  assert.ok(ready.every(r => !r.read.disabled && r.read.why === ""));
  const noCapture = readingRows(["co2_zero"], analysis, { selection: { from: 0.2, to: 0.45 }, capture: null });
  assert.deepEqual(noCapture[0].read, { disabled: true, why: "No capture records role ms" });
  const unknown = readingRows(["co2.ul9"], analysis, { selection: { from: 0.2, to: 0.45 }, capture: "ms-x" });
  assert.deepEqual([unknown[0].label, unknown[0].read.disabled], ["co2.ul9", true]);
  assert.ok(readingRows(steps, null, { selection: { from: 1, to: 2 }, capture: "ms-x" }).every(r => r.read.disabled), "no view yet");
});

test("the preview for the selection shows the engine's values, or its refusal, beside the saved reading", () => {
  const previews = {
    co2_zero: { step: "co2_zero", capture: "ms-x", range_s: [0.2, 0.45], values: m44(-18.8049, 1) },
    "sample.co2": { error: "No stored rows between 900 and 901 s" },
  };
  const rows = readingRows(steps, analysis, { selection: { from: 0.2, to: 0.45 }, capture: "ms-x", previews });
  assert.equal(rows[0].preview, undefined);
  assert.deepEqual(rows[1].preview, { values: ["mean m44 -18.8049 · 1 row"] });
  assert.deepEqual(rows[2].preview, { error: "No stored rows between 900 and 901 s" });
});

test("readings go to the captures that record the step's role", () => {
  const captures = { "ms-a": { role: "ms" }, light: { role: "light" }, "ms-b": { role: "ms" } };
  assert.deepEqual(capturesFor(captures, "ms"), ["ms-a", "ms-b"]);
  assert.deepEqual(capturesFor(captures, "pulser"), []);
});
