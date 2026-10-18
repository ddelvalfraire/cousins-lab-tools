import assert from "node:assert/strict";
import { test } from "node:test";
import { rawExports } from "../rawexport.js";

const cols = names => names.map(name => ({ name }));
const masses = ["m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49"];

test("captures with rows are offered, and the legacy layout only where t_ms and all eight masses exist", () => {
  const captures = {
    "ms-sampledata": { rows: 84665, columns: cols(["seq", "t_host_utc", "t_ms", "frame", ...masses]) },
    ms: { rows: 12, columns: cols(["seq", "t_legacy_ms", "ch1", "ch3"]), aliases: { ...Object.fromEntries(masses.map(m => [m, "ch1"])), t_ms: "t_legacy_ms" } },
    jii: { rows: 9, columns: cols(["seq", "t_elapsed_s", "m32", "m44", "m45"]) },
    empty: { rows: 0, columns: cols(["seq", "t_ms", ...masses]) },
  };
  assert.deepEqual(rawExports(captures), [
    { capture: "ms-sampledata", rows: 84665, legacy: true },
    { capture: "ms", rows: 12, legacy: true },
    { capture: "jii", rows: 9, legacy: false },
  ]);
});
