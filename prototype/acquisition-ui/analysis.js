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
