import assert from "node:assert/strict";
import { test } from "node:test";
import { gapBands, lineOption } from "../charts.js";

globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: name => name });

// The legacy-frames fixture on the elapsed axis: frames 4 to 6 are missing after 0.84 s and frame 9 after 2.415 s.
const m44 = { trial: "trial-1", points: [[0.735, 1], [0.84, 2], [1.995, 3], [2.1, 4], [2.415, 5], [2.94, 6]] };
const gaps = [{ trial: "trial-1", label: "Frames 4 to 6 missing", x: 0.84 }, { trial: "trial-1", label: "Frame 9 missing", x: 2.415 }];

test("a gap's band runs from the row before it to the first row after it", () => {
  assert.deepEqual(gapBands(gaps, [m44]), [
    { from: 0.84, to: 1.995, label: "Frames 4 to 6 missing" },
    { from: 2.415, to: 2.94, label: "Frame 9 missing" },
  ]);
});

test("the band ends at the earliest row after the gap in any series of its trial, and ignores other trials", () => {
  const thinned = { trial: "trial-1", points: [[0.84, 1], [2.1, 2]] };
  const other = { trial: "trial-2", points: [[0.9, 1]] };
  assert.deepEqual(gapBands([gaps[0]], [thinned, other, m44]), [{ from: 0.84, to: 1.995, label: "Frames 4 to 6 missing" }]);
});

test("a gap with no row after it yet, at the tail of a live run, has no band", () => {
  const live = { points: [[0.735, 1], [0.84, 2]] };
  assert.deepEqual(gapBands([{ label: "Frames 4 to 6 missing", x: 0.84 }], [live]), []);
  assert.deepEqual(gapBands([{ label: "Frames 4 to 6 missing", x: 0.84 }], [{ points: [...live.points, [1.995, 3]] }]),
    [{ from: 0.84, to: 1.995, label: "Frames 4 to 6 missing" }], "a live series has no trial, nor do its gaps");
});

test("a live row one bit above its gap's x is still the row before the gap", () => {
  const live = { points: [[788.9590000000001, 1], [886.789, 2]] };
  assert.deepEqual(gapBands([{ label: "Frames 890 to 999 missing", x: 788.959 }], [live]),
    [{ from: 788.959, to: 886.789, label: "Frames 890 to 999 missing" }]);
});

test("gap bands and the selection band share the first series' markArea", () => {
  const option = lineOption({ series: [m44, { ...m44 }], gaps, selection: { from: 2, to: 2.2 } });
  const area = option.series[0].markArea;
  assert.deepEqual(area.data.map(([a, b]) => [a.xAxis, b.xAxis, a.name]), [
    [0.84, 1.995, "Frames 4 to 6 missing"],
    [2.415, 2.94, "Frame 9 missing"],
    [2, 2.2, undefined],
  ]);
  assert.equal(area.data[0][0].itemStyle.color, "--warning-text");
  assert.equal(area.itemStyle.color, "--accent", "the selection keeps its own tint");
  assert.equal(area.emphasis.label.show, true, "a gap's label shows on hover");
  assert.equal(option.series[1].markArea, undefined);
  assert.equal(lineOption({ series: [m44] }).series[0].markArea, undefined, "no gaps, no selection, no band");
});
