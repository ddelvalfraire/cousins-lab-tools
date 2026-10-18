import assert from "node:assert/strict";
import { test } from "node:test";
import { absorbRows, axisKeyFor, livePoints } from "../livepoints.js";

const charts = { pressure: { id: "pressure", x: "source" }, co2: { id: "co2" } };

test("a view plots the recording's clock when one of its charts says x: source, at any depth", () => {
  assert.equal(axisKeyFor([{ id: "a", kind: "chart", chart: "co2" }], charts), "x");
  assert.equal(axisKeyFor([{ id: "a", kind: "chart", chart: "pressure" }], charts), "t");
  const nested = [{ id: "g", kind: "group", components: [{ id: "b", kind: "chart", chart: "pressure" }] }];
  assert.equal(axisKeyFor(nested, charts), "t");
  assert.equal(axisKeyFor([{ id: "ctl", kind: "controls" }], charts), "x");
});

test("points are kept on both axes and a row without t is left off the source axis", () => {
  const points = livePoints();
  points.add("ms", [
    { x: 0.5, t: 100.1, m44: 2, ubar_co2: null },
    { x: 1.0, t: null, m44: 3, ubar_co2: 7 },
    { x: 1.5, t: 101.1, m44: 4, ubar_co2: 8 },
  ]);
  assert.deepEqual(points.series("x", "ms", "m44"), [[0.5, 2], [1.0, 3], [1.5, 4]]);
  assert.deepEqual(points.series("t", "ms", "m44"), [[100.1, 2], [101.1, 4]]);
  assert.deepEqual(points.series("x", "ms", "ubar_co2"), [[1.0, 7], [1.5, 8]]);
  assert.deepEqual(points.series("t", "ms", "ubar_co2"), [[101.1, 8]]);
  assert.deepEqual(points.series("t", "ms", "t"), [], "the clocks are not values");
  assert.deepEqual(points.series("x", "light", "m44"), [], "another role has its own series");
  assert.deepEqual(points.all("t"), [[[100.1, 2], [101.1, 4]], [[101.1, 8]]]);
});

const reply = (rev, rows, next) => ({ params_rev: rev, captures: { ms: { rows, next, events: [], events_next: 2 } } });

test("a new params_rev clears the held points and polls rows from cursor 0, keeping the event cursor", () => {
  const state = { points: livePoints(), cursors: {}, paramsRev: null };
  assert.equal(absorbRows(state, reply(4, [{ x: 0.5, t: 10, ubar_co2: 1 }], 1)), false, "the first reply sets the revision");
  assert.equal(absorbRows(state, reply(4, [{ x: 1.0, t: 11, ubar_co2: 2 }], 2)), false);
  assert.deepEqual(state.points.series("t", "ms", "ubar_co2"), [[10, 1], [11, 2]]);
  assert.deepEqual(state.cursors, { ms: 2, "ms:events": 2 });

  assert.equal(absorbRows(state, reply(5, [{ x: 1.5, t: 12, ubar_co2: 3 }], 3)), true);
  assert.deepEqual(state.points.series("t", "ms", "ubar_co2"), [], "stale points and the reply's own rows are dropped");
  assert.deepEqual(state.points.series("x", "ms", "ubar_co2"), []);
  assert.deepEqual(state.cursors, { ms: 0, "ms:events": 2 });

  assert.equal(absorbRows(state, reply(5, [{ x: 0.5, t: 10, ubar_co2: 9 }, { x: 1.5, t: 12, ubar_co2: 10 }], 3)), false);
  assert.deepEqual(state.points.series("t", "ms", "ubar_co2"), [[10, 9], [12, 10]], "the recomputed buffer from the start");
  assert.equal(state.cursors.ms, 3);
});
