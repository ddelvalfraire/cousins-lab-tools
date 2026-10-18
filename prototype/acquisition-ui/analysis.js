// What the analysis tiles show, from the engine's analysis view. The engine computes every number; these
// functions only choose and word what to show and when a button may be pressed. No DOM.

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6, useGrouping: false });
export const fmtValue = v => (v == null ? "–" : number.format(v));

/** The capture ids of the session that record `role`, in manifest order. */
export const capturesFor = (captures, role) => Object.entries(captures || {}).filter(([, c]) => c.role === role).map(([cid]) => cid);

/** "mean m44 191.442 · 3 rows" for one reading value. */
export const readingText = v => `${v.stat} ${v.of} ${fmtValue(v.value)} · ${v.n} ${v.n === 1 ? "row" : "rows"}`;

const STEP_SOURCES = { read: "Read", typed: "Typed", copied: "Copied", loaded: "Loaded" };

/** Where a step's value came from, as a badge: the record, or for a copy or a load where it was taken from. */
export function stepSource(step) {
  if (!step?.source) return null;
  const from = step.from;
  const title = step.source === "copied" ? `Copied from session ${from.session}, ${from.record}`
    : step.source === "loaded" ? `Loaded from ${from.file}` : step.record;
  return { source: step.source, tag: STEP_SOURCES[step.source] ?? step.source, title };
}

/**
 * One row per step of a readings tile. `capture` is the capture a reading would read, `previews` maps a step
 * to the preview_reading result for the current selection ({values} or {error}). `names` maps a step to its
 * reading names (see stepReadings) and `editing` is {step, texts} while a value is being typed.
 */
export function readingRows(steps, analysis, { selection, capture, previews = {}, names = {}, editing = null }) {
  return steps.map(ref => {
    const step = analysis?.steps?.[ref];
    const reading = step?.reading ?? null;
    const values = step?.values ?? {};
    const why = !step ? "This step is not in the session's template"
      : !capture ? `No capture records role ${step.role}`
      : !selection ? "Select a range on a chart first" : "";
    const rows = n => `${n} ${n === 1 ? "row" : "rows"}`;
    return {
      step: ref,
      label: step?.label ?? ref,
      known: step?.known ?? null,
      saved: step?.source ? { record: step.record, range_s: reading?.range_s ?? null,
        values: reading ? Object.values(reading.values).map(readingText) : Object.entries(values).map(([n, v]) => `${n} ${fmtValue(v)}`),
        short: Object.values(values).map(fmtValue).join(", "),
        detail: reading ? Object.values(reading.values).map(v => rows(v.n)).join(", ") : "" } : null,
      source: stepSource(step),
      preview: previews[ref] && (previews[ref].error ? { error: previews[ref].error } : { values: Object.values(previews[ref].values).map(readingText) }),
      read: { disabled: !!why, why },
      remove: step?.record ?? null,
      typable: !!step,
      typing: step && editing?.step === ref ? (names[ref] ?? Object.keys(values)).map(name => ({ name, text: editing.texts[name] ?? "" })) : null,
    };
  });
}

/** Reading names per step reference, from the template data: what a typed value may fill. */
export function stepReadings(data) {
  const out = {};
  for (const [id, c] of Object.entries(data?.calibrations || {})) {
    if (c.line) for (const pt of Object.keys(c.line.points || {})) out[`${id}.${pt}`] = [c.line.reading.of];
    else out[id] = Object.keys(c.set || {});
  }
  for (const [id, m] of Object.entries(data?.measurements || {})) {
    if (m.steps) for (const [st, s] of Object.entries(m.steps)) out[`${id}.${st}`] = Object.keys(s.readings || {});
    else out[id] = Object.keys(m.readings || {});
  }
  return out;
}

/** The fields a typed edit of `step` starts with: the step's current values at full precision. */
export const typedStart = (ref, step, names) =>
  ({ step: ref, texts: Object.fromEntries((names ?? Object.keys(step?.values ?? {})).map(n => [n, step?.values?.[n] == null ? "" : String(step.values[n])])) });

/**
 * What a typed edit saves: {values} for the fields that hold a number, {error} for one that holds something else,
 * or {cancel} when nothing changed or every field is empty (Remove clears a step).
 */
export function parseTyped(texts, start) {
  const values = {};
  for (const [name, text] of Object.entries(texts)) {
    const t = String(text).trim();
    if (t === "") continue;
    const value = Number(t);
    if (!Number.isFinite(value)) return { error: `"${t}" is not a number` };
    values[name] = value;
  }
  const same = Object.keys(texts).every(n => String(texts[n]).trim() === String(start?.[n] ?? "").trim());
  return same || !Object.keys(values).length ? { cancel: true } : { values };
}

/** How many of a tile's steps hold a reading, for its progress bar. */
export const stepProgress = rows => ({ done: rows.filter(r => r.saved).length, total: rows.length });

/**
 * A readings tile's default title: the calibration or measurement its steps belong to when they share one,
 * else "Readings". A step ref is `owner.point` or the owner itself.
 */
export function readingsTitle(steps, data) {
  const owners = [...new Set((steps || []).map(ref => ref.split(".")[0]))];
  if (owners.length !== 1) return "Readings";
  const owner = data?.calibrations?.[owners[0]] ?? data?.measurements?.[owners[0]];
  return owner?.label || "Readings";
}

/**
 * What the selection would read, once per tile: steps that read the same thing over the same range preview the
 * same text, which the legacy screens showed once in a box rather than under every button.
 */
export function selectionLines(rows) {
  const lines = rows.flatMap(r => !r.preview ? [] : r.preview.error ? [{ text: r.preview.error, error: true }]
    : [{ text: r.preview.values.join(", "), error: false }]);
  return lines.filter((l, i) => lines.findIndex(m => m.text === l.text) === i);
}

const SOURCES = { default: "Default", computed: "Computed", entered: "Entered", fitted: "Fitted", trial: "Trial", unset: "Unset" };

/**
 * One row per parameter of an inputs tile (`names` empty means all), with its effective value and where it came
 * from. Before the analysis view arrives the template's own values show as defaults.
 */
export function parameterRows(names, analysis, templateParams = {}) {
  const params = analysis?.parameters
    ?? Object.fromEntries(Object.entries(templateParams).map(([k, p]) => [k, { ...p, value: p.value ?? null, entry: false, source: "default" }]));
  return Object.entries(params).filter(([k]) => !names?.length || names.includes(k)).map(([name, p]) => ({
    name,
    label: p.label || name,
    unit: p.unit || "",
    note: p.note || "",
    value: p.value,
    entry: !!p.entry,
    // The field holds only what was typed, so clearing it sends null and the value falls back.
    typed: p.source === "entered" && p.value != null ? String(p.value) : "",
    source: p.source,
    tag: SOURCES[p.source] + (p.source === "fitted" ? ` · ${p.calibration}` : ""),
    why: p.source === "unset" ? p.why : "",
  }));
}

/** A typed parameter value: a number, or null for an empty field, which clears the entry. */
export function parseEntry(text) {
  const t = String(text).trim();
  if (t === "") return { value: null };
  const value = Number(t);
  return Number.isFinite(value) ? { value } : { error: `"${t}" is not a number` };
}

const heading = c => (c.unit ? `${c.label} (${c.unit})` : c.label);
const cell = (row, c) => (c.kind === "label" ? row.labels[c.key] ?? "" : row.results[c.key] ?? null);

/**
 * A table tile: the draft row's results as read-outs, a field per label with what was typed (`typed`), the
 * saved rows, and which actions apply. Add needs a draft with a reading, which is all the engine requires.
 */
export function tableModel(measurement, analysis, typed = {}) {
  const table = analysis?.tables?.[measurement] ?? { columns: [], rows: [] };
  const draft = analysis?.drafts?.[measurement] ?? { readings: {}, results: {}, unset: [] };
  const columns = table.columns;
  return {
    labels: columns.filter(c => c.kind === "label").map(c => ({ key: c.key, label: c.label, value: typed[c.key] ?? "" })),
    draft: columns.filter(c => c.kind === "result").map(c => ({ key: c.key, label: c.label, unit: c.unit, value: draft.results[c.key] ?? null })),
    unset: draft.unset,
    headings: columns.map(heading),
    columns: columns.map(c => ({ label: c.label, unit: c.unit || "", numeric: c.kind !== "label" })),
    rows: table.rows.map(r => ({ record: r.record, cells: columns.map(c => {
      const v = cell(r, c);
      return c.kind === "label" ? v : fmtValue(v);
    }) })),
    canAdd: Object.keys(draft.readings).length > 0,
    hasRows: table.rows.length > 0,
  };
}

/** Every column of the table as tab-separated text with full-precision numbers, for the clipboard (B21). */
export function tableTsv(table) {
  const clean = v => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [table.columns.map(heading), ...table.rows.map(r => table.columns.map(c => cell(r, c)))]
    .map(line => line.map(clean).join("\t")).join("\n");
}

/** The records Clear table retracts: every row still in the table. */
export const tableRecords = table => (table?.rows || []).map(r => r.record);

/** The step references a template's readings tiles may list, in template order: what the layout editor offers. */
export function templateSteps(data) {
  const steps = [];
  for (const [id, c] of Object.entries(data.calibrations || {})) {
    if (c.line) for (const [pt, p] of Object.entries(c.line.points || {})) steps.push({ ref: `${id}.${pt}`, owner: id, label: p.label || pt, role: c.role });
    else steps.push({ ref: id, owner: id, label: c.label || id, role: c.role });
  }
  for (const [id, m] of Object.entries(data.measurements || {})) {
    if (m.steps) for (const [st, s] of Object.entries(m.steps)) steps.push({ ref: `${id}.${st}`, owner: id, label: s.label || st, role: m.role });
    else steps.push({ ref: id, owner: id, label: m.label || id, role: m.role });
  }
  return steps;
}
