import assert from "node:assert/strict";
import { test } from "node:test";
import { previewBody, previewSeries } from "../editor-preview.js";

const template = { data: {
  charts: [{ id: "gas", unit: "µbar", series: [{ role: "ms", value: "ubar_co2", color: "#123456" }] }],
  derived: { ubar_co2: { role: "ms", label: "CO2", unit: "µbar" } },
  roles: { ms: { label: "Mass spectrometer", instrument: "ms-simulated" } },
  events: { close: { label: "Closed system", operator_marker: true } },
  parameters: { temp: { label: "Temperature", value: 25, unit: "°C" } },
  measurements: { leaf: { labels: { name: "Leaf" }, results: { uptake: { label: "Net uptake", unit: "µbar/s" } } } },
} };

test("every configured chart series has finite, varying example data and keeps its identity and colour", () => {
  const spec = { series: [{ role: "ms", value: "ubar_co2", color: "#123456" }, { role: "light", value: "fluorescence" }] };
  const series = previewSeries(spec);
  assert.deepEqual(series.map(s => s.name), ["ms.ubar_co2", "light.fluorescence"]);
  assert.equal(series[0].color, "#123456");
  for (const s of series) {
    assert.ok(s.points.length > 10);
    assert.ok(s.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    assert.ok(new Set(s.points.map(([, y]) => y)).size > 1);
  }
  assert.deepEqual(previewSeries(spec), series, "a re-render must not invent another dataset");
});

test("an xy calibration preview includes points and a fit; a measurement preview has only points", () => {
  const [calibration, measurement] = previewSeries({ kind: "xy", series: [{ calibration: "co2" }, { measurement: "leaf", y: "uptake" }] });
  assert.ok(calibration.points.length >= 3);
  assert.deepEqual(calibration.line, [calibration.points[0], calibration.points.at(-1)]);
  assert.equal(measurement.line, undefined);
});

test("a metric shows the last example value of its bound chart with the configured unit", () => {
  const html = previewBody({ kind: "metric", value: "ubar_co2" }, template);
  const displayed = Number(html.match(/metric-number\">([\d.]+)/)[1]);
  const lastPoint = previewSeries(template.data.charts[0])[0].points.at(-1)[1];
  assert.ok(Math.abs(displayed - lastPoint) < Math.abs(lastPoint) * 0.001);
  assert.ok(html.includes("µbar"));
});

test("preview controls cannot run commands, and parameters and results use the template's labels", () => {
  const controls = previewBody({ kind: "controls" }, template);
  assert.ok(controls.includes("inert"));
  assert.ok(controls.includes("Closed system"));
  assert.ok(!controls.includes("data-action"));
  const parameters = previewBody({ kind: "inputs" }, template);
  assert.ok(parameters.includes("Temperature") && parameters.includes("25") && parameters.includes("°C"));
  const table = previewBody({ kind: "table", measurement: "leaf" }, template);
  assert.ok(table.includes("Leaf") && table.includes("Net uptake") && table.includes("Sample 2"));
  assert.ok(!table.includes("data-action"));
});

test("template text in previews cannot turn into executable markup", () => {
  const data = { ...template.data, parameters: { p: { label: '<img src=x onerror="bad()">', value: 1 } } };
  const html = previewBody({ kind: "inputs" }, { data });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});
