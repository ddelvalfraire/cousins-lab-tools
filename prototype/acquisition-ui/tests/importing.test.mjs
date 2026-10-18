import assert from "node:assert/strict";
import { test } from "node:test";
import { importSlots, runInputs } from "../importing.js";

const recordings = {
  ms_workbook: ["/repo/reference/instruments/mass-spec/Raw data-mass spec.xlsx"],
  ambit_csv: ["/repo/ambit/Ambit raw data_sample_150_pl1.csv", "/repo/ambit/Ambit raw data_sample_150_pl2.csv"],
  legacy_frames: ["C:\\repo\\module2\\SampleData.zip"],
};
const brief = slots => slots.map(s => [s.role, s.title, s.path && s.path.split(/[\\/]/).pop(), s.label]);

test("the JII template offers its workbook and each Ambit recording with the labels its capture ids use", () => {
  const jii = { roles: { ms: { import: "ms_workbook" }, light: { import: "ambit_csv" } } };
  assert.deepEqual(brief(importSlots(jii, recordings)), [
    ["ms", "Mass spectrometer workbook (role ms)", "Raw data-mass spec.xlsx", "workbook"],
    ["light", "Ambit recording 1 (role light)", "Ambit raw data_sample_150_pl1.csv", "150-pl1"],
    ["light", "Ambit recording 2 (role light)", "Ambit raw data_sample_150_pl2.csv", "150-pl2"],
  ]);
});

test("a legacy frames role offers the sample zip, and roles that import nothing get no slot", () => {
  const legacy = { roles: { ms: { import: "legacy_frames" }, pump: { instrument: "pump" }, gas: { import: "netcdf" } } };
  const slots = importSlots(legacy, recordings);
  assert.deepEqual(brief(slots), [["ms", "Legacy frame files (zip) (role ms)", "SampleData.zip", "SampleData"]]);
  assert.deepEqual(slots[0].files, recordings.legacy_frames);
});

test("a role whose kind has no recordings still gets an empty slot", () => {
  assert.deepEqual(brief(importSlots({ roles: { ms: { import: "legacy_frames" } } }, {})), [
    ["ms", "Legacy frame files (zip) (role ms)", "", ""],
  ]);
});

test("a run names the profiles its template's roles use and takes its name suffix from their input kinds", () => {
  const instruments = [
    { id: "ms2-ezview-simulated", label: "Mass spectrometer 2, EZView spool (simulated)", input_kind: "simulated" },
    { id: "ambit-replay-150-pl1", label: "Ambit, replay of sample 150 plant 1", input_kind: "replay" },
    { id: "ms-legacy-frames-replay", label: "Mass spectrometer, replay of legacy frame files", input_kind: "replay" },
  ];
  const jii = { roles: { ms: { instrument: "ms2-ezview-simulated" }, light: { instrument: "ambit-replay-150-pl1" } } };
  assert.deepEqual(runInputs(jii, instruments), {
    labels: ["Mass spectrometer 2, EZView spool (simulated)", "Ambit, replay of sample 150 plant 1"],
    suffix: "simulated and replay",
  });
  const module2 = { roles: { ms: { instrument: "ms-legacy-frames-replay" } } };
  assert.deepEqual(runInputs(module2, instruments), { labels: ["Mass spectrometer, replay of legacy frame files"], suffix: "replay" });
  assert.deepEqual(runInputs({ roles: { ms: { instrument: "gone" } } }, instruments), { labels: [], suffix: "run" });
});
