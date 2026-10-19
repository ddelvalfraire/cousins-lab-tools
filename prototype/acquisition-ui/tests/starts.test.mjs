import assert from "node:assert/strict";
import { test } from "node:test";
import { startRoles, startsFrom } from "../starts.js";

const template = {
  roles: {
    ms: { label: "Mass spectrometer", start_delay_s: 0 },
    light: { label: "Ambit", start_delay_s: 30 },
    pump: { label: "Pump", enabled: false, start_delay_s: 5 },
  },
};
const roles = startRoles(template);

test("only enabled roles are offered, with the template's delay to stagger from", () => {
  assert.deepEqual(roles, [
    { role: "ms", label: "Mass spectrometer", delay: 0 },
    { role: "light", label: "Ambit", delay: 30 },
  ]);
});

test("together starts every role at once, overriding the template's delays", () => {
  assert.deepEqual(startsFrom("together", roles, { delays: { light: "30" }, hand: { light: true } }), {
    ms: { delay_s: 0 },
    light: { delay_s: 0 },
  });
});

test("stagger sends each typed delay in seconds", () => {
  assert.deepEqual(startsFrom("stagger", roles, { delays: { ms: "0", light: " 10.5 " } }), {
    ms: { delay_s: 0 },
    light: { delay_s: 10.5 },
  });
});

test("stagger refuses an empty, negative, or non-numeric delay and names the instrument", () => {
  for (const bad of ["", "-1", "ten"]) {
    assert.throws(() => startsFrom("stagger", roles, { delays: { ms: "0", light: bad } }), {
      message: "Enter a delay for Ambit in seconds, 0 or more.",
    });
  }
});

test("by hand marks the ticked roles manual and starts the others at once, and may tick them all", () => {
  assert.deepEqual(startsFrom("hand", roles, { hand: { light: true } }), {
    ms: { delay_s: 0 },
    light: { manual: true },
  });
  assert.deepEqual(startsFrom("hand", roles, { hand: { ms: true, light: true } }), {
    ms: { manual: true },
    light: { manual: true },
  });
});

