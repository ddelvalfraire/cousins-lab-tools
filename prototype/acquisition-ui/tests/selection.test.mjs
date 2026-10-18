import assert from "node:assert/strict";
import { test } from "node:test";
import { rangeFromBrush, selectable } from "../selection.js";
import { timeChartPaint } from "../components.js";

globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: name => name });

const pressure = { id: "pressure", x: "source", series: [{ role: "ms", value: "ubar_co2" }, { role: "ms", value: "m44" }] };
const runClock = { id: "co2", series: [{ role: "ms", value: "m44" }] };
const calibration = { id: "co2_cal", kind: "xy", x: "source", series: [{ calibration: "co2" }] };

test("only time charts on the recording's clock take a selection, and on review only on the elapsed reference", () => {
  assert.equal(selectable(pressure, { live: true }), true);
  assert.equal(selectable(runClock, { live: true }), false);
  assert.equal(selectable(calibration, { live: true }), false);
  assert.equal(selectable(pressure, { live: false, reference: "elapsed" }), true);
  assert.equal(selectable(pressure, { live: false, reference: "event" }), false);
  assert.equal(selectable(undefined, { live: true }), false);
});

test("a brushed span becomes {from, to} in the chart's x, whichever way it was dragged", () => {
  assert.deepEqual(rangeFromBrush([{ brushType: "lineX", range: [300, 120], coordRange: [958.0, 905.1] }]), { from: 905.1, to: 958.0 });
  assert.equal(rangeFromBrush([]), null, "a click clears the brush");
  assert.equal(rangeFromBrush(undefined), null);
  assert.equal(rangeFromBrush([{ brushType: "lineX", coordRange: [12, 12] }]), null, "no width");
  assert.equal(rangeFromBrush([{ brushType: "lineX", coordRange: [NaN, 12] }]), null);
  assert.equal(rangeFromBrush([{ brushType: "rect", coordRange: [[1, 2], [3, 4]] }]), null);
});

const frame = (select, version = 1) => ({
  dataset: {
    version, axis: { name: "Recording clock" },
    chartSeries: () => [{ name: "ms · ubar_co2", points: [[900, 1], [960, 2]] }, { name: "ms · m44", points: [[900, 3]] }],
    chartMarkers: () => [],
  },
  window: { start: 900, end: 960 }, cursor: null, select,
});

test("the selection is drawn as a band in the rebuilt option, so every notMerge repaint keeps it", () => {
  const range = { from: 905.1, to: 958.0 };
  const live = { live: true, range, active: false, version: 1 };
  const first = timeChartPaint(pressure, "pressure", frame(live, 1));
  const later = timeChartPaint(pressure, "pressure", frame(live, 2));
  for (const paint of [first, later]) {
    const option = paint.option();
    assert.deepEqual(option.series[0].markArea.data, [[{ xAxis: 905.1 }, { xAxis: 958.0 }]]);
    assert.equal(option.series[1].markArea, undefined, "one band per chart");
    assert.deepEqual(option.brush, { brushType: "lineX", brushMode: "single", xAxisIndex: 0, seriesIndex: [], transformable: false, removeOnClick: true });
  }
  assert.notEqual(first.key, later.key, "new data rebuilds the option");
  assert.equal(first.takeCursor, false, "pan mode leaves the inside zoom its drag");

  const cleared = timeChartPaint(pressure, "pressure", frame({ ...live, range: null, version: 2 }, 1));
  assert.notEqual(cleared.key, first.key, "clearing the selection repaints");
  assert.equal(cleared.option().series[0].markArea, undefined);

  const selecting = timeChartPaint(pressure, "pressure", frame({ ...live, active: true }, 1));
  assert.notEqual(selecting.key, first.key, "switching to select mode repaints");
  assert.equal(selecting.takeCursor, true, "a rebuilt chart takes the brush cursor again");
});

test("a chart that takes no selection has no band or brush, and the selection does not repaint it", () => {
  const range = { from: 905.1, to: 958.0 };
  const review = { live: false, reference: "event", range, active: true, version: 3 };
  const paint = timeChartPaint(pressure, "pressure", frame(review));
  assert.equal(paint.option().series[0].markArea, undefined);
  assert.equal(paint.option().brush, undefined);
  assert.equal(paint.takeCursor, false);
  assert.equal(paint.key, timeChartPaint(pressure, "pressure", frame({ ...review, range: null, version: 4 })).key);
});
