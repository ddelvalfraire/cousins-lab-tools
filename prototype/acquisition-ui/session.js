import { api, deltaSeconds, esc, fmtClock, fmtSeconds, fmtTime, hms, inputBadge, statusBadge, toast } from "./util.js";
import { lineOption, makeChart } from "./charts.js";

const LIVE_POLL_MS = 500;

export async function renderSession(page, id) {
  const session = await api(`/api/sessions/${id}`);
  return session.live ? renderLive(page, session) : renderReview(page, session);
}

function header(m, actions = "") {
  const t = m.template;
  return `
    <div class="page-head">
      <div><div class="crumbs"><a href="#/">Sessions</a></div>
        <h1>${esc(m.name)}</h1>
        <p class="sub">${statusBadge(m.status)} ${m.kind === "import" ? "Imported recordings" : "Run"} · <a href="#/templates/${esc(t.id)}/r${t.revision}">${esc(t.name)} r${t.revision}</a> · created ${esc(fmtTime(m.created_utc))}</p></div>
      <div class="actions">${actions}</div>
    </div>`;
}

function captureTable(m) {
  const run = m.run || {};
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Capture</th><th>Input</th><th>Status</th><th>Requested start</th><th>Start command</th><th>First sample</th><th>Rows</th></tr></thead>
      <tbody>${Object.entries(m.captures).map(([cid, c]) => `
        <tr>
          <td><strong>${esc(cid)}</strong><br><span class="small muted">${esc(c.label)}</span></td>
          <td>${inputBadge(c.input_kind)}</td>
          <td>${statusBadge(c.status)}${c.error ? `<div class="small error-text">${esc(c.error)}</div>` : ""}
              ${c.readiness && !c.readiness.ok ? `<div class="small error-text">${esc(c.readiness.detail)}</div>` : ""}</td>
          <td class="small">${c.requested_start_utc ? `${esc(fmtClock(c.requested_start_utc))}<br><span class="muted">+${c.requested_delay_s} s${c.host_delay_s !== c.requested_delay_s ? ` (${fmtSeconds(c.host_delay_s)} at ${run.speed}x)` : ""}</span>` : "<span class='muted'>n/a</span>"}</td>
          <td class="small">${c.start_command_utc ? `${esc(fmtClock(c.start_command_utc))}<br><span class="muted">${fmtSeconds(deltaSeconds(c.requested_start_utc, c.start_command_utc))} after requested</span>` : ""}</td>
          <td class="small">${c.first_sample_utc ? `${esc(fmtClock(c.first_sample_utc))}<br><span class="muted">${fmtSeconds(deltaSeconds(c.start_command_utc, c.first_sample_utc))} after command</span>` : c.input_kind === "import" ? "<span class='muted'>no clock time in file</span>" : ""}</td>
          <td>${c.rows ?? ""}</td>
        </tr>`).join("")}</tbody>
    </table></div>
    ${run.note ? `<p class="small muted">${esc(run.note)}</p>` : ""}`;
}

async function renderLive(page, session) {
  const m = session.manifest;
  const template = (await api(`/api/templates/${m.template.id}?revision=${m.template.revision}`));
  const markerEvents = Object.entries(m.template.events || {}).filter(([, e]) => e.operator_marker);
  page.innerHTML = header(m, `
      ${markerEvents.map(([k, e]) => `<button data-mark="${esc(k)}">Mark: ${esc(e.label)}</button>`).join("")}
      <button id="stop">Stop run</button><button class="danger" id="cancel">Cancel</button>`) + `
    <section class="card">
      <div class="status-strip">
        <div class="stat"><span class="label">Run clock</span><span class="value" id="elapsed">00:00:00</span></div>
        <div class="stat"><span class="label">Group status</span><span id="group-status">${statusBadge(m.status)}</span></div>
        <div class="stat"><span class="label">Replay speed</span><span class="value">${m.run?.speed}x</span></div>
      </div>
      ${Object.values(m.captures).map(c => `<p class="small muted">${inputBadge(c.input_kind)} ${esc(c.input_note)}</p>`).join("")}
      <div id="captures">${captureTable(m)}</div>
    </section>
    <div class="grid charts" id="charts">${template.charts.map(c => `
      <section class="card"><div class="card-head"><h2>${esc(c.title)}</h2><span class="small muted">${esc(c.unit)}</span></div><div class="chart" data-chart="${esc(c.id)}"></div></section>`).join("")}
    </div>
    <section class="card"><h2>Events</h2><div class="log" id="log"><div class="muted">Saturation flashes and operator markers appear here.</div></div></section>`;

  const charts = Object.fromEntries(template.charts.map(c => [c.id, { spec: c, ...makeChart(page.querySelector(`[data-chart="${c.id}"]`)) }]));
  const points = {};
  const markers = [];
  const cursors = {};
  let timer;

  const draw = () => {
    for (const { spec, chart } of Object.values(charts)) {
      const series = spec.series.map(s => ({ name: `${s.role} · ${s.value}`, points: points[`${s.role}:${s.value}`] || [] }));
      const chartMarkers = markers.filter(mk => mk.role === "operator" || (spec.markers && mk.role === spec.markers.role && mk.kind === spec.markers.kind));
      chart.setOption(lineOption({ series, markers: chartMarkers, xName: "Run clock (s since group start, host clock)" }), { notMerge: true });
    }
  };

  const poll = async () => {
    try {
      const live = await api(`/api/sessions/${m.id}/live?cursors=${encodeURIComponent(JSON.stringify(cursors))}`);
      page.querySelector("#elapsed").textContent = hms(live.elapsed_s);
      page.querySelector("#group-status").innerHTML = statusBadge(live.status);
      page.querySelector("#captures").innerHTML = captureTable({ ...m, captures: live.manifest_captures });
      const log = page.querySelector("#log");
      for (const [role, cap] of Object.entries(live.captures)) {
        cursors[role] = cap.next;
        cursors[`${role}:events`] = cap.events_next;
        for (const row of cap.rows) {
          for (const [key, value] of Object.entries(row)) {
            if (key !== "x" && value != null) (points[`${role}:${key}`] ||= []).push([row.x, value]);
          }
        }
        for (const ev of cap.events) {
          markers.push({ role, kind: ev.kind, x: ev.x_run_s, label: ev.label });
          if (ev.kind === "sat_flash") log.insertAdjacentHTML("afterbegin", `<div>${fmtSeconds(ev.x_run_s)} · ${esc(role)} · ${esc(ev.label)}</div>`);
        }
      }
      for (const mk of live.markers.slice(markers.filter(x => x.role === "operator").length)) {
        markers.push({ role: "operator", kind: mk.kind, x: mk.x_run_s, label: mk.label });
        log.insertAdjacentHTML("afterbegin", `<div><strong>${fmtSeconds(mk.x_run_s)} · operator · ${esc(mk.label)}</strong> (host ${esc(fmtClock(mk.t_host_utc))})</div>`);
      }
      draw();
      if (["running", "stopping"].includes(live.status)) timer = setTimeout(poll, LIVE_POLL_MS);
      else location.reload();
    } catch (e) {
      toast(e.message);
      timer = setTimeout(poll, 2000);
    }
  };
  poll();

  page.querySelectorAll("[data-mark]").forEach(b => (b.onclick = async () => {
    const mk = await api(`/api/sessions/${m.id}/mark`, { method: "POST", body: { event: b.dataset.mark } });
    toast(`Marked ${mk.label} at ${fmtClock(mk.t_host_utc)}`);
  }));
  for (const [sel, action] of [["#stop", "stop"], ["#cancel", "cancel"]]) {
    page.querySelector(sel).onclick = async () => {
      if (action === "cancel" && !confirm("Cancel the run? Devices are sent to a safe state; data so far is kept.")) return;
      await api(`/api/sessions/${m.id}/${action}`, { method: "POST" });
      toast("Stopping…");
    };
  }
  return () => { clearTimeout(timer); Object.values(charts).forEach(c => c.dispose()); };
}

async function renderReview(page, session) {
  const m = session.manifest;
  const tabs = [["overview", "Overview"], ["align", "Align & compare"], ["data", "Data (DuckDB)"], ["export", "Export"]];
  page.innerHTML = header(m) + `
    ${session.interrupted_at_startup || m.status === "interrupted" ? `<div class="notice bad">This session was interrupted. Rows written before the interruption are kept; rows still buffered were lost.</div>` : ""}
    <nav class="tabs" role="tablist">${tabs.map(([k, label], i) => `<button role="tab" data-tab="${k}" aria-selected="${i === 0}">${label}</button>`).join("")}</nav>
    <div id="tab"></div>`;
  let dispose = null;
  const show = async key => {
    dispose?.();
    dispose = null;
    page.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === key));
    const el = page.querySelector("#tab");
    el.innerHTML = '<p class="muted">Loading…</p>';
    try {
      dispose = await { overview: overviewTab, align: alignTab, data: dataTab, export: exportTab }[key](el, session);
    } catch (e) {
      el.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`;
    }
  };
  page.querySelectorAll("[data-tab]").forEach(b => (b.onclick = () => show(b.dataset.tab)));
  show(m.kind === "import" ? "align" : "overview");
  return () => dispose?.();
}

function overviewTab(el, session) {
  const m = session.manifest;
  el.innerHTML = `
    <section class="card"><h2>Captures</h2>${captureTable(m)}</section>
    <div class="grid">${Object.entries(m.captures).map(([cid, c]) => `
      <section class="card">
        <div class="card-head"><h2>${esc(cid)}</h2>${inputBadge(c.input_kind)}</div>
        <p class="small">${esc(c.input_note)}</p>
        <dl class="kv">
          ${c.model ? `<dt>Model</dt><dd>${esc(c.model)}</dd>` : ""}
          <dt>Sources</dt><dd>${(c.sources || []).map(s => `${esc(s.name)}${s.sha256 ? `<br><code class="small">sha256 ${esc(s.sha256.slice(0, 16))}…</code>` : ""}`).join("<br>") || "none"}</dd>
          <dt>Clocks</dt><dd>${c.clocks.map(k => `<code>${esc(k.column)}</code> ${esc(k.kind)}<br><span class="small muted">${esc(k.description)}</span>`).join("<br>")}</dd>
          ${c.ignored_columns?.length ? `<dt>Not imported</dt><dd>${c.ignored_columns.map(esc).join(", ")} (spreadsheet additions)</dd>` : ""}
        </dl>
        ${c.timing ? `<h3>Requested vs recorded timing</h3>
          <dl class="kv"><dt>Requested samples</dt><dd>${c.timing.requested_samples}</dd>
            <dt>Recorded samples</dt><dd>${c.timing.recorded_samples} (${c.timing.missing_samples} missing)</dd>
            <dt>Requested duration</dt><dd>${c.timing.requested_s} s</dd>
            <dt>Device counter span</dt><dd>${c.timing.device_span_s} s (${c.timing.device_span_minus_requested_s >= 0 ? "+" : ""}${c.timing.device_span_minus_requested_s} s)</dd>
            <dt>Gaps over 150 ms</dt><dd>${c.timing.gaps_over_150ms} (largest ${c.timing.largest_gap_ms} ms)</dd></dl>
          <p class="small muted">The notebook's host loop waits at least the requested interval per sample, so a device span shorter than requested means the device counter and host time disagree. Needs a hardware check.</p>` : ""}
      </section>`).join("")}</div>`;
}

const REFERENCES = [
  ["event", "Shared event"],
  ["elapsed", "Elapsed since each start"],
  ["clock", "Clock time"],
];

async function alignTab(el, session) {
  const m = session.manifest;
  const spec = m.template.alignment || {};
  const saved = session.alignments.at(-1);
  const state = saved?.inputs ? structuredClone(saved.inputs) : { reference: spec.default_reference || "event", manual: {}, trial_params: {} };
  let charts = [];
  const disposeCharts = () => { charts.forEach(c => c.dispose()); charts = []; };

  const render = async () => {
    const { alignment, charts: data } = await api(`/api/sessions/${m.id}/alignment/preview`, { method: "POST", body: state });
    disposeCharts();
    const clockOrigin = alignment.clock_origin_utc ? new Date(alignment.clock_origin_utc).getTime() : null;
    const xName = {
      event: `Seconds from "${alignment.event_label}"`,
      elapsed: "Seconds since each capture's own start (starts not assumed simultaneous)",
      clock: "Clock time (host clock)",
    }[alignment.reference];
    el.innerHTML = `
      <section class="card">
        <div class="card-head"><h2>Alignment reference</h2>
          <div class="actions">${REFERENCES.map(([k, label]) => `<button data-ref="${k}" aria-pressed="${k === state.reference}">${label}</button>`).join("")}</div></div>
        ${alignment.reference === "elapsed" ? `<div class="notice warn">Each capture is placed from its own start. This does not mean the recordings started at the same experimental moment.</div>` : ""}
        ${alignment.reference === "event" && alignment.event_note ? `<div class="notice info">${esc(alignment.event_note)}</div>` : ""}
        ${alignment.unaligned.length ? `<div class="notice bad"><strong>Not aligned:</strong><ul>${alignment.unaligned.map(u => `
            <li><code>${esc(u.capture)}</code> in ${esc(u.trial)}: ${esc(u.reason)}
            ${u.needs_event_time ? `<div class="inline"><label class="field">Event time on <code>${esc(u.clocks)}</code> (s)<input type="number" step="any" data-manual="${esc(u.trial)}|${esc(u.capture)}|${esc(u.clocks.split(",")[0].trim())}"></label>
              <label class="field">How was it chosen?<input data-method="${esc(u.trial)}|${esc(u.capture)}" placeholder="e.g. workbook row 7405"></label></div>` : ""}</li>`).join("")}</ul>
            ${alignment.unaligned.some(u => u.needs_event_time) ? `<button id="apply-manual">Apply entered times</button>` : ""}</div>` : ""}
        ${alignment.trials.map(t => `
          <h3>${esc(t.label)}</h3>
          <div class="table-wrap"><table><thead><tr><th>Capture</th><th>Clock</th><th>Zero on that clock</th><th>How</th><th>± (s)</th></tr></thead><tbody>
            ${t.members.map(mb => `<tr><td><code>${esc(mb.capture)}</code></td><td><code>${esc(mb.clock.column)}</code></td>
              <td class="mono">${mb.clock.kind === "host_utc" || mb.clock.kind === "source_local" ? esc(new Date(mb.zero * 1000).toISOString()) : esc(mb.zero)}</td>
              <td class="small">${esc(mb.method)}</td><td>${mb.uncertainty_s ?? "?"}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No capture in this trial could be placed.</td></tr>'}
          </tbody></table></div>
          ${Object.keys(t.params).length ? `<div class="inline small">${Object.entries(t.params).map(([k, v]) =>
            `<label class="field">${esc(k)}<input type="number" step="any" style="width:150px" data-param="${esc(t.id)}|${esc(k)}" value="${v}"></label>`).join("")}</div>` : ""}`).join("")}
        <p class="small muted">${esc(alignment.uncertainty_note)} Offsets are stored in an alignment record; captured data is never shifted.
          ${saved ? `Opened from saved alignment <code>${esc(saved.id)}</code>.` : ""}</p>
        <div class="actions"><button class="primary" id="save-alignment" ${alignment.trials.some(t => t.members.length) ? "" : "disabled"}>Save this alignment</button></div>
      </section>
      <div class="grid charts">${data.map(c => `<section class="card"><div class="card-head"><h2>${esc(c.title)}</h2><span class="small muted">${esc(c.unit)}</span></div>
        ${c.series.length ? `<div class="chart" data-chart="${esc(c.id)}"></div>` : '<p class="muted">Nothing aligned for this chart.</p>'}</section>`).join("")}</div>`;

    for (const c of data.filter(c => c.series.length)) {
      const chart = makeChart(el.querySelector(`[data-chart="${c.id}"]`));
      const xFormatter = clockOrigin ? v => new Date(clockOrigin + v * 1000).toLocaleTimeString([], { hour12: false }) : undefined;
      const trials = new Set(c.series.map(s => s.trial)).size;
      chart.chart.setOption(lineOption({
        series: c.series.map(s => ({ name: trials > 1 ? `${s.trial} · ${s.value}` : s.name, points: s.points })),
        markers: c.markers, xName, xFormatter,
      }));
      charts.push(chart);
    }
    el.querySelectorAll("[data-ref]").forEach(b => (b.onclick = () => { state.reference = b.dataset.ref; render(); }));
    el.querySelector("#apply-manual")?.addEventListener("click", () => {
      el.querySelectorAll("[data-manual]").forEach(input => {
        if (input.value === "") return;
        const [trial, capture, clock] = input.dataset.manual.split("|");
        const method = el.querySelector(`[data-method="${trial}|${capture}"]`).value || "Entered by researcher";
        ((state.manual[trial] ||= {})[capture] = { clock, zero: Number(input.value), method });
      });
      render();
    });
    el.querySelectorAll("[data-param]").forEach(input => (input.onchange = () => {
      const [trial, key] = input.dataset.param.split("|");
      (state.trial_params[trial] ||= {})[key] = Number(input.value);
      render();
    }));
    el.querySelector("#save-alignment").onclick = async () => {
      const saved = await api(`/api/sessions/${m.id}/alignments`, { method: "POST", body: state });
      toast(`Saved ${saved.id}`);
      session.alignments.push(saved);
    };
  };
  await render();
  return disposeCharts;
}

const EXAMPLE_QUERIES = (alignmentId, lightCapture) => [
  ["Views in this session", `SELECT view_name FROM duckdb_views() WHERE NOT internal`],
  ...(lightCapture ? [["Saturation flashes", `SELECT label, t_native AS device_s, t_host_utc FROM "ev:${lightCapture}" WHERE kind = 'sat_flash'`]] : []),
  ...(alignmentId ? [[
    "Fluorescence with the latest CO2 reading (ASOF)",
    `WITH light AS (SELECT trial, x_s, fluorescence FROM aligned WHERE role = 'light'),
     ms AS (SELECT trial, x_s, ubar_co2 FROM aligned WHERE role = 'ms')
SELECT light.trial, light.x_s, light.fluorescence, ms.ubar_co2, light.x_s - ms.x_s AS co2_age_s
FROM light ASOF LEFT JOIN ms ON light.trial = ms.trial AND light.x_s >= ms.x_s
ORDER BY light.trial, light.x_s`,
  ]] : []),
];

async function dataTab(el, session) {
  const m = session.manifest;
  const latest = session.alignments.at(-1);
  const examples = EXAMPLE_QUERIES(latest?.id, Object.keys(m.captures).find(cid => m.captures[cid].role === "light"));
  el.innerHTML = `
    <section class="card">
      <div class="card-head"><h2>Query the session</h2><span class="small muted">DuckDB in memory over this session's Parquet files${latest ? `; <code>aligned</code> uses ${esc(latest.id)}` : "; save an alignment to get an <code>aligned</code> view"}</span></div>
      <div class="actions">${examples.map(([label], i) => `<button data-example="${i}">${esc(label)}</button>`).join("")}</div>
      <textarea id="sql" rows="7">${esc(examples.at(-1)[1])}</textarea>
      <div class="actions"><button class="primary" id="run">Run query</button><span class="small muted" id="query-info"></span></div>
      <div class="table-wrap" id="result"></div>
    </section>
    <section class="card"><h2>From a notebook</h2>
      <p class="small">The same views are available in Python. In-app Jupyter is deferred; this is what a notebook would call.</p>
      <pre>from cousinslab import open_session
con = open_session("${esc(m.id)}"${latest ? `, "${esc(latest.id)}"` : ""})  # path to the session folder
df = con.sql("SELECT * FROM aligned").df()</pre>
    </section>`;
  const sql = el.querySelector("#sql");
  el.querySelectorAll("[data-example]").forEach(b => (b.onclick = () => (sql.value = examples[b.dataset.example][1])));
  el.querySelector("#run").onclick = async () => {
    const out = el.querySelector("#result");
    try {
      const r = await api(`/api/sessions/${m.id}/query`, { method: "POST", body: { sql: sql.value, alignment_id: latest?.id } });
      const cols = r.rows.length ? Object.keys(r.rows[0]) : [];
      el.querySelector("#query-info").textContent = `${r.rows.length}${r.truncated ? "+" : ""} rows · views: ${r.views.join(", ")}`;
      out.innerHTML = `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.rows.slice(0, 200).map(row =>
        `<tr>${cols.map(c => `<td class="mono">${esc(typeof row[c] === "number" ? +row[c].toPrecision(8) : row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    } catch (e) {
      out.innerHTML = `<p class="error-text">${esc(e.message)}</p>`;
    }
  };
}

function exportTab(el, session) {
  const m = session.manifest;
  const spool = Object.entries(m.captures).filter(([, c]) => c.adapter === "ezview_spool");
  el.innerHTML = `
    <section class="card"><h2>Aligned CSV</h2>
      <p class="small">One header row. Keeps every original time column beside <code>x_s</code>, plus the alignment id. A JSON sidecar records the alignment, template revision, units, and source hashes.</p>
      ${session.alignments.length ? `<div class="table-wrap"><table><thead><tr><th>Alignment</th><th>Reference</th><th>Trials</th><th></th></tr></thead><tbody>
        ${session.alignments.map(a => `<tr><td><code>${esc(a.id)}</code></td><td>${esc(a.reference)}${a.event ? ` (${esc(a.event)})` : ""}</td>
          <td>${a.trials.map(t => esc(t.id)).join(", ")}</td><td><button data-export="${esc(a.id)}">Export CSV</button></td></tr>`).join("")}
      </tbody></table></div>` : '<p class="muted">Save an alignment on the Align & compare tab first.</p>'}
      <div id="export-result" class="small"></div>
    </section>
    ${spool.length ? `<section class="card"><h2>Legacy frame CSVs</h2>
      <p class="small">Headerless one-frame files in the column order and rounding of <code>readEZView.py</code>, for modules 1 to 3.</p>
      <div class="actions">${spool.map(([cid]) => `<button data-legacy="${esc(cid)}">Export ${esc(cid)}</button>`).join("")}</div></section>` : ""}
    <section class="card"><h2>Parquet</h2><p class="small">Stored as written: <code>sessions/${esc(m.id)}/captures/&lt;capture&gt;/samples/part-*.parquet</code>, with units in the field metadata.</p></section>`;
  const result = el.querySelector("#export-result");
  const link = path => `<a href="/api/file?path=${encodeURIComponent(path)}">${esc(path.split("/").pop())}</a>`;
  el.querySelectorAll("[data-export]").forEach(b => (b.onclick = async () => {
    const r = await api(`/api/sessions/${m.id}/alignments/${b.dataset.export}/export`, { method: "POST" });
    result.innerHTML = `Wrote ${link(r.csv)} and ${link(r.metadata)}`;
  }));
  el.querySelectorAll("[data-legacy]").forEach(b => (b.onclick = async () => {
    const r = await api(`/api/sessions/${m.id}/legacy-frames`, { method: "POST", body: { capture: b.dataset.legacy } });
    toast(`Wrote ${r.files} frame files to ${r.folder}`);
  }));
}
