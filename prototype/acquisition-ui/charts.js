import { cssVar } from "./util.js";
import { brushComponent, selectionArea } from "./selection.js";

const PALETTE_VARS = ["--accent", "--trace-blue", "--trace-violet", "--trace-amber", "--success", "--destructive-text"];

export function makeChart(el) {
  const chart = echarts.init(el, null, { renderer: "canvas" });
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(el);
  return { chart, dispose: () => { observer.disconnect(); chart.dispose(); } };
}

export function markLines(markers, cursor) {
  const marks = [
    ...markers.map(m => ({ xAxis: m.x, name: m.label, lineStyle: { color: cssVar("--muted"), type: "dashed", width: 1 } })),
    ...(cursor == null ? [] : [{ xAxis: cursor, name: "Playhead", lineStyle: { color: cssVar("--fg"), type: "solid", width: 1.5 } }]),
  ];
  return { symbol: "none", silent: true, animation: false, label: { show: false }, data: marks };
}

// A live row can sit a bit above the x of the gap it comes before: the row's t is t_ms * 0.001 and the event's is
// t_ms / 1000. No two rows are this close.
const SAME_ROW_S = 1e-6;

/** The first x after `x` in points sorted by x, or null. */
function firstAfter(points, x) {
  let lo = 0, hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo < points.length ? points[lo][0] : null;
}

/**
 * gaps: [{trial, label, x}], x the last row before frames went missing. Each becomes {from, to, label}, to the
 * first point after x in a series of the same trial. A gap at the tail of a live run has no band until a row after
 * it arrives.
 */
export function gapBands(gaps, series) {
  return gaps.flatMap(g => {
    const ends = series.filter(s => s.trial === g.trial).map(s => firstAfter(s.points, g.x + SAME_ROW_S)).filter(x => x != null);
    return ends.length ? [{ from: g.x, to: Math.min(...ends), label: g.label }] : [];
  });
}

/** Gap bands and the selection band share the first series' markArea; a gap's label shows on hover. */
function markAreas(bands, selection) {
  const area = selection ? selectionArea(selection, cssVar("--accent")) : undefined;
  if (!bands.length) return area;
  const tint = { color: cssVar("--warning-text"), opacity: 0.16 };
  const gaps = bands.map(b => [{ xAxis: b.from, name: b.label, itemStyle: tint }, { xAxis: b.to }]);
  return {
    ...area,
    silent: false,
    label: { show: false, position: "insideTop", color: cssVar("--warning-text") },
    emphasis: { label: { show: true } },
    data: [...gaps, ...(area?.data ?? [])],
  };
}

/**
 * Reset zoom and Save as PNG, top right of every chart. `name` is the file name the image saves under. A chart
 * with a brush hides the toolbox's brush feature: on a notMerge repaint ECharts refills an empty one with its four
 * default buttons, and the page's Select range toggle drives the brush instead.
 */
export function chartToolbox(name, brush = false) {
  const muted = cssVar("--muted");
  return {
    right: 4, top: 0, itemSize: 14, itemGap: 10,
    iconStyle: { borderColor: muted },
    feature: {
      restore: { title: "Reset zoom" },
      saveAsImage: { title: "Save as PNG", name: name || "chart", pixelRatio: 2, backgroundColor: cssVar("--surface") },
      ...(brush ? { brush: { show: false } } : {}),
    },
  };
}

/**
 * series: [{name, trial, points: [[x, y]...]}], markers: [{x, label}], gaps: [{trial, x, label}] drawn as bands,
 * cursor: x of the replay playhead. window: {start, end} limits the x axis without dropping data. The card header
 * shows the unit. selection: {from, to} drawn as a band; brush: the chart takes a range selection.
 */
export function lineOption({ series, markers = [], gaps = [], cursor = null, window = null, xName, xFormatter, compact = false, selection = null, brush = false, legendSelected = {}, title = "" }) {
  const muted = cssVar("--muted"), line = cssVar("--border"), text = cssVar("--fg");
  const areas = markAreas(gapBands(gaps, series), selection);
  return {
    animation: false,
    color: PALETTE_VARS.map(cssVar),
    textStyle: { fontFamily: cssVar("--font-body"), color: text },
    grid: { left: 56, right: 16, top: compact ? 28 : 36, bottom: compact ? 36 : 56 },
    legend: { top: 0, left: 8, right: 64, type: "scroll", textStyle: { color: text }, show: series.length > 1, selected: legendSelected },
    toolbox: chartToolbox(title, brush),
    tooltip: { trigger: "axis", valueFormatter: v => (typeof v === "number" ? v.toPrecision(6) : v) },
    xAxis: {
      type: "value", name: compact ? "" : xName, nameLocation: "middle", nameGap: 32, scale: true,
      min: window?.start, max: window?.end, nameTextStyle: { color: muted },
      axisLabel: { color: muted, hideOverlap: true, ...(xFormatter ? { formatter: xFormatter } : {}) },
      axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line, type: "dashed" } },
    },
    yAxis: { type: "value", scale: true, axisLabel: { color: muted }, splitLine: { lineStyle: { color: line, type: "dashed" } } },
    dataZoom: compact ? [{ type: "inside", filterMode: "none" }] : [{ type: "inside", filterMode: "none" }, { type: "slider", height: 16, bottom: 4, filterMode: "none" }],
    series: series.map((s, i) => ({
      name: s.name,
      type: "line",
      ...(s.color ? { color: s.color } : {}),
      showSymbol: false,
      sampling: "lttb",
      lineStyle: { width: 1.5 },
      data: s.points,
      markLine: i === 0 ? markLines(markers, cursor) : undefined,
      markArea: i === 0 ? areas : undefined,
    })),
    ...(brush ? { brush: brushComponent() } : {}),
  };
}

/**
 * An xy chart as the engine computed it: spec is the template chart (title, x_label, y_label), series the
 * analysis view's xy series. Each series is its points as a scatter, and its fit line once it has one.
 */
export function xyOption(spec, series = []) {
  const muted = cssVar("--muted"), line = cssVar("--border"), text = cssVar("--fg");
  const palette = PALETTE_VARS.map(cssVar);
  const axis = name => ({
    type: "value", scale: true, name, nameLocation: "middle", nameGap: 32, nameTextStyle: { color: muted },
    axisLabel: { color: muted, hideOverlap: true }, axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line, type: "dashed" } },
  });
  return {
    animation: false,
    textStyle: { fontFamily: cssVar("--font-body"), color: text },
    grid: { left: 64, right: 16, top: 28, bottom: 44 },
    legend: { top: 0, left: 8, right: 64, type: "scroll", textStyle: { color: text }, show: series.length > 1 },
    toolbox: chartToolbox(spec?.title),
    tooltip: { trigger: "item", valueFormatter: v => (typeof v === "number" ? v.toPrecision(6) : v) },
    xAxis: axis(spec?.x_label || ""),
    yAxis: { ...axis(spec?.y_label || ""), nameGap: 48 },
    series: series.flatMap((s, i) => {
      const color = s.color || palette[i % palette.length];
      const points = { name: s.name, type: "scatter", symbolSize: 9, itemStyle: { color }, data: s.points };
      return s.line ? [points, { name: s.name, type: "line", showSymbol: false, silent: true, lineStyle: { color, width: 1.5 }, data: s.line }] : [points];
    }),
  };
}
