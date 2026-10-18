import assert from "node:assert/strict";
import { test } from "node:test";
import { importFiles, importSlots, profileChoices, runInputs, runSources, sourcesFrom } from "../importing.js";

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
  assert.deepEqual(brief(slots), [["ms", "Legacy frame files (zip or folder) (role ms)", "SampleData.zip", "SampleData"]]);
  assert.deepEqual(slots[0].files, recordings.legacy_frames);
});

test("a role whose kind has no recordings still gets an empty slot", () => {
  assert.deepEqual(brief(importSlots({ roles: { ms: { import: "legacy_frames" } } }, {})), [
    ["ms", "Legacy frame files (zip or folder) (role ms)", "", ""],
  ]);
});

test("a typed path wins over the suggestion, and a slot with neither is left out", () => {
  const slots = importSlots({ roles: { ms: { import: "legacy_frames" }, light: { import: "ambit_csv" } } }, recordings);
  const values = [
    { chosen: "C:\\repo\\module2\\SampleData.zip", typed: "  D:\\lab\\Acquisition-12\\ ", label: "Acquisition-12" },
    { chosen: "/repo/ambit/Ambit raw data_sample_150_pl1.csv", typed: "", label: "150-pl1" },
    { chosen: "", typed: " ", label: "" },
  ];
  assert.deepEqual(importFiles(slots, i => values[i]), [
    { role: "ms", path: "D:\\lab\\Acquisition-12\\", label: "Acquisition-12" },
    { role: "light", path: "/repo/ambit/Ambit raw data_sample_150_pl1.csv", label: "150-pl1" },
  ]);
  assert.equal(slots[0].labelFor("D:\\lab\\Acquisition-12\\"), "Acquisition-12");
  assert.equal(slots[0].labelFor("/lab/frames.ZIP"), "frames");
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

test("a run offers a source field for replays and real spools, not for simulators or excluded roles", () => {
  const instruments = [
    { id: "frames", adapter: "legacy_frames_replay", input_kind: "replay", settings: { path: "/repo/module2/SampleData.zip" } },
    { id: "ambit", adapter: "ambit_replay", input_kind: "replay", settings: { recording: "/repo/pl1.csv" } },
    { id: "spool", adapter: "ezview_spool", input_kind: "hardware", settings: { spool_path: "" } },
    { id: "sim", adapter: "ezview_spool", input_kind: "simulated", settings: {}, simulate: { workbook: "x" } },
  ];
  const template = { roles: {
    ms: { instrument: "frames", label: "Mass spectrometer" }, light: { instrument: "ambit", enabled: false },
    live: { instrument: "spool" }, sim: { instrument: "sim" }, gone: { instrument: "missing" },
  } };
  assert.deepEqual(runSources(template, instruments), [
    { role: "ms", label: "Mass spectrometer", path: "/repo/module2/SampleData.zip", hardware: false },
    { role: "live", label: "live", path: "", hardware: true },
  ]);
  assert.deepEqual(sourcesFrom([["ms", "  /lab/Acquisition12 "], ["live", ""], ["x", null]]), { ms: "/lab/Acquisition12" });
});

test("a role is offered the profiles the engine found compatible, and always its own", () => {
  const instruments = ["frames", "spool8", "ms2", "ambit"].map(id => ({ id, adapter: id === "ambit" ? "ambit_replay" : "x" }));
  const ids = list => list.map(p => p.id);
  assert.deepEqual(ids(profileChoices({ ms: ["frames", "spool8"] }, "ms", "frames", instruments)), ["frames", "spool8"]);
  assert.deepEqual(ids(profileChoices({}, "ms", "ms2", instruments)), ["ms2"]);
  assert.deepEqual(ids(profileChoices(undefined, "light", "ambit", instruments)), ["ambit"]);
});
