import assert from "node:assert/strict";
import { test } from "node:test";
import { mountGrid } from "../components.js";

// The canvas the page mounts each view's grid into, with one button inside it.
const canvas = () => {
  const root = new EventTarget();
  const button = { dataset: { action: "read", step: "co2.ul1" } };
  return Object.assign(root, { contains: el => el === button, querySelector: () => null, closest: sel => (sel === "[data-action]" ? button : null) });
};

test("after a view is mounted again into the same canvas, one click runs its action once", () => {
  const root = canvas();
  const pressed = [];
  const ctx = { template: { data: { charts: [], derived: {} } }, actions: { read: d => pressed.push(d.step) } };
  const first = mountGrid(root, [], ctx);
  first.dispose();
  mountGrid(root, [], ctx);
  root.dispatchEvent(new Event("click"));
  assert.deepEqual(pressed, ["co2.ul1"]);
});
