// What the analysis tiles show, from the engine's analysis view. The engine computes every number; these
// functions only choose and word what to show and when a button may be pressed. No DOM.

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6, useGrouping: false });
export const fmtValue = v => (v == null ? "–" : number.format(v));

/** The capture ids of the session that record `role`, in manifest order. */
export const capturesFor = (captures, role) => Object.entries(captures || {}).filter(([, c]) => c.role === role).map(([cid]) => cid);

/** "mean m44 191.442 · 3 rows" for one reading value. */
export const readingText = v => `${v.stat} ${v.of} ${fmtValue(v.value)} · ${v.n} ${v.n === 1 ? "row" : "rows"}`;

/**
 * One row per step of a readings tile. `capture` is the capture a reading would read, `previews` maps a step
 * to the preview_reading result for the current selection ({values} or {error}).
 */
export function readingRows(steps, analysis, { selection, capture, previews = {} }) {
  return steps.map(ref => {
    const step = analysis?.steps?.[ref];
    const reading = step?.reading ?? null;
    const why = !step ? "This step is not in the session's template"
      : !capture ? `No capture records role ${step.role}`
      : !selection ? "Select a range on a chart first" : "";
    return {
      step: ref,
      label: step?.label ?? ref,
      known: step?.known ?? null,
      saved: reading && { record: reading.record, range_s: reading.range_s, values: Object.values(reading.values).map(readingText) },
      preview: previews[ref] && (previews[ref].error ? { error: previews[ref].error } : { values: Object.values(previews[ref].values).map(readingText) }),
      read: { disabled: !!why, why },
      remove: reading?.record ?? null,
    };
  });
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
