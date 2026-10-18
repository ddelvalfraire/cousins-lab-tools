// Renders a template layout's components on the 12-column grid, and paints them from a dataset the page supplies.

import { deltaSeconds, esc, fmtClock, fmtSeconds, icon, inputBadge, statusBadge } from "./util.js";
import { lineOption, makeChart, markLines, xyOption } from "./charts.js";
import { valueAt } from "./timerange.js";
import { BRUSH, rangeFromBrush, selectable } from "./selection.js";
import { capturesFor, fmtValue, parameterRows, readingRows, selectionLines, tableModel } from "./analysis.js";

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
    readings: () => "Readings",
    table: () => template.data.measurements?.[c.measurement]?.label || c.measurement,
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

export function inputsBody(c, ctx, rows) {
  return `<dl class="kv">${rows.map(p => `<dt title="${esc(p.name)}">${esc(p.label)}</dt><dd>
      ${p.entry ? `<input class="entry" inputmode="decimal" aria-label="${esc(p.label)}" data-change="entry" data-parameter="${esc(p.name)}"
        value="${esc(p.typed)}" placeholder="${esc(p.value == null ? "Enter a value" : fmtValue(p.value))}">` : `<strong>${fmtValue(p.value)}</strong>`}
      ${esc(p.unit)} <span class="source-tag">${esc(p.tag)}</span>
      ${p.why || p.note ? `<br><span class="small muted">${esc(p.why || p.note)}</span>` : ""}</dd>`).join("")}</dl>
    <p class="small muted">Revision ${ctx.session.template.revision} gives the defaults. Typed values, readings and fits are saved to this session.</p>`;
}

/** analysis: the page's {view, previews, capture}; capture maps a role to the capture chosen for it. */
function readingsBody(c, ctx, analysis, selection) {
  const role = c.role ?? analysis.view?.steps?.[c.steps[0]]?.role;
  const cids = capturesFor(ctx.session.captures, role);
  const capture = analysis.capture[role] ?? cids[0] ?? null;
  const rows = readingRows(c.steps, analysis.view, { selection, capture, previews: analysis.previews });
  const whys = [...new Set(rows.map(r => r.read.why).filter(Boolean))];
  return `
    ${cids.length > 1 ? `<label class="field small">Capture<select data-change="capture" data-role="${esc(role)}">${cids.map(cid =>
      `<option value="${esc(cid)}" ${cid === capture ? "selected" : ""}>${esc(cid)}</option>`).join("")}</select></label>` : ""}
    ${whys.map(w => `<p class="small muted">${esc(w)}</p>`).join("")}
    ${selectionLines(rows).map(l => `<p class="small ${l.error ? "error-text" : "muted"}">Selection: ${esc(l.text)}</p>`).join("")}
    <ul class="reading-list">${rows.map(r => `
      <li data-step="${esc(r.step)}">
        <button class="primary" data-action="read" data-step="${esc(r.step)}" ${r.read.disabled ? "disabled" : ""}>${esc(r.label)}</button>
        <span class="reading-value" ${r.saved ? `title="${esc(r.saved.values.join(", "))}"` : ""}>${r.saved ? esc(r.saved.short) : '<span class="muted">Not read</span>'}${r.known != null ? ` <span class="small muted">known ${fmtValue(r.known)}</span>` : ""}</span>
        ${r.remove ? `<button class="quiet icon-only" data-action="retract" data-records="${esc(r.remove)}" aria-label="Remove ${esc(r.label)}" title="Remove this reading">${icon("close")}</button>` : ""}
      </li>`).join("")}</ul>`;
}

/** analysis.labels: measurement -> label key -> typed text; analysis.exported: measurement -> export_table reply. */
function tableBody(c, analysis) {
  const id = c.measurement;
  const t = tableModel(id, analysis.view, analysis.labels[id]);
  const exported = analysis.exported[id];
  const attrs = `data-measurement="${esc(id)}"`;
  return `
    <dl class="kv draft-results">${t.draft.map(r => `<dt>${esc(r.label)}</dt><dd><strong>${fmtValue(r.value)}</strong> ${esc(r.unit)}</dd>`).join("")}</dl>
    ${t.unset.length ? `<p class="small muted">Needs ${t.unset.map(esc).join(", ")}</p>` : ""}
    ${t.labels.map(l => `<label class="field">${esc(l.label)}<input data-input="label" ${attrs} data-key="${esc(l.key)}" value="${esc(l.value)}" autocomplete="off"></label>`).join("")}
    <div class="command-actions">
      <button class="primary" data-action="addRow" ${attrs} ${t.canAdd ? "" : "disabled"}>${icon("plus")}Add to table</button>
      <button data-action="exportTable" ${attrs} ${t.hasRows ? "" : "disabled"}>${icon("download")}Export</button>
      <button data-action="copyTable" ${attrs} ${t.hasRows ? "" : "disabled"}>Copy</button>
      <button class="danger" data-action="clearTable" ${attrs} ${t.hasRows ? "" : "disabled"}>Clear table</button>
    </div>
    ${exported ? `<div class="small">${[exported.csv, exported.metadata].map(path =>
      `<div class="inline"><code>${esc(path)}</code><button class="quiet" data-action="reveal" data-path="${esc(path)}">${icon("folder")}Show in folder</button></div>`).join("")}</div>` : ""}
    <div class="table-wrap"><table>
      <thead><tr>${t.headings.map(h => `<th>${esc(h)}</th>`).join("")}<th></th></tr></thead>
      <tbody>${t.rows.map(r => `<tr data-record="${esc(r.record)}">${r.cells.map(v => `<td>${esc(v)}</td>`).join("")}
        <td><button class="quiet" data-action="retract" data-records="${esc(r.record)}">Remove</button></td></tr>`).join("")
        || `<tr><td colspan="${t.headings.length + 1}" class="small muted">No rows yet.</td></tr>`}</tbody>
    </table></div>`;
}

function body(c, ctx) {
  if (c.kind === "chart") {
    const spec = ctx.template.data.charts.find(ch => ch.id === c.chart);
    const bound = s => (s.calibration ? `calibration ${s.calibration}` : s.measurement ? `${s.measurement}: ${s.y} on ${s.x}` : `${s.role}.${s.value}`);
    return `<div class="component-meta"><span class="source-tag">${esc(spec?.kind === "xy" ? "xy" : spec?.unit || "")}</span><span class="small muted">${(spec?.series || []).map(s => esc(bound(s))).join(", ")}</span></div>
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
  if (c.kind === "inputs") return `<div data-inputs-for="${esc(c.id)}">${inputsBody(c, ctx, parameterRows(c.parameters, null, ctx.template.data.parameters))}</div>`;
  if (c.kind === "readings") return `<div class="readings" data-readings-for="${esc(c.id)}"></div>`;
  if (c.kind === "table") return `<div class="results-table" data-table-for="${esc(c.id)}"></div>`;
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

/**
 * When a time chart must be rebuilt, and with what. frame.select: {range, active, version, live, reference}.
 * The selection and the pan/select mode are part of the key, so changing either rebuilds the option with
 * the band, and a rebuilt chart in select mode takes the brush cursor again.
 */
export function timeChartPaint(spec, chartId, frame) {
  const ds = frame.dataset;
  const sel = frame.select || {};
  const brush = selectable(spec, sel);
  const extent = JSON.stringify([frame.window.start, frame.window.end]);
  const key = JSON.stringify([ds.version, extent, brush && [sel.range, !!sel.active, sel.version]]);
  return {
    key,
    extent,
    takeCursor: brush && !!sel.active,
    option: () => lineOption({ series: ds.chartSeries(chartId), markers: ds.chartMarkers(chartId), cursor: frame.cursor, window: frame.window,
      xName: ds.axis.name, xFormatter: ds.axis.tickFormat, compact: true, selection: brush ? sel.range : null, brush }),
  };
}

/** Mount charts under root and return paint(frame). frame: {dataset, window, cursor, live, status, captures, select}. */
export function mountGrid(root, items, ctx) {
  const all = [];
  const collect = list => list.forEach(c => (all.push(c), c.components && collect(c.components)));
  collect(items);
  const specs = Object.fromEntries(ctx.template.data.charts.map(ch => [ch.id, ch]));
  const charts = all.filter(c => c.kind === "chart")
    .map(c => ({ c, spec: specs[c.chart], key: null, ...makeChart(root.querySelector(`[data-chart-for="${CSS.escape(c.id)}"]`)) }));
  // Deferred so the repaint it causes does not replace the brush model inside its own mouseup.
  for (const inst of charts) inst.chart.on("brushEnd", e => setTimeout(() => ctx.onSelect?.(rangeFromBrush(e.areas))));
  const derived = ctx.template.data.derived;

  // root outlives this grid, since a view switch mounts the next grid into it; dispose drops these listeners
  // so a click is not handled once per grid ever mounted, which would save a reading twice.
  const listening = new AbortController();
  const delegate = (type, attr, args) => root.addEventListener(type, event => {
    const el = event.target.closest(`[data-${attr}]`);
    if (el && root.contains(el)) ctx.actions?.[el.dataset[attr]]?.(...args(el));
  }, { signal: listening.signal });
  delegate("click", "action", el => [el.dataset]);
  delegate("change", "change", el => [el.dataset, el.value]);
  delegate("input", "input", el => [el.dataset, el.value]);

  let stateKey = null, analysisKey = null, paramsKey = null;
  const tableKeys = {};
  return {
    paint(frame) {
      const ds = frame.dataset;
      for (const inst of charts) {
        if (inst.spec?.kind === "xy") {
          const series = frame.analysis?.view?.xy?.[inst.c.chart]?.series ?? [];
          const key = JSON.stringify(series);
          if (key !== inst.key) inst.chart.setOption(xyOption(inst.spec, series), { notMerge: true });
          inst.key = key;
          continue;
        }
        const markers = ds.chartMarkers(inst.c.chart);
        const next = timeChartPaint(inst.spec, inst.c.chart, frame);
        if (next.key !== inst.key) {
          // Same window: keep the operator's zoom across a new selection, a mode switch, or values recomputed
          // after a reading, so a calibration can be read step after step without zooming in again.
          const zoom = next.extent === inst.extent ? inst.chart.getOption()?.dataZoom?.[0] : null;
          inst.chart.setOption(next.option(), { notMerge: true });
          if (zoom) inst.chart.dispatchAction({ type: "dataZoom", start: zoom.start, end: zoom.end });
          if (next.takeCursor) inst.chart.dispatchAction({ type: "takeGlobalCursor", key: "brush", brushOption: BRUSH });
          inst.key = next.key;
          inst.extent = next.extent;
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
      const akey = JSON.stringify([frame.analysis?.version, frame.select?.range]);
      if (frame.analysis && akey !== analysisKey) {
        analysisKey = akey;
        for (const c of all.filter(c => c.kind === "readings")) {
          root.querySelector(`[data-readings-for="${CSS.escape(c.id)}"]`).innerHTML = readingsBody(c, ctx, frame.analysis, frame.select?.range);
        }
      }
      // Keyed on the values alone, so a preview or poll does not wipe a field while it is being typed in.
      const pkey = JSON.stringify(frame.analysis?.view?.parameters ?? null);
      if (frame.analysis?.view && pkey !== paramsKey) {
        paramsKey = pkey;
        for (const c of all.filter(c => c.kind === "inputs")) {
          root.querySelector(`[data-inputs-for="${CSS.escape(c.id)}"]`).innerHTML = inputsBody(c, ctx, parameterRows(c.parameters, frame.analysis.view));
        }
      }
      // Typed labels are not in the key: they live in page state, and repainting while typing would drop the caret.
      for (const c of frame.analysis ? all.filter(c => c.kind === "table") : []) {
        const a = frame.analysis, m = c.measurement;
        const tkey = JSON.stringify([a.view?.tables?.[m], a.view?.drafts?.[m], a.exported[m]]);
        if (tkey === tableKeys[c.id]) continue;
        tableKeys[c.id] = tkey;
        root.querySelector(`[data-table-for="${CSS.escape(c.id)}"]`).innerHTML = tableBody(c, a);
      }
      const key = JSON.stringify([frame.live, frame.status, frame.captures]);
      if (key === stateKey) return;
      stateKey = key;
      for (const c of all.filter(c => c.kind === "controls")) root.querySelector(`[data-controls-for="${CSS.escape(c.id)}"]`).innerHTML = controlsBody(c, ctx, frame);
      for (const c of all.filter(c => c.kind === "captures")) {
        root.querySelector(`[data-captures-for="${CSS.escape(c.id)}"]`).innerHTML = captureTable({ ...ctx.session, captures: frame.captures }, c.role);
      }
    },
    dispose: () => {
      listening.abort();
      charts.forEach(c => c.dispose());
    },
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
