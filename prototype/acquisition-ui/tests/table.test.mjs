import assert from "node:assert/strict";
import { test } from "node:test";
import { tableModel, tableRecords, tableTsv } from "../analysis.js";

const analysis = {
  drafts: {
    sample: { readings: { co2_mv: { stat: "mean", of: "m44", value: 60.1, n: 40 } }, records: ["rec-000007"], results: { pct: 2.3141592, o2: null }, unset: ["o2_cal"] },
    blank: { readings: {}, records: [], results: { pct: null, o2: null }, unset: ["co2_mv"] },
  },
  tables: {
    sample: {
      columns: [{ key: "name", label: "Sample Name", unit: "", kind: "label" }, { key: "pct", label: "%CO2", unit: "%", kind: "result" },
        { key: "o2", label: "O2", unit: "µmol/L", kind: "result" }],
      rows: [
        { record: "rec-000005", created_utc: "2026-10-18T10:00:00+00:00", labels: { name: "leaf 1" }, results: { pct: 2.3141592, o2: null } },
        { record: "rec-000009", created_utc: "2026-10-18T10:05:00+00:00", labels: { name: "leaf\t2\nb" }, results: { pct: 0.000628331, o2: 258.0025 } },
      ],
    },
    blank: { columns: [{ key: "pct", label: "%CO2", unit: "%", kind: "result" }], rows: [] },
  },
};

test("the table tile shows the draft results, a field per label, the rows, and Add once the draft has a reading", () => {
  const t = tableModel("sample", analysis, { name: "leaf 3" });
  assert.deepEqual(t.draft, [{ key: "pct", label: "%CO2", unit: "%", value: 2.3141592 }, { key: "o2", label: "O2", unit: "µmol/L", value: null }]);
  assert.deepEqual(t.unset, ["o2_cal"]);
  assert.deepEqual(t.labels, [{ key: "name", label: "Sample Name", value: "leaf 3" }]);
  assert.deepEqual(t.headings, ["Sample Name", "%CO2 (%)", "O2 (µmol/L)"]);
  assert.deepEqual(t.columns, [
    { label: "Sample Name", unit: "", numeric: false },
    { label: "%CO2", unit: "%", numeric: true },
    { label: "O2", unit: "µmol/L", numeric: true },
  ], "the unit sits under the heading and numbers align right");
  assert.deepEqual(t.rows, [
    { record: "rec-000005", cells: ["leaf 1", "2.31416", "–"] },
    { record: "rec-000009", cells: ["leaf\t2\nb", "0.000628331", "258.003"] },
  ]);
  assert.deepEqual([t.canAdd, t.hasRows], [true, true]);

  const empty = tableModel("blank", analysis);
  assert.deepEqual([empty.canAdd, empty.hasRows, empty.labels], [false, false, []], "Draft has no readings");
  assert.deepEqual(tableModel("sample", null).rows, [], "no view yet");
});

test("Copy puts every column on the clipboard as TSV with full-precision numbers (B21)", () => {
  assert.equal(tableTsv(analysis.tables.sample), [
    "Sample Name\t%CO2 (%)\tO2 (µmol/L)",
    "leaf 1\t2.3141592\t",
    "leaf 2 b\t0.000628331\t258.0025",
  ].join("\n"));
  assert.equal(tableTsv(analysis.tables.blank), "%CO2 (%)");
});

test("Clear table retracts every row still in the table", () => {
  assert.deepEqual(tableRecords(analysis.tables.sample), ["rec-000005", "rec-000009"]);
  assert.deepEqual(tableRecords(analysis.tables.blank), []);
});
