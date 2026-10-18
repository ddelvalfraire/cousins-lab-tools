// Grid geometry for template layouts. No DOM: the engine validates, this keeps edits valid while dragging.

export const COLUMNS = 12;
export const SIZES = { chart: [8, 4], metric: [4, 2], controls: [4, 3], inputs: [6, 4], captures: [12, 3], group: [12, 5], readings: [3, 6], table: [4, 7] };

export const CATALOG = [
  { kind: "chart", name: "Chart", section: "Visualize", icon: "chart", description: "A template chart over the run clock or alignment" },
  { kind: "metric", name: "Metric", section: "Visualize", icon: "hash", description: "The latest value of a derived value, with its unit" },
  { kind: "captures", name: "Capture table", section: "Visualize", icon: "table", description: "Requested start, start command, first sample, rows" },
  { kind: "inputs", name: "Parameters", section: "Configure", icon: "sliders", description: "Effective parameter values and where they came from; entry parameters can be typed in" },
  { kind: "controls", name: "Run controls", section: "Operate", icon: "power", description: "Mark, Stop, Cancel, readiness, capture status" },
  { kind: "readings", name: "Readings", section: "Operate", icon: "flag", description: "A button per calibration or measurement step that reads the selected range" },
  { kind: "table", name: "Results table", section: "Operate", icon: "table", description: "A measurement's next row, Add to table, Export, Copy, Clear, and its rows" },
  { kind: "group", name: "Component group", section: "Arrange", icon: "grid", description: "A nested grid" },
];

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const bottom = items => items.reduce((max, c) => Math.max(max, c.y + c.h), 0);

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(value) || 0)));

/** Clamp the moved or resized component into the grid, then push anything it now covers further down. */
export function settle(items, id) {
  const active = items.find(c => c.id === id);
  if (!active) return items;
  active.w = clamp(active.w, 1, COLUMNS);
  active.h = clamp(active.h, 1, 24);
  active.x = clamp(active.x, 0, COLUMNS - active.w);
  active.y = clamp(active.y, 0, Infinity);
  const placed = [active];
  for (const c of items.filter(c => c !== active).sort((a, b) => a.y - b.y || a.x - b.x)) {
    let hit;
    while ((hit = placed.find(p => overlaps(c, p)))) c.y = hit.y + hit.h;
    placed.push(c);
  }
  return items;
}

export function placeBelow(items, component) {
  const [w, h] = SIZES[component.kind];
  Object.assign(component, { x: 0, y: bottom(items), w: component.w ?? w, h: component.h ?? h });
  items.push(component);
  return component;
}

/** Depth-first: every component with the list that holds it. */
export function* walk(items) {
  for (const c of items) {
    yield [c, items];
    if (c.components) yield* walk(c.components);
  }
}

export const find = (layout, id) => {
  for (const view of layout.views) for (const [c, list] of walk(view.components)) if (c.id === id) return { component: c, list, view };
  return null;
};

export const visible = (items, hidden) =>
  items.filter(c => !hidden[c.id]).map(c => (c.components ? { ...c, components: visible(c.components, hidden) } : c));

export function uniqueId(layout, base) {
  const taken = new Set(layout.views.flatMap(v => [...walk(v.components)].map(([c]) => c.id)));
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const rowsMeet = (a, b) => a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Widen each component into the empty columns beside it, so a layout has no holes at run time: gaps a
 * template leaves, and gaps left by components hidden with an excluded role. A component grows right up to
 * the next component sharing any of its rows, and the first in a band also grows left to the edge. Groups
 * are filled inside. Returns new objects; the template's own geometry is untouched.
 */
export function fillGaps(items, columns = COLUMNS) {
  const placed = items.map(c => ({ ...c, ...(c.components ? { components: fillGaps(c.components, columns) } : {}) }));
  for (const c of placed) {
    const right = placed.filter(o => o !== c && rowsMeet(o, c) && o.x >= c.x + c.w).map(o => o.x);
    c.w = Math.min(columns, ...right) - c.x;
  }
  for (const c of placed) {
    const left = placed.filter(o => o !== c && rowsMeet(o, c) && o.x + o.w <= c.x).map(o => o.x + o.w);
    const edge = Math.max(0, ...left);
    c.w += c.x - edge;
    c.x = edge;
  }
  return placed;
}

/** Move components up past rows nothing occupies, so a hidden full-width tile leaves no empty band. */
export function closeRows(items) {
  const used = new Set(items.flatMap(c => Array.from({ length: c.h }, (_, i) => c.y + i)));
  const empty = Array.from({ length: Math.max(0, ...used) }, (_, r) => r).filter(r => !used.has(r));
  return items.map(c => ({ ...c, y: c.y - empty.filter(r => r < c.y).length, ...(c.components ? { components: closeRows(c.components) } : {}) }));
}

/**
 * What a view shows on the run page: the template's components minus those hidden for an excluded role
 * and, when the session is not running, the run controls (they can do nothing then, and the header's
 * status card shows the captures). Empty rows close up, and unless the view says `fill: false`
 * components widen into empty columns.
 */
export function runPageItems(view, hidden, { live }) {
  const idle = live ? {} : Object.fromEntries([...walk(view.components)].filter(([c]) => c.kind === "controls").map(([c]) => [c.id, true]));
  const shown = closeRows(visible(view.components, { ...hidden, ...idle }));
  return view.fill === false ? shown : fillDown(fillGaps(shown));
}

const columnsMeet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Lengthen each component into empty rows below it, no further than the next component in its columns
 * and the bottom of the band it shares rows with: the space a hidden tile left under its neighbours.
 */
export function fillDown(items) {
  return items.map(c => {
    const below = items.filter(o => o !== c && columnsMeet(o, c) && o.y >= c.y + c.h).map(o => o.y);
    const band = Math.max(...items.filter(o => rowsMeet(o, c)).map(o => o.y + o.h));
    const bottom = Math.min(band, ...below);
    return { ...c, h: Math.max(c.h, bottom - c.y), ...(c.components ? { components: fillDown(c.components) } : {}) };
  });
}
