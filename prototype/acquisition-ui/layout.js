// Grid geometry for template layouts. No DOM: the engine validates, this keeps edits valid while dragging.

export const COLUMNS = 12;
export const SIZES = { chart: [8, 4], metric: [4, 2], controls: [4, 3], inputs: [6, 4], captures: [12, 3], group: [12, 5] };

export const CATALOG = [
  { kind: "chart", name: "Chart", section: "Visualize", icon: "chart", description: "A template chart over the run clock or alignment" },
  { kind: "metric", name: "Metric", section: "Visualize", icon: "hash", description: "The latest value of a derived value, with its unit" },
  { kind: "captures", name: "Capture table", section: "Visualize", icon: "table", description: "Requested start, start command, first sample, rows" },
  { kind: "inputs", name: "Parameters", section: "Configure", icon: "sliders", description: "The revision's parameters, read only during a run" },
  { kind: "calibration", name: "Calibration table", section: "Configure", icon: "table", description: "Not available: the engine has no calibration model yet", disabled: true },
  { kind: "controls", name: "Run controls", section: "Operate", icon: "power", description: "Mark, Stop, Cancel, readiness, capture status" },
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
