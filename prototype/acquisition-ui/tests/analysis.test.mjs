import assert from "node:assert/strict";
import { test } from "node:test";
import { capturesFor, parameterRows, parseEntry, readingRows, selectionLines, templateSteps } from "../analysis.js";
import { inputsBody } from "../components.js";

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
  assert.deepEqual(rows[0].saved, { record: "rec-000002", range_s: [0.2, 0.45], values: ["mean m44 191.442 · 3 rows"], short: "191.442" });
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

const parameters = {
  zero_p: { value: 191.442, unit: "mV", label: "Zero", note: "", entry: false, source: "fitted", calibration: "zero" },
  temp_c: { value: null, unit: "°C", label: "Temperature", note: "Required", entry: true, source: "unset", why: "Enter a value" },
  o2_cal: { value: 1.35, unit: "µmol/L per mV", label: "O2 Cal", note: "", entry: true, source: "computed" },
  ubar: { value: 9200, unit: "µbar/%", label: "µbar per %", note: "Legacy constant", entry: false, source: "default" },
  co2_t: { value: 25, unit: "°C", label: "Typed", note: "", entry: true, source: "entered", record: "rec-000003" },
};

test("inputs show each parameter's effective value with where it came from", () => {
  const rows = parameterRows([], { parameters });
  assert.deepEqual(rows.map(r => [r.name, r.value, r.tag, r.entry, r.typed, r.why]), [
    ["zero_p", 191.442, "Fitted · zero", false, "", ""],
    ["temp_c", null, "Unset", true, "", "Enter a value"],
    ["o2_cal", 1.35, "Computed", true, "", ""],
    ["ubar", 9200, "Default", false, "", ""],
    ["co2_t", 25, "Entered", true, "25", ""],
  ]);
  assert.deepEqual(parameterRows(["temp_c", "ubar"], { parameters }).map(r => r.name), ["temp_c", "ubar"]);
});

test("before the analysis view arrives the template's values show as defaults, none typed in", () => {
  const rows = parameterRows(["q"], null, { q: { value: 3, unit: "s", label: "Q" }, r: { value: 1 } });
  assert.deepEqual(rows.map(r => [r.name, r.label, r.value, r.tag, r.entry]), [["q", "Q", 3, "Default", false]]);
});

test("a typed value is a number, an empty field clears the entry, anything else is refused", () => {
  assert.deepEqual(parseEntry(" 25 "), { value: 25 });
  assert.deepEqual(parseEntry("-0.5e-3"), { value: -0.0005 });
  assert.deepEqual(parseEntry(""), { value: null });
  assert.deepEqual(parseEntry("twenty"), { error: '"twenty" is not a number' });
  assert.deepEqual(parseEntry("Infinity"), { error: '"Infinity" is not a number' });
});

test("entry parameters render a field that sends on change; the others render read-outs (B19)", () => {
  const html = inputsBody({}, { session: { template: { revision: 2 } } }, parameterRows([], { parameters }));
  const fields = [...html.matchAll(/<input[^>]*data-parameter="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(fields, ["temp_c", "o2_cal", "co2_t"]);
  assert.equal([...html.matchAll(/<input[^>]*data-change="entry"/g)].length, 3);
  assert.match(html, /data-parameter="co2_t"\s+value="25"/);
  assert.match(html, /data-parameter="o2_cal"\s+value="" placeholder="1.35"/);
});

test("the editor offers every step reference of the template, in template order", () => {
  const data = {
    calibrations: {
      co2: { label: "CO2 Calibrations", role: "ms", line: { reading: { stat: "mean", of: "m44" }, points: { zero: { label: "CO2 Cal Zero", known: 0 }, ul1: { known: 1 } } } },
      co2_zero: { label: "CO2 Zero", role: "ms", set: { co2_zero_mv: { stat: "mean", of: "m44" } } },
    },
    measurements: {
      sample: { label: "Sample", role: "ms", steps: { co2: { label: "CO2 Sample", readings: {} } }, results: {} },
      rate_mean: { label: "Get Mean", role: "ms", readings: { mean_rate: { stat: "mean", of: "r" } }, results: {} },
    },
  };
  assert.deepEqual(templateSteps(data).map(s => [s.ref, s.owner, s.label, s.role]), [
    ["co2.zero", "co2", "CO2 Cal Zero", "ms"],
    ["co2.ul1", "co2", "ul1", "ms"],
    ["co2_zero", "co2_zero", "CO2 Zero", "ms"],
    ["sample.co2", "sample", "CO2 Sample", "ms"],
    ["rate_mean", "rate_mean", "Get Mean", "ms"],
  ]);
  assert.deepEqual(templateSteps({}), []);
});

test("the selection's preview is listed once per distinct text, so steps reading the same thing show one line", () => {
  const selection = { from: 0.2, to: 0.45 };
  const previews = {
    "co2.ul1": { values: m44(39.2, 220) },
    co2_zero: { values: m44(39.2, 220) },
    "sample.co2": { error: "No stored rows between 0.2 and 0.45 s" },
  };
  const rows = readingRows(steps, analysis, { selection, capture: "ms-x", previews });
  assert.deepEqual(selectionLines(rows), [
    { text: "mean m44 39.2 · 220 rows", error: false },
    { text: "No stored rows between 0.2 and 0.45 s", error: true },
  ]);
  assert.deepEqual(selectionLines(readingRows(steps, analysis, { selection: null, capture: "ms-x" })), [], "nothing selected");
});
