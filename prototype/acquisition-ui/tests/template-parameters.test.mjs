import assert from "node:assert/strict";
import { test } from "node:test";
import { parameterField, parameterWithDefault } from "../template-parameters.js";

test("calculated parameters show their formula and cannot be edited as defaults", () => {
  const html = parameterField("pressure", { label: "CO2 pressure", expr: "p * 10 / volume", unit: "µbar" });
  assert.ok(html.includes("Calculated") && html.includes("p * 10 / volume"));
  assert.ok(!html.includes("<input"));
});

test("an unset numeric default is blank, and zero remains a valid explicit default", () => {
  const unset = parameterField("temp", { label: "Temperature", unit: "°C" });
  assert.match(unset, /value=""/);
  assert.ok(!unset.includes("undefined"));
  assert.match(parameterField("zero", { value: 0 }), /value="0"/);
});

test("clearing a default removes it instead of changing it to zero", () => {
  const original = { value: 25, label: "Temperature", entry: true, unit: "°C" };
  assert.deepEqual(parameterWithDefault(original, ""), { label: "Temperature", entry: true, unit: "°C" });
  assert.equal(parameterWithDefault(original, "0").value, 0);
  assert.equal(parameterWithDefault(original, "-0.25").value, -0.25);
  assert.equal(original.value, 25);
  assert.throws(() => parameterWithDefault(original, "oops"), /not a number/);
});
