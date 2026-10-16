import { cssVar } from "./util.js";

const PALETTE_VARS = ["--accent", "--trace-blue", "--trace-violet", "--trace-amber", "--success", "--destructive-text"];

export function makeChart(el) {
  const chart = echarts.init(el, null, { renderer: "canvas" });
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(el);
  return { chart, dispose: () => { observer.disconnect(); chart.dispose(); } };
}

/**
 * series: [{name, points: [[x, y]...]}], markers: [{x, label}], cursor: x of the replay playhead.
 * window: {start, end} limits the x axis without dropping data. The card header shows the unit.
 */
export function lineOption({ series, markers = [], cursor = null, window = null, xName, xFormatter, compact = false }) {
  const muted = cssVar("--muted"), line = cssVar("--border"), text = cssVar("--fg");
  const marks = [
    ...markers.map(m => ({ xAxis: m.x, name: m.label, lineStyle: { color: muted, type: "dashed", width: 1 } })),
    ...(cursor == null ? [] : [{ xAxis: cursor, name: "Playhead", lineStyle: { color: text, type: "solid", width: 1.5 } }]),
  ];
  return {
    animation: false,
    color: PALETTE_VARS.map(cssVar),
    textStyle: { fontFamily: cssVar("--font-body"), color: text },
    grid: { left: 56, right: 16, top: compact ? 28 : 36, bottom: compact ? 36 : 56 },
    legend: { top: 0, type: "scroll", textStyle: { color: text }, show: series.length > 1 },
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
      showSymbol: false,
      sampling: "lttb",
      lineStyle: { width: 1.5 },
      data: s.points,
      markLine: i === 0 && marks.length ? { symbol: "none", silent: true, label: { show: false }, data: marks } : undefined,
    })),
  };
}
