import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, fillGaps, find, overlaps, placeBelow, settle, SIZES, uniqueId, visible } from "../layout.js";

const grid = () => [
  { id: "co2", kind: "chart", x: 0, y: 0, w: 4, h: 5 },
  { id: "fl", kind: "chart", x: 4, y: 0, w: 4, h: 5 },
  { id: "now", kind: "metric", x: 8, y: 0, w: 4, h: 2 },
  { id: "ctl", kind: "controls", x: 8, y: 2, w: 4, h: 3 },
  { id: "caps", kind: "captures", x: 0, y: 5, w: 12, h: 3 },
];
const noOverlap = items => items.every((a, i) => items.every((b, j) => i === j || !overlaps(a, b)));

test("moving a component onto others pushes them down and leaves no overlap", () => {
  const items = grid();
  Object.assign(items[4], { x: 0, y: 0 });
  settle(items, "caps");
  assert.ok(noOverlap(items));
  assert.deepEqual(items.map(c => [c.id, c.y]), [["co2", 3], ["fl", 3], ["now", 3], ["ctl", 5], ["caps", 0]]);
});

test("a resize past the grid edge is clamped to the 12 columns", () => {
  const items = grid();
  Object.assign(items[2], { w: 9 });
  settle(items, "now");
  assert.deepEqual([items[2].x, items[2].w], [3, 9]);
  assert.ok(noOverlap(items));
});

test("a new component goes below everything with its kind's default size", () => {
  const items = grid();
  const added = placeBelow(items, { id: "p", kind: "inputs" });
  assert.deepEqual([added.x, added.y, added.w, added.h], [0, 8, 6, 4]);
});

test("readings and table tiles get the engine's default sizes", () => {
  const items = grid();
  const readings = placeBelow(items, { id: "r", kind: "readings" });
  const table = placeBelow(items, { id: "t", kind: "table" });
  assert.deepEqual([readings.y, readings.w, readings.h], [8, 3, 6]);
  assert.deepEqual([table.y, table.w, table.h], [14, 4, 7]);
});

test("hidden components are dropped at every depth and ids stay unique", () => {
  const layout = { views: [{ id: "run", components: [...grid(), { id: "g", kind: "group", components: [{ id: "metric-1", kind: "metric" }] }] }] };
  const shown = visible(layout.views[0].components, { fl: "Role light is excluded", "metric-1": "Role light is excluded" });
  assert.deepEqual(shown.map(c => c.id), ["co2", "now", "ctl", "caps", "g"]);
  assert.deepEqual(shown.at(-1).components, []);
  assert.equal(find(layout, "metric-1").list, layout.views[0].components[5].components);
  assert.equal(uniqueId(layout, "metric"), "metric-2");
});

test("the catalog offers readings and table tiles in place of the old calibration entry, each with a size", () => {
  const kinds = CATALOG.map(c => c.kind);
  assert.ok(kinds.includes("readings") && kinds.includes("table"));
  assert.ok(!kinds.includes("calibration"));
  assert.deepEqual(CATALOG.filter(c => c.disabled), []);
  assert.deepEqual(kinds.filter(k => !SIZES[k]), []);
});

test("a component widens into the empty columns beside it, and the first in a band reaches the left edge", () => {
  const band = [
    { id: "co2", x: 0, y: 17, w: 3, h: 7 },
    { id: "o2", x: 4, y: 17, w: 3, h: 4 },
    { id: "o2-values", x: 4, y: 21, w: 3, h: 3 },
    { id: "table", x: 8, y: 17, w: 4, h: 7 },
  ];
  assert.deepEqual(fillGaps(band).map(c => [c.id, c.x, c.w]), [["co2", 0, 4], ["o2", 4, 4], ["o2-values", 4, 4], ["table", 8, 4]]);
  assert.deepEqual(band[0], { id: "co2", x: 0, y: 17, w: 3, h: 7 }, "the template's geometry is not changed");
  const centred = [{ id: "mean", x: 4, y: 0, w: 4, h: 2 }, { id: "chart", x: 0, y: 2, w: 12, h: 4 }];
  assert.deepEqual(fillGaps(centred).map(c => [c.id, c.x, c.w]), [["mean", 0, 12], ["chart", 0, 12]], "rows it does not share do not block it");
  const group = [{ id: "g", x: 0, y: 0, w: 12, h: 5, components: [{ id: "a", x: 2, y: 0, w: 4, h: 2 }] }];
  assert.deepEqual(fillGaps(group)[0].components.map(c => [c.x, c.w]), [[0, 12]], "groups are filled inside");
});
