// The page's range selection: a span of source seconds brushed on a time chart and drawn as a shaded band
// on every chart that takes one. Reading buttons send it unchanged, so nothing here converts coordinates. No DOM.

/** On the recording's own clock only, and on review only on the elapsed reference, where x is source seconds. */
export function selectable(spec, { live, reference }) {
  return !!spec && spec.kind !== "xy" && spec.x === "source" && (live || reference === "elapsed");
}

/** The span a brushEnd event reports, or null when the brush was cleared or has no width. */
export function rangeFromBrush(areas) {
  const range = (areas || []).find(a => a.brushType === "lineX")?.coordRange;
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [from, to] = [Math.min(...range), Math.max(...range)];
  return Number.isFinite(from) && Number.isFinite(to) && from < to ? { from, to } : null;
}

/** What takeGlobalCursor hands the brush. A notMerge repaint builds a new brush model without it. */
export const BRUSH = { brushType: "lineX", brushMode: "single" };

// seriesIndex [] keeps the brush from testing every point of every series while it is dragged. No toolbox
// buttons: the page's Select range toggle drives the brush.
export const brushComponent = () => ({ ...BRUSH, xAxisIndex: 0, seriesIndex: [], transformable: false, removeOnClick: true, toolbox: [] });

/** The band on the first series. It lives in the rebuilt option, so a notMerge repaint keeps it. */
export const selectionArea = (selection, color) => ({
  silent: true,
  itemStyle: { color, opacity: 0.18 },
  label: { show: false },
  data: [[{ xAxis: selection.from }, { xAxis: selection.to }]],
});
