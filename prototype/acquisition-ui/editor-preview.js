import { esc, icon } from "./util.js";
import { lineOption, makeChart, xyOption } from "./charts.js";
import { captureTable } from "./components.js";
import { fmtValue, templateSteps } from "./analysis.js";

const metricNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });

function exampleValue(name, unit = "") {
  if (/phi|yield/i.test(name)) return 0.38;
  if (/fluorescence|\bfs\b|fm_prime/i.test(name)) return 4.62;
  if (/slope|rate|d_ubar/i.test(name)) return -0.26;
  if (/m44|zero_mv/i.test(name)) return 0.84;
  if (/co2|compensation/i.test(name) && /bar/.test(unit)) return 982.4;
  if (/temp/i.test(name)) return 25;
  if (/area/i.test(name)) return 1.2;
  return /ratio|%/.test(unit) ? 0.62 : 12.4;
}

export function previewSeries(spec) {
  return (spec.series || []).map((s, index) => {
    const name = s.name || s.label || (s.calibration ? s.calibration : s.measurement ? `${s.measurement} · ${s.y}` : `${s.role}.${s.value}`);
    if (spec.kind === "xy") {
      const points = Array.from({ length: 4 }, (_, i) => [0.3 + i * 0.37, i * (index + 1) + (i % 2) * 0.04]);
      return { name, color: s.color, points, ...(s.calibration ? { line: [points[0], points.at(-1)] } : {}) };
    }
    const key = s.value || "";
    const value = exampleValue(key, spec.unit);
    const points = Array.from({ length: 121 }, (_, t) => {
      const noise = Math.sin(t * 0.7 + index) * 0.012;
      const shape = /fluorescence/i.test(key)
        ? 0.65 + 0.08 * Math.sin(t / 24) + 0.4 * Math.exp(-(((t % 24 - 12) / 1.5) ** 2))
        : /slope|rate|^d_/i.test(key) ? 0.75 + 0.25 * Math.sin(t / 18)
          : 0.32 + 0.68 * Math.exp(-t / 70);
      return [t, value * (shape + noise) * (1 + index * 0.12)];
    });
    return { name, color: s.color, points };
  });
}

function previewTable(measurement) {
  if (!measurement) return '<p class="small muted">Choose a measurement in component settings.</p>';
  const labels = Object.entries(measurement.labels || {});
  const results = Object.entries(measurement.results || {});
  return `<div class="table-toolbar"><span class="small muted">2 example rows</span><span class="preview-action">${icon("plus")}Add to table</span></div>
    <div class="table-wrap"><table><thead><tr>${labels.map(([, label]) => `<th>${esc(label)}</th>`).join("")}${results.map(([, r]) => `<th class="num">${esc(r.label)}<span class="unit">${esc(r.unit || "")}</span></th>`).join("")}</tr></thead>
    <tbody>${[1, 2].map(i => `<tr>${labels.map(() => `<td>Sample ${i}</td>`).join("")}${results.map(([key, r]) => `<td class="num">${fmtValue(exampleValue(key, r.unit) * (i === 1 ? 1 : 1.08))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function previewBody(c, template) {
  const data = template.data;
  let body;
  if (c.kind === "chart") {
    const spec = data.charts.find(ch => ch.id === c.chart);
    body = spec ? `<div class="component-meta"><span class="source-tag">${esc(spec.unit || (spec.kind === "xy" ? "xy" : ""))}</span></div>
      <div class="chart" data-preview-chart="${esc(c.chart)}"></div>` : '<p class="small muted">Choose a chart in component settings.</p>';
  } else if (c.kind === "metric") {
    const d = data.derived?.[c.value];
    const chart = data.charts.find(ch => ch.series?.some(s => s.role === d?.role && s.value === c.value));
    const series = chart && previewSeries(chart)[chart.series.findIndex(s => s.role === d.role && s.value === c.value)];
    const value = series ? series.points.at(-1)[1] : exampleValue(c.value, d?.unit);
    body = d ? `<div class="metric"><span class="metric-number">${metricNumber.format(value)}<span class="metric-unit">${esc(d.unit || "")}</span></span></div>`
      : '<p class="small muted">Choose a derived value in component settings.</p>';
  } else if (c.kind === "controls") {
    body = `<div class="command-actions">${Object.entries(data.events || {}).filter(([, e]) => e.operator_marker).map(([, e]) => `<span class="preview-action primary">${icon("flag")}Mark: ${esc(e.label.split(" (")[0])}</span>`).join("")}
      <span class="preview-action">${icon("stop")}Stop run</span></div>
      <ul class="capture-list">${Object.entries(data.roles).filter(([key]) => !c.role || c.role === key).map(([key, r]) => `<li><strong title="${esc(r.label)}">${esc(key)}</strong><span class="badge tone-good">Recording</span></li>`).join("")}</ul>`;
  } else if (c.kind === "captures") {
    const time = "2026-01-01T09:00:00Z";
    body = captureTable({ captures: Object.fromEntries(Object.entries(data.roles).map(([key, r], i) => [key, {
      role: key, label: r.label, input_kind: r.instrument.includes("replay") ? "replay" : "simulated", status: "running",
      requested_delay_s: 0, host_delay_s: 0, requested_start_utc: time, start_command_utc: time, first_sample_utc: time, rows: i ? 845 : 1240,
    }])) }, c.role);
  } else if (c.kind === "inputs") {
    body = `<ul class="param-list">${Object.entries(data.parameters || {}).filter(([key]) => !c.parameters?.length || c.parameters.includes(key)).map(([key, p]) => `
      <li class="param-row"><div class="param-text"><span class="param-label">${esc(p.label || key)}</span></div>
      <div class="param-value"><span class="param-number"><strong>${fmtValue(p.value ?? exampleValue(key, p.unit))}</strong><span class="unit">${esc(p.unit || "")}</span></span>
      <span class="badge">${p.value == null ? "Example" : "Default"}</span></div></li>`).join("")}</ul>`;
  } else if (c.kind === "readings") {
    const steps = templateSteps(data);
    body = `<div class="step-progress"><span class="small muted">Example readings</span></div><ul class="step-list">${(c.steps || []).map(ref => `<li class="done"><span class="step-status">${icon("check")}</span>
      <span class="step-label">${esc(steps.find(s => s.ref === ref)?.label || ref)}</span><div class="step-actions"><span class="preview-action small">Read</span></div>
      <span class="step-value"><strong>${fmtValue(exampleValue(ref))}</strong><span class="badge">Example</span></span></li>`).join("")}</ul>`;
  } else if (c.kind === "table") {
    body = previewTable(data.measurements?.[c.measurement]);
  } else {
    body = "";
  }
  return `<div class="layout-preview" inert>${body}</div>`;
}

export function mountPreviews(el, template) {
  const mounted = [...el.querySelectorAll("[data-preview-chart]")].map(node => {
    const spec = template.data.charts.find(c => c.id === node.dataset.previewChart);
    const series = previewSeries(spec);
    const mounted = makeChart(node);
    const option = spec.kind === "xy" ? xyOption(spec, series) : lineOption({ series, xName: "Elapsed time (s)", compact: true });
    mounted.chart.setOption({ ...option, toolbox: { show: false }, tooltip: { show: false }, dataZoom: [],
      legend: { ...option.legend, right: 4, selectedMode: false },
      series: option.series.map(s => ({ ...s, silent: true })),
    });
    return mounted;
  });
  return () => mounted.forEach(c => c.dispose());
}
