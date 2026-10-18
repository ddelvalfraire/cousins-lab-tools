// Live points on their two axes. Every point carries x, seconds since the group start on the host clock,
// and t, seconds on the capture's own clock when it records one. A chart with `x: source` plots t, so replay
// speed changes how fast it fills and nothing else. No DOM.

import { walk } from "./layout.js";

/** "t" when a chart in the view plots the recording's own clock, else "x". The engine keeps a view on one axis. */
export function axisKeyFor(components, charts) {
  for (const [c] of walk(components)) if (c.kind === "chart" && charts[c.chart]?.x === "source") return "t";
  return "x";
}

export function livePoints() {
  const byAxis = { x: new Map(), t: new Map() };
  const list = (axis, key) => {
    if (!byAxis[axis].has(key)) byAxis[axis].set(key, []);
    return byAxis[axis].get(key);
  };
  return {
    add(role, rows) {
      for (const row of rows) {
        for (const [key, value] of Object.entries(row)) {
          if (key === "x" || key === "t" || value == null) continue;
          list("x", `${role}:${key}`).push([row.x, value]);
          if (row.t != null) list("t", `${role}:${key}`).push([row.t, value]);
        }
      }
    },
    series: (axis, role, value) => byAxis[axis].get(`${role}:${value}`) || [],
    all: axis => [...byAxis[axis].values()],
    clear: () => Object.values(byAxis).forEach(m => m.clear()),
  };
}

/**
 * Takes one session_live reply's rows into state {points, cursors, paramsRev}. A new params_rev means the engine
 * recomputed its buffer with new parameters, so every held point is stale: they are cleared and the row cursors
 * go back to 0. The reply's own rows are dropped as well, since they may have been read before the recompute.
 * Returns whether it reset.
 */
export function absorbRows(state, live) {
  const reset = state.paramsRev != null && live.params_rev !== state.paramsRev;
  state.paramsRev = live.params_rev;
  if (reset) state.points.clear();
  for (const [role, cap] of Object.entries(live.captures)) {
    state.cursors[role] = reset ? 0 : cap.next;
    state.cursors[`${role}:events`] = cap.events_next;
    if (!reset) state.points.add(role, cap.rows);
  }
  return reset;
}
