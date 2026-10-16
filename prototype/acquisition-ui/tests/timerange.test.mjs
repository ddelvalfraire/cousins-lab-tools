import assert from "node:assert/strict";
import { test } from "node:test";
import { advance, axisFor, extentOf, formatDuration, parseDuration, valueAt, windowFor } from "../timerange.js";

test("durations round-trip through HH:MM:SS, including negative event-relative times", () => {
  for (const s of [0, 59, 3725, -320, -0.5, 438.5]) assert.equal(parseDuration(formatDuration(s)), s);
  assert.equal(formatDuration(-320), "-00:05:20");
  assert.equal(parseDuration("05:20"), 320);
  assert.equal(parseDuration("12.5"), 12.5);
  assert.ok(Number.isNaN(parseDuration("5 min")));
  assert.ok(Number.isNaN(parseDuration("00:61:00")));
});

test("clock references read and write local wall time against the alignment origin", () => {
  const origin = new Date(2026, 9, 16, 14, 32, 14, 79).getTime();
  const axis = axisFor("clock", origin);
  assert.equal(axis.format(10), "14:32:24");
  assert.ok(Math.abs(axis.parse("14:32:24") - 9.921) < 1e-9);
  assert.equal(axisFor("event", origin).format(-1.5), "-00:00:01.5");
});

test("presets window the end of the data, custom keeps what was typed, all spans everything", () => {
  const extent = extentOf([[[-320, 1], [0, 2], [438.5, 3]], [], [[-10, 0], [500, 0]]]);
  assert.deepEqual(extent, [-320, 500]);
  assert.deepEqual(windowFor("60", extent), { start: 440, end: 500 });
  assert.deepEqual(windowFor("all", extent), { start: -320, end: 500 });
  assert.deepEqual(windowFor("300", [0, 120]), { start: 0, end: 120 });
  assert.deepEqual(windowFor("custom", extent, { start: -5, end: 5 }), { start: -5, end: 5 });
});

test("a metric reads the last sample at or before the playhead", () => {
  const points = [[0, 10], [1, 11], [2, 12], [4, 14]];
  assert.equal(valueAt(points, 3.9), 12);
  assert.equal(valueAt(points, 4), 14);
  assert.equal(valueAt(points, -1), null);
});

test("the playhead advances at the replay speed and stops at the window end", () => {
  assert.deepEqual(advance(10, 0.5, 4, { start: 0, end: 20 }), { cursor: 12, ended: false });
  assert.deepEqual(advance(19, 1, 4, { start: 0, end: 20 }), { cursor: 20, ended: true });
  assert.deepEqual(advance(-50, 0, 1, { start: 0, end: 20 }), { cursor: 0, ended: false });
});
