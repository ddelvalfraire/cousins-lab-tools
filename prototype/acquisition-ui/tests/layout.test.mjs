import assert from "node:assert/strict";
import { test } from "node:test";
import { find, overlaps, placeBelow, settle, uniqueId, visible } from "../layout.js";

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

test("hidden components are dropped at every depth and ids stay unique", () => {
  const layout = { views: [{ id: "run", components: [...grid(), { id: "g", kind: "group", components: [{ id: "metric-1", kind: "metric" }] }] }] };
  const shown = visible(layout.views[0].components, { fl: "Role light is excluded", "metric-1": "Role light is excluded" });
  assert.deepEqual(shown.map(c => c.id), ["co2", "now", "ctl", "caps", "g"]);
  assert.deepEqual(shown.at(-1).components, []);
  assert.equal(find(layout, "metric-1").list, layout.views[0].components[5].components);
  assert.equal(uniqueId(layout, "metric"), "metric-2");
});
