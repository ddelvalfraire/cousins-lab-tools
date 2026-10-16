const PALETTE = ["#1f5fd1", "#d4590f", "#17794a", "#6941c6", "#0e7090", "#b42318"];

export function makeChart(el) {
  const chart = echarts.init(el, null, { renderer: "canvas" });
  const resize = () => chart.resize();
  window.addEventListener("resize", resize);
  return { chart, dispose: () => { window.removeEventListener("resize", resize); chart.dispose(); } };
}

/** series: [{name, points: [[x, y]...]}], markers: [{x, label}], xFormatter for clock axes. The card header shows the unit. */
export function lineOption({ series, markers = [], xName, xFormatter, animation = false }) {
  return {
    animation,
    color: PALETTE,
    grid: { left: 64, right: 24, top: 36, bottom: 56 },
    legend: { top: 0, type: "scroll" },
    tooltip: { trigger: "axis", valueFormatter: v => (typeof v === "number" ? v.toPrecision(6) : v) },
    xAxis: { type: "value", name: xName, nameLocation: "middle", nameGap: 32, scale: true,
             axisLabel: xFormatter ? { formatter: xFormatter } : {} },
    yAxis: { type: "value", scale: true },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 4 }],
    series: series.map((s, i) => ({
      name: s.name,
      type: "line",
      showSymbol: false,
      sampling: "lttb",
      lineStyle: { width: 1.5 },
      data: s.points,
      markLine: i === 0 && markers.length
        ? { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: "#98a2b3", type: "dashed", width: 1 },
            data: markers.map(m => ({ xAxis: m.x, name: m.label })) }
        : undefined,
    })),
  };
}
