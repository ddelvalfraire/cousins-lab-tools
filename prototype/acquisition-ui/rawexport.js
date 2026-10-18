// Which raw-row exports the session page offers per capture. No DOM.

const LEGACY_COLUMNS = ["seq", "t_ms", "m32", "m34", "m36", "m44", "m45", "m46", "m47", "m49"];

/** One entry per capture with stored rows; `legacy` when it has t_ms and the eight masses, stored or as aliases. */
export function rawExports(captures) {
  return Object.entries(captures).filter(([, c]) => (c.rows ?? 0) > 0).map(([capture, c]) => {
    const names = new Set([...(c.columns ?? []).map(col => col.name), ...Object.keys(c.aliases ?? {})]);
    return { capture, rows: c.rows, legacy: LEGACY_COLUMNS.every(n => names.has(n)) };
  });
}
