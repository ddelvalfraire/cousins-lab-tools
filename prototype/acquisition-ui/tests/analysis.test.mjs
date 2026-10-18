import assert from "node:assert/strict";
import { test } from "node:test";
import { capturesFor, parameterRows, parseEntry, parseTyped, readingRows, readingsTitle, selectionLines, stepProgress, stepReadings, templateSteps, typedStart } from "../analysis.js";
import { inputsBody, readingsBody } from "../components.js";

const m44 = (value, n) => ({ m44: { stat: "mean", of: "m44", value, n, t_first_s: 0.21, t_last_s: 0.42 } });
const analysis = {
  rev: 2,
  steps: {
    "co2.ul1": { label: "CO2 Cal 1 µl", owner: "co2", role: "ms", kind: "point", known: 1, source: "read", record: "rec-000002", values: { m44: 191.442 },
      reading: { record: "rec-000002", created_utc: "2026-10-18T10:00:00+00:00", capture: "ms-x", range_s: [0.2, 0.45], values: m44(191.442, 3) }, from: null },
    co2_zero: { label: "CO2 Zero", owner: "co2_zero", role: "ms", kind: "set", known: null, source: null, record: null, values: {}, reading: null, from: null },
    "sample.co2": { label: "CO2 Sample", owner: "sample", role: "ms", kind: "measure", known: null, source: null, record: null, values: {}, reading: null, from: null },
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
  assert.deepEqual(rows[0].saved, { record: "rec-000002", range_s: [0.2, 0.45], values: ["mean m44 191.442 · 3 rows"], short: "191.442", detail: "3 rows" });
  assert.deepEqual(rows[0].source, { source: "read", tag: "Read", title: "rec-000002" });
  assert.equal(rows[1].saved, null);
  assert.equal(rows[1].source, null);
});

const filled = (source, values, from = null) => ({ label: "CO2 Zero", owner: "co2_zero", role: "ms", kind: "set", known: null,
  source, record: "rec-000007", values, reading: null, from });

test("a typed, copied or loaded step shows its values with where they came from, and Remove takes back that record", () => {
  const view = { steps: {
    typed: filled("typed", { m44: -18.8, m45: 2.5 }),
    copied: filled("copied", { m44: 39.2 }, { session: "s-0001", record: "rec-000003" }),
    loaded: filled("loaded", { m44: 1.5 }, { file: "/cal/day1.csv" }),
  } };
  const rows = readingRows(["typed", "copied", "loaded"], view, { selection: null, capture: "ms-x" });
  assert.deepEqual(rows[0].saved, { record: "rec-000007", range_s: null, values: ["m44 -18.8", "m45 2.5"], short: "-18.8, 2.5", detail: "" });
  assert.deepEqual(rows.map(r => r.source), [
    { source: "typed", tag: "Typed", title: "rec-000007" },
    { source: "copied", tag: "Copied", title: "Copied from session s-0001, rec-000003" },
    { source: "loaded", tag: "Loaded", title: "Loaded from /cal/day1.csv" },
  ]);
  assert.deepEqual(rows.map(r => r.remove), ["rec-000007", "rec-000007", "rec-000007"]);
  assert.deepEqual(stepProgress(rows), { done: 3, total: 3 }, "a typed value counts as done");
});

test("typing a step starts from its values at full precision, one field per reading name the template gives it", () => {
  const data = {
    calibrations: {
      co2: { line: { reading: { stat: "mean", of: "m44" }, points: { zero: { known: 0 }, ul1: { known: 1 } } } },
      co2_zero: { set: { co2_zero_m44: { stat: "mean", of: "m44" }, co2_zero_m45: { stat: "mean", of: "m45" } } },
    },
    measurements: {
      sample: { steps: { co2: { readings: { co2_mv: { stat: "mean", of: "m44" } } } } },
      rate_mean: { readings: { mean_rate: { stat: "mean", of: "r" } } },
    },
  };
  const names = stepReadings(data);
  assert.deepEqual(names, { "co2.zero": ["m44"], "co2.ul1": ["m44"], co2_zero: ["co2_zero_m44", "co2_zero_m45"], "sample.co2": ["co2_mv"], rate_mean: ["mean_rate"] });
  const step = filled("read", { co2_zero_m44: -18.80123456789 });
  const start = typedStart("co2_zero", step, names.co2_zero);
  assert.deepEqual(start, { step: "co2_zero", texts: { co2_zero_m44: "-18.80123456789", co2_zero_m45: "" } });
  const rows = readingRows(["co2_zero", "co2.zero"], { steps: { co2_zero: step, "co2.zero": filled(null, {}) } }, { selection: null, capture: "ms-x", names, editing: start });
  assert.deepEqual(rows[0].typing, [{ name: "co2_zero_m44", text: "-18.80123456789" }, { name: "co2_zero_m45", text: "" }]);
  assert.equal(rows[1].typing, null);
  assert.deepEqual(rows.map(r => r.typable), [true, true]);
});

test("a typed edit saves only the fields that hold numbers, refuses text, and saves nothing when unchanged or empty", () => {
  const start = { a: "-18.8", b: "" };
  assert.deepEqual(parseTyped({ a: " -18.5 ", b: "" }, start), { values: { a: -18.5 } });
  assert.deepEqual(parseTyped({ a: "-18.8", b: "2e-3" }, start), { values: { a: -18.8, b: 0.002 } });
  assert.deepEqual(parseTyped({ a: "-18.8 ", b: "" }, start), { cancel: true }, "unchanged");
  assert.deepEqual(parseTyped({ a: "", b: "" }, start), { cancel: true }, "cleared: Remove does that");
  assert.deepEqual(parseTyped({ a: "abc", b: "" }, start), { error: '"abc" is not a number' });
  assert.deepEqual(parseTyped({ a: "Infinity" }, {}), { error: '"Infinity" is not a number' });
});

test("a readings tile shows the source badge with its origin on hover, an edit button per step, and fields while typing", () => {
  const view = { steps: { co2_zero: filled("copied", { m44: 39.2 }, { session: "s-0001", record: "rec-000003" }) } };
  const ctx = { session: { captures: { "ms-x": { role: "ms" } } }, template: { data: { calibrations: { co2_zero: { set: { m44: {} } } } } } };
  const tile = { steps: ["co2_zero"], role: "ms" };
  const shown = readingsBody(tile, ctx, { view, previews: {}, capture: {}, editing: null }, null);
  assert.match(shown, /class="badge step-source tone-linked" title="Copied from session s-0001, rec-000003">Copied</);
  assert.match(shown, /data-action="typeStep" data-step="co2_zero"/);
  assert.doesNotMatch(shown, /data-typed=/);
  const typing = readingsBody(tile, ctx, { view, previews: {}, capture: {}, editing: { step: "co2_zero", texts: { m44: "39.2" } } }, null);
  assert.match(typing, /data-typed="co2_zero" data-reading="m44" data-input="typed" aria-label="CO2 Zero m44" value="39.2"/);
  assert.doesNotMatch(typing, /data-action="typeStep"/, "no edit button while typing");
  assert.doesNotMatch(typing, /step-source/);
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

test("a parameter's source tag is coloured by where the value came from, and an unset one shows why instead of its note", () => {
  const html = inputsBody({}, { session: { template: { revision: 2 } } }, parameterRows([], { parameters }));
  const tags = [...html.matchAll(/<span class="badge ([^"]*)">([^<]+)<\/span>/g)].map(m => [m[2], m[1].trim()]);
  assert.deepEqual(tags, [["Fitted · zero", "tone-active"], ["Unset", "tone-pending"], ["Computed", ""], ["Default", ""], ["Entered", "tone-good"]]);
  assert.match(html, /param-note warn">Enter a value</);
  assert.doesNotMatch(html, />Required</, "the why replaces the note");
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

test("a readings tile counts its read steps and takes its title from the one calibration or measurement its steps share", () => {
  const rows = readingRows(steps, analysis, { selection: null, capture: "ms-x" });
  assert.deepEqual(stepProgress(rows), { done: 1, total: 3 });
  assert.deepEqual(stepProgress([]), { done: 0, total: 0 });
  const data = { calibrations: { co2: { label: "CO2 Calibrations" }, co2_zero: { label: "CO2 Zero" } }, measurements: { sample: { label: "Sample" } } };
  assert.equal(readingsTitle(["co2.zero", "co2.ul1"], data), "CO2 Calibrations");
  assert.equal(readingsTitle(["sample.co2", "sample.o2"], data), "Sample");
  assert.equal(readingsTitle(["co2.ul1", "co2_zero"], data), "Readings", "two owners");
  assert.equal(readingsTitle(["gone.x"], data), "Readings");
});
