import { rawExports } from "./rawexport.js";
import { bindReveal, call, esc, fmtTime, icon, inputBadge, pageHeader, pathRow, statusBadge, toast } from "./util.js";
import { lineOption, makeChart } from "./charts.js";
import { captureTable } from "./components.js";

export async function renderSession(page, id) {
  const session = await call("get_session", { session_id: id });
  if (session.live) return void location.replace(`#/sessions/${id}/capture`);
  return renderReview(page, session);
}

function header(m, actions = "") {
  const t = m.template;
  return pageHeader([["Home", "#/"], ["Sessions", "#/sessions"]], m.name, {
    actions,
    sub: `${statusBadge(m.status)} ${m.kind === "import" ? "Imported recordings" : "Run"} · <a href="#/templates/${esc(t.id)}/r${t.revision}">${esc(t.name)} r${t.revision}</a> · created ${esc(fmtTime(m.created_utc))}`,
  });
}

async function renderReview(page, session) {
  const m = session.manifest;
  const tabs = [["overview", "Overview"], ["align", "Align & compare"], ["data", "Data (DuckDB)"], ["export", "Export"]];
  page.innerHTML = header(m, `<a class="button primary" href="#/sessions/${esc(m.id)}/capture">${icon("play")}Open recording</a>`) + `<div class="page-body">
    ${session.interrupted_at_startup || m.status === "interrupted" ? `<div class="notice bad">This session was interrupted. Rows written before the interruption are kept; rows still buffered were lost.</div>` : ""}
    <nav class="tabs" role="tablist">${tabs.map(([k, label], i) => `<button role="tab" data-tab="${k}" aria-selected="${i === 0}">${label}</button>`).join("")}</nav>
    <div id="tab"></div></div>`;
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
  const inputs = () => ({ session_id: m.id, reference: state.reference, manual: state.manual, trial_params: state.trial_params });
  let charts = [];
  const disposeCharts = () => { charts.forEach(c => c.dispose()); charts = []; };

  const render = async () => {
    const { alignment, charts: data } = await call("preview_alignment", inputs());
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
        markers: c.markers, xName, xFormatter, title: c.title,
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
      const saved = await call("save_alignment", inputs());
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

const join = (dir, ...parts) => [dir.replace(/[\\/]+$/, ""), ...parts].join(dir.includes("\\") ? "\\" : "/");

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
      <p class="small">Each capture's samples and events are Parquet files in this session's folder, so a notebook can read them with pandas, pyarrow or DuckDB.
        The <code>aligned</code> view is built here; export an aligned CSV on the Export tab to take the same rows to a notebook.</p>
      <div class="small" id="session-folder"></div>
    </section>`;
  const folder = el.querySelector("#session-folder");
  call("engine_info").then(info => {
    folder.innerHTML = pathRow(join(info.data_dir, "sessions", m.id));
    bindReveal(folder);
  }, e => (folder.textContent = e.message));
  const sql = el.querySelector("#sql");
  el.querySelectorAll("[data-example]").forEach(b => (b.onclick = () => (sql.value = examples[b.dataset.example][1])));
  el.querySelector("#run").onclick = async () => {
    const out = el.querySelector("#result");
    try {
      const r = await call("query_session", { session_id: m.id, sql: sql.value, alignment_id: latest?.id ?? null });
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
  const raw = rawExports(m.captures);
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
      <div class="actions">${spool.map(([cid]) => `<button data-legacy="${esc(cid)}">Export ${esc(cid)}</button>`).join("")}</div>
      <div id="legacy-result" class="small"></div></section>` : ""}
    ${raw.length ? `<section class="card"><h2>Raw rows (CSV)</h2>
      <p class="small">Every stored row of one capture with its original columns, and a JSON sidecar naming the session, capture, source files and row count. The legacy layout is the Count, Time, m32 to m49 file the legacy modules wrote at STOP. An unchanged capture returns the files already written.</p>
      <div class="actions">${raw.map(r => `<button data-raw="${esc(r.capture)}">Export ${esc(r.capture)}</button>${r.legacy
        ? `<button data-raw="${esc(r.capture)}" data-legacy-header="1">${esc(r.capture)}, legacy layout</button>` : ""}`).join("")}</div>
      <div id="raw-result" class="small"></div></section>` : ""}
    <section class="card"><h2>Parquet</h2><p class="small">Stored as written: <code>sessions/${esc(m.id)}/captures/&lt;capture&gt;/samples/part-*.parquet</code>, with units in the field metadata.</p></section>`;
  const result = el.querySelector("#export-result");
  const showPaths = (target, note, paths) => {
    target.innerHTML = `<p>${esc(note)}</p>${paths.map(pathRow).join("")}`;
    bindReveal(target);
  };
  el.querySelectorAll("[data-export]").forEach(b => (b.onclick = async () => {
    const r = await call("export_alignment", { session_id: m.id, alignment_id: b.dataset.export });
    showPaths(result, "Wrote the CSV and its metadata sidecar.", [r.csv, r.metadata]);
  }));
  el.querySelectorAll("[data-raw]").forEach(b => (b.onclick = async () => {
    const r = await call("export_capture_csv", { session_id: m.id, capture: b.dataset.raw, legacy_header: !!b.dataset.legacyHeader });
    showPaths(el.querySelector("#raw-result"), `${r.existing ? "Already exported" : "Wrote"} ${r.rows.toLocaleString()} rows and the sidecar.`, [r.csv, r.metadata]);
  }));
  el.querySelectorAll("[data-legacy]").forEach(b => (b.onclick = async () => {
    const r = await call("export_legacy_frames", { session_id: m.id, capture: b.dataset.legacy });
    showPaths(el.querySelector("#legacy-result"), `Wrote ${r.files} frame files.`, [r.folder]);
  }));
}
