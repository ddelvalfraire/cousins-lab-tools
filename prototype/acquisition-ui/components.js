// Renders a template layout's components on the 12-column grid, and paints them from a dataset the page supplies.

import { deltaSeconds, esc, fmtClock, fmtSeconds, icon, inputBadge, statusBadge } from "./util.js";
import { lineOption, makeChart, markLines } from "./charts.js";
import { valueAt } from "./timerange.js";

const number = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 });

export function componentTitle(c, template) {
  if (c.title) return c.title;
  const derived = template.data.derived?.[c.value];
  return {
    chart: () => template.data.charts.find(ch => ch.id === c.chart)?.title || c.chart,
    metric: () => derived?.label || c.value,
    controls: () => (c.role ? `Run controls · ${c.role}` : "Run controls"),
    captures: () => "Captures",
    inputs: () => "Parameters",
    group: () => "Group",
  }[c.kind]?.() ?? c.kind;
}

export function captureTable(m, role = null) {
  const run = m.run || {};
  const captures = Object.entries(m.captures).filter(([, c]) => !role || c.role === role);
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Capture</th><th>Input</th><th>Status</th><th>Requested start</th><th>Start command</th><th>First sample</th><th class="num">Rows</th></tr></thead>
      <tbody>${captures.map(([cid, c]) => `
        <tr>
          <td><strong>${esc(cid)}</strong><br><span class="small muted">${esc(c.label)}</span></td>
          <td>${inputBadge(c.input_kind)}</td>
          <td>${statusBadge(c.status)}${c.error ? `<div class="small error-text">${esc(c.error)}</div>` : ""}
              ${c.readiness && !c.readiness.ok ? `<div class="small error-text">${esc(c.readiness.detail)}</div>` : ""}</td>
          <td class="small">${c.requested_start_utc ? `${esc(fmtClock(c.requested_start_utc))}<br><span class="muted">+${c.requested_delay_s} s${c.host_delay_s !== c.requested_delay_s ? ` (${fmtSeconds(c.host_delay_s)} at ${run.speed}x)` : ""}</span>` : "<span class='muted'>n/a</span>"}</td>
          <td class="small">${c.start_command_utc ? `${esc(fmtClock(c.start_command_utc))}<br><span class="muted">${fmtSeconds(deltaSeconds(c.requested_start_utc, c.start_command_utc))} after requested</span>` : ""}</td>
          <td class="small">${c.first_sample_utc ? `${esc(fmtClock(c.first_sample_utc))}<br><span class="muted">${fmtSeconds(deltaSeconds(c.start_command_utc, c.first_sample_utc))} after command</span>` : c.input_kind === "import" ? "<span class='muted'>no clock time in file</span>" : ""}</td>
          <td class="num">${c.rows ?? ""}</td>
        </tr>`).join("")}</tbody>
    </table></div>
    ${run.note ? `<p class="small muted">${esc(run.note)}</p>` : ""}`;
}

function controlsBody(c, ctx, frame) {
  const m = ctx.session;
  const running = frame.live && frame.status === "running";
  const markers = Object.entries(m.template.events || {}).filter(([, e]) => e.operator_marker);
  const captures = Object.entries(frame.captures).filter(([, cap]) => !c.role || cap.role === c.role);
  return `
    <div class="command-actions">
      ${markers.map(([k, e]) => `<button class="primary" data-action="mark" data-event="${esc(k)}" ${running ? "" : "disabled"} title="${esc(e.label)}">${icon("flag")}Mark: ${esc(e.label.split(" (")[0])}</button>`).join("")}
      ${c.role ? "" : `<button data-action="stop" ${running ? "" : "disabled"}>${icon("stop")}Stop run</button>
      <button class="danger" data-action="cancel" ${running ? "" : "disabled"}>Cancel</button>`}
    </div>
    <ul class="capture-list">${captures.map(([cid, cap]) => `
      <li><span><strong>${esc(cid)}</strong> ${inputBadge(cap.input_kind)}</span>${statusBadge(cap.status)}
        <span class="small muted">${cap.readiness ? (cap.readiness.ok ? "Ready: " : "Not ready: ") + esc(cap.readiness.detail) : ""}</span></li>`).join("")}</ul>
    <p class="small muted">${frame.live ? (running ? "" : "Waiting for the run to start.") : "The run has finished; these controls apply only while it runs."}
      No commands are sent to instruments. Ambit and pulser serial control is deferred.</p>`;
}

function inputsBody(c, ctx) {
  const params = Object.entries(ctx.session.template.parameters || {}).filter(([k]) => !c.parameters?.length || c.parameters.includes(k));
  return `<dl class="kv">${params.map(([k, p]) => `<dt>${esc(k)}</dt><dd><strong>${esc(p.value)}</strong> ${esc(p.unit || "")}<br><span class="small muted">${esc(p.note || "")}</span></dd>`).join("")}</dl>
    <p class="small muted">Values of revision ${ctx.session.template.revision}. Edit them on the template; each save is a new revision.</p>`;
}

function body(c, ctx) {
  if (c.kind === "chart") {
    const spec = ctx.template.data.charts.find(ch => ch.id === c.chart);
    return `<div class="component-meta"><span class="source-tag">${esc(spec?.unit || "")}</span><span class="small muted">${(spec?.series || []).map(s => `${esc(s.role)}.${esc(s.value)}`).join(", ")}</span></div>
      <div class="chart" data-chart-for="${esc(c.id)}" role="img" aria-label="${esc(componentTitle(c, ctx.template))}"></div>`;
  }
  if (c.kind === "metric") {
    const d = ctx.template.data.derived[c.value];
    return `<div class="metric"><span class="metric-number"><span data-metric-for="${esc(c.id)}">–</span><span class="metric-unit">${esc(d.unit)}</span></span>
      <div class="metric-caption">${icon("chart")}<span>${esc(d.role)} · <code>${esc(d.expr)}</code></span><span class="source-tag">Derived</span></div>
      <div class="metric-trials small" data-trials-for="${esc(c.id)}"></div></div>`;
  }
  if (c.kind === "controls") return `<div class="control-body" data-controls-for="${esc(c.id)}"></div>`;
  if (c.kind === "captures") return `<div data-captures-for="${esc(c.id)}"></div>`;
  if (c.kind === "inputs") return inputsBody(c, ctx);
  if (c.kind === "group") return renderGrid(c.components, ctx);
  return "";
}

export function renderGrid(items, ctx) {
  const rows = Math.max(1, ...items.map(c => c.y + c.h));
  return `<div class="bento-grid" style="--rows:${rows}">${items.map(c => `
    <section class="bento-tile kind-${esc(c.kind)}" data-component="${esc(c.id)}" style="grid-column:${c.x + 1} / span ${c.w};grid-row:${c.y + 1} / span ${c.h}">
      <header class="tile-header"><h3>${esc(componentTitle(c, ctx.template))}</h3></header>
      ${body(c, ctx)}
    </section>`).join("")}</div>`;
}

/** Mount charts under root and return paint(frame). frame: {dataset, window, cursor, live, status, captures}. */
export function mountGrid(root, items, ctx) {
  const all = [];
  const collect = list => list.forEach(c => (all.push(c), c.components && collect(c.components)));
  collect(items);
  const charts = all.filter(c => c.kind === "chart").map(c => ({ c, key: null, ...makeChart(root.querySelector(`[data-chart-for="${CSS.escape(c.id)}"]`)) }));
  const derived = ctx.template.data.derived;

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (button && root.contains(button)) ctx.actions?.[button.dataset.action]?.(button.dataset);
  });

  let stateKey = null;
  return {
    paint(frame) {
      const ds = frame.dataset;
      for (const inst of charts) {
        const markers = ds.chartMarkers(inst.c.chart);
        const key = `${ds.version}|${frame.window.start}|${frame.window.end}`;
        if (key !== inst.key) {
          inst.chart.setOption(lineOption({ series: ds.chartSeries(inst.c.chart), markers, cursor: frame.cursor, window: frame.window,
            xName: ds.axis.name, xFormatter: ds.axis.tickFormat, compact: true }), { notMerge: true });
          inst.key = key;
        } else if (frame.cursor != null) {
          inst.chart.setOption({ series: [{ markLine: markLines(markers, frame.cursor) }] });
        }
      }
      for (const c of all.filter(c => c.kind === "metric")) {
        const at = frame.cursor ?? frame.window.end;
        const values = ds.valueSeries(c.value, derived[c.value].role).map(s => ({ name: s.name, y: valueAt(s.points, at) }));
        const shown = values.find(v => v.y != null);
        root.querySelector(`[data-metric-for="${CSS.escape(c.id)}"]`).textContent = shown ? number.format(shown.y) : "–";
        root.querySelector(`[data-trials-for="${CSS.escape(c.id)}"]`).innerHTML = values.length > 1
          ? values.map(v => `<span>${esc(v.name)}: <strong>${v.y == null ? "–" : number.format(v.y)}</strong></span>`).join("") : "";
      }
      const key = JSON.stringify([frame.live, frame.status, frame.captures]);
      if (key === stateKey) return;
      stateKey = key;
      for (const c of all.filter(c => c.kind === "controls")) root.querySelector(`[data-controls-for="${CSS.escape(c.id)}"]`).innerHTML = controlsBody(c, ctx, frame);
      for (const c of all.filter(c => c.kind === "captures")) {
        root.querySelector(`[data-captures-for="${CSS.escape(c.id)}"]`).innerHTML = captureTable({ ...ctx.session, captures: frame.captures }, c.role);
      }
    },
    dispose: () => charts.forEach(c => c.dispose()),
  };
}

/** A miniature of a layout's first view, for template lists. */
export function layoutThumb(template) {
  const view = template.layout.views[0];
  const items = (view?.components || []).filter(c => !template.hidden_components[c.id]);
  const rows = Math.max(1, ...items.map(c => c.y + c.h));
  return `<span class="layout-thumb" style="--rows:${rows}" role="img" aria-label="Layout of ${esc(view?.name || "the run page")}">${items.map(c =>
    `<i class="k-${esc(c.kind)}" style="grid-column:${c.x + 1} / span ${c.w};grid-row:${c.y + 1} / span ${c.h}"></i>`).join("")}</span>`;
}

export const componentCount = template => template.layout.views.reduce((n, v) => n + v.components.length, 0);
