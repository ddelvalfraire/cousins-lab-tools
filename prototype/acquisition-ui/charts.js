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

/**
 * series: [{name, points: [[x, y]...]}], markers: [{x, label}], cursor: x of the replay playhead.
 * window: {start, end} limits the x axis without dropping data. The card header shows the unit.
 * selection: {from, to} drawn as a band; brush: the chart takes a range selection.
 */
export function lineOption({ series, markers = [], cursor = null, window = null, xName, xFormatter, compact = false, selection = null, brush = false, legendSelected = {} }) {
  const muted = cssVar("--muted"), line = cssVar("--border"), text = cssVar("--fg");
  return {
    animation: false,
    color: PALETTE_VARS.map(cssVar),
    textStyle: { fontFamily: cssVar("--font-body"), color: text },
    grid: { left: 56, right: 16, top: compact ? 28 : 36, bottom: compact ? 36 : 56 },
    legend: { top: 0, type: "scroll", textStyle: { color: text }, show: series.length > 1, selected: legendSelected },
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
      markArea: i === 0 && selection ? selectionArea(selection, cssVar("--accent")) : undefined,
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
    legend: { top: 0, type: "scroll", textStyle: { color: text }, show: series.length > 1 },
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
