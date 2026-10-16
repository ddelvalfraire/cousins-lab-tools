// Display windows and the replay playhead over an x axis in seconds. View state only: nothing here writes data.

export const RANGE_PRESETS = [["30", "Last 30 s"], ["60", "Last 1 min"], ["300", "Last 5 min"], ["all", "All"]];

/** Signed HH:MM:SS, with tenths when the value has them. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const sign = seconds < 0 ? "-" : "";
  const tenths = Math.round(Math.abs(seconds) * 10);
  const s = Math.floor(tenths / 10);
  const hms = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
  return sign + hms + (tenths % 10 ? `.${tenths % 10}` : "");
}

/** Accepts [-]HH:MM:SS[.fff], [-]MM:SS, or plain seconds. NaN when it is none of these. */
export function parseDuration(text) {
  const value = String(text).trim();
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  const m = value.match(/^(-?)(?:(\d+):)?([0-5]?\d):([0-5]\d(?:\.\d+)?)$/);
  if (!m) return NaN;
  const total = Number(m[2] || 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return m[1] ? -total : total;
}

/**
 * How x is written and read on each reference. Clock x is seconds after the alignment's clock origin,
 * shown as local wall time; elapsed and event x are signed durations.
 */
export function axisFor(reference, originMs) {
  if (reference === "clock" && originMs != null) {
    const day = new Date(originMs);
    day.setHours(0, 0, 0, 0);
    return {
      format: x => new Date(originMs + x * 1000).toLocaleTimeString([], { hour12: false }),
      parse: text => {
        const s = parseDuration(text);
        return Number.isFinite(s) ? (day.getTime() + s * 1000 - originMs) / 1000 : NaN;
      },
    };
  }
  return { format: formatDuration, parse: parseDuration };
}

export function extentOf(seriesLists) {
  let min = Infinity, max = -Infinity;
  for (const points of seriesLists) {
    if (!points.length) continue;
    min = Math.min(min, points[0][0]);
    max = Math.max(max, points[points.length - 1][0]);
  }
  return Number.isFinite(min) ? [min, max] : [0, 0];
}

/** mode: a preset key ("30", "all", ...) or "custom" with {start, end}. */
export function windowFor(mode, [min, max], custom) {
  if (mode === "custom" && custom) return { start: custom.start, end: custom.end };
  if (mode === "all") return { start: min, end: max };
  return { start: Math.max(min, max - Number(mode)), end: max };
}

/** The last y at or before x, from points sorted by x. */
export function valueAt(points, x) {
  let lo = 0, hi = points.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) { found = points[mid][1]; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Advance the playhead by wall seconds at a replay speed, stopping at the window's end. */
export function advance(cursor, wallSeconds, speed, window) {
  const next = Math.min(window.end, Math.max(window.start, cursor) + wallSeconds * speed);
  return { cursor: next, ended: next >= window.end };
}
