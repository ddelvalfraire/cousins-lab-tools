import assert from "node:assert/strict";
import { test } from "node:test";
import { xyOption } from "../charts.js";

globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: name => name });

const spec = { id: "co2_cal", kind: "xy", title: "CO2 Calibrations", x_label: "Voltage (mV)", y_label: "CO2 (µl)" };

test("a calibration series plots its points and, once fitted, the engine's line in the series colour", () => {
  const option = xyOption(spec, [{ name: "CO2 Calibrations", color: "#00fa9a", points: [[-18.8, 0], [38.9, 1]], line: [[-18.8, -0.008], [151.7, 2.99]] }]);
  assert.deepEqual(option.series.map(s => [s.type, s.name, s.data]), [
    ["scatter", "CO2 Calibrations", [[-18.8, 0], [38.9, 1]]],
    ["line", "CO2 Calibrations", [[-18.8, -0.008], [151.7, 2.99]]],
  ]);
  assert.ok(option.series.every(s => (s.itemStyle || s.lineStyle).color === "#00fa9a"));
  assert.deepEqual([option.xAxis.name, option.yAxis.name], ["Voltage (mV)", "CO2 (µl)"]);
  assert.deepEqual([option.xAxis.type, option.xAxis.scale], ["value", true]);
});

test("without a fit, or for a measurement, only the points are plotted", () => {
  const option = xyOption(spec, [
    { name: "V0 vs [O2]", color: "#00fa9a", points: [[10, 1], [10, 2]], line: null },
    { name: "Vc vs [CO2]", color: null, points: [], line: null },
  ]);
  assert.deepEqual(option.series.map(s => [s.type, s.name, s.data.length]), [["scatter", "V0 vs [O2]", 2], ["scatter", "Vc vs [CO2]", 0]]);
  assert.equal(option.series[1].itemStyle.color, "--trace-blue", "a series without a colour takes the palette's");
  assert.equal(option.legend.show, true);
  assert.deepEqual(xyOption(spec).series, [], "no analysis yet");
});
