// The capture page: a session's run page laid out by its template revision. Live while the engine runs it,
// then the same page over the stored data.

import { call, esc, fmtClock, icon, openDialog, pageHeader, showInFolder, statusBadge, toast } from "./util.js";
import { mountGrid, renderGrid } from "./components.js";
import { PANELS, panel } from "./diagnostics.js";
import { sessionSummary } from "./status.js";
import { fillGaps, visible, walk } from "./layout.js";
import { absorbRows, axisKeyFor, livePoints } from "./livepoints.js";
import { advance, axisFor, extentOf, formatDuration, parseDuration, RANGE_PRESETS, windowFor } from "./timerange.js";
import { selectable } from "./selection.js";
import { capturesFor, parseEntry, tableRecords, tableTsv } from "./analysis.js";

const LIVE_POLL_MS = 500;
const RUN_CLOCK = "Run clock (s since group start, host clock)";
const SOURCE_CLOCK = "Recording clock (s on the capture's own clock)";

function liveSource(m, template, currentView) {
  const rows = { points: livePoints(), cursors: {}, paramsRev: null };
  const { points, cursors } = rows;
  const events = [];
  const specs = Object.fromEntries(template.charts.map(c => [c.id, c]));
  const source = { live: true, version: 0, elapsed: 0, status: m.status, captures: m.captures, events };

  source.poll = async () => {
    const live = await call("session_live", { session_id: m.id, cursors });
    absorbRows(rows, live);
    source.paramsRev = rows.paramsRev;
    for (const [role, cap] of Object.entries(live.captures)) {
      for (const ev of cap.events) events.push({ source: role, kind: ev.kind, label: ev.label, x: ev.x_run_s });
    }
    for (const mk of live.markers.slice(events.filter(e => e.source === "operator").length)) {
      events.push({ source: "operator", kind: mk.kind, label: mk.label, x: mk.x_run_s, t_host_utc: mk.t_host_utc });
    }
    Object.assign(source, { elapsed: live.elapsed_s, status: live.status, captures: live.manifest_captures, version: source.version + 1 });
  };

  // Events carry only host time, so a view on the recording's clock shows no markers yet.
  source.dataset = () => {
    const axis = axisKeyFor(currentView().components, specs);
    const run = axis === "x";
    return {
      version: source.version,
      axis: { name: run ? RUN_CLOCK : SOURCE_CLOCK, format: formatDuration, parse: parseDuration },
      extent: run ? [0, source.elapsed] : extentOf(points.all("t")),
      chartSeries: id => specs[id].series.map(s => ({ name: `${s.role} · ${s.value}`, points: points.series(axis, s.role, s.value) })),
      chartMarkers: id => run ? events.filter(e => e.x != null && (e.source === "operator"
        || (specs[id].markers && e.source === specs[id].markers.role && e.kind === specs[id].markers.kind))) : [],
      valueSeries: (value, role) => [{ name: role, points: points.series(axis, role, value) }],
    };
  };
  return source;
}

let replayVersion = 0;

async function replaySource(m, session, template, reference) {
  const saved = session.alignments.at(-1);
  const inputs = saved?.inputs ? structuredClone(saved.inputs)
    : { reference: template.data.alignment?.default_reference || "event", manual: {}, trial_params: {} };
  if (reference) inputs.reference = reference;
  const source = { live: false, version: ++replayVersion, status: m.status, captures: m.captures, inputs, saved, events: [] };
  let aligned = { alignment: { reference: inputs.reference, unaligned: [], trials: [] }, charts: [], values: {} };
  try {
    aligned = await call("preview_alignment", { session_id: m.id, reference: inputs.reference, manual: inputs.manual, trial_params: inputs.trial_params });
  } catch (e) {
    source.error = e.message;
  }
  const a = aligned.alignment;
  const charts = Object.fromEntries(aligned.charts.map(c => [c.id, c]));
  const origin = a.clock_origin_utc ? new Date(a.clock_origin_utc).getTime() : null;
  const axis = axisFor(a.reference, origin);
  const trials = new Set(aligned.charts.flatMap(c => c.series.map(s => s.trial))).size;
  const all = [...aligned.charts.flatMap(c => c.series), ...Object.values(aligned.values).flat()].map(s => s.points);
  source.alignment = a;
  source.dataset = () => ({
    version: source.version,
    axis: {
      ...axis,
      name: { event: `Seconds from "${a.event_label}"`, elapsed: "Seconds since each capture's own start", clock: "Clock time (host clock)" }[a.reference],
      tickFormat: a.reference === "clock" ? axis.format : undefined,
    },
    extent: extentOf(all),
    chartSeries: id => (charts[id]?.series || []).map(s => ({ name: trials > 1 ? `${s.trial} · ${s.value}` : s.name, points: s.points })),
    chartMarkers: id => charts[id]?.markers || [],
    valueSeries: value => (aligned.values[value] || []).map(s => ({ name: s.trial, points: s.points })),
  });
  return source;
}


function recordingState(c, status, live) {
  if (status === "interrupted") return statusBadge("interrupted", "Interrupted");
  if (c.input_kind === "import") return statusBadge("imported", "From file");
  if (!c.rows) return statusBadge(live ? "waiting" : "not_started", live ? "Not yet" : "No rows");
  return live && ["running", "starting"].includes(c.status) ? statusBadge("running", "Recording") : statusBadge("completed", "Saved");
}

const INPUT_KINDS = { simulated: "Simulated", replay: "Replay", import: "Imported", hardware: "Hardware" };

/** The status card behind the header's capture button: the clock, each capture, and the diagnostics panels. */
function statusMenu(m, source, counts) {
  const policies = new Set(Object.values(source.captures).map(c => c.on_failure || "continue_others"));
  const policy = policies.size > 1 ? "Per role" : policies.has("stop_group") ? "Stop the whole group" : "Continue remaining";
  const duration = m.run?.stopped_utc && m.run?.group_start_utc ? (new Date(m.run.stopped_utc) - new Date(m.run.group_start_utc)) / 1000 : null;
  const clock = source.live ? ["Run elapsed", formatDuration(Math.floor(source.elapsed))]
    : m.kind === "import" ? ["Imported recordings", `${Object.keys(source.captures).length} ${Object.keys(source.captures).length === 1 ? "file" : "files"}`] : ["Run duration", duration == null ? "–" : formatDuration(Math.round(duration))];
  return `
    <div class="menu-section menu-clock"><span>${clock[0]}</span><strong>${clock[1]}</strong>
      ${m.run?.speed && m.run.speed !== 1 ? `<span class="badge">${m.run.speed}x replay</span>` : ""}</div>
    <div class="menu-section"><span class="menu-heading">Captures</span>${Object.entries(source.captures).map(([cid, c]) => `
      <button class="menu-row capture-row" data-panel-open="devices">${icon("device")}
        <span class="menu-label"><strong>${esc(cid)}</strong><span class="menu-meta">${esc(INPUT_KINDS[c.input_kind] || c.input_kind)} · ${(c.rows ?? 0).toLocaleString()} rows</span></span>
        ${recordingState(c, source.status, source.live)}</button>`).join("")}</div>
    <div class="menu-section">${PANELS.map(([k, label, ico]) => `
      <button class="menu-row" data-panel-open="${k}">${icon(ico)}<span class="menu-label">${label}</span>
        <span class="menu-meta">${counts[k] ?? ""}</span>${icon("right")}</button>`).join("")}</div>
    ${m.kind === "import" ? "" : `<div class="menu-footer"><span>If a device fails</span><span>${policy}</span></div>`}`;
}

function alerts(m, session, source, analysis) {
  const out = [];
  if (analysis.error) out.push(["bad", analysis.error]);
  if (session.interrupted_at_startup || source.status === "interrupted") {
    out.push(["bad", "Recording interrupted. Rows written before the interruption are kept; rows still buffered were lost. The gap stays in the recording."]);
  }
  for (const [cid, c] of Object.entries(source.captures)) {
    if (c.error) out.push(["bad", `${cid} failed: ${c.error}`]);
    if (c.readiness && !c.readiness.ok) out.push(["bad", `${cid} was not ready: ${c.readiness.detail}`]);
  }
  if (source.error) out.push(["bad", source.error]);
  for (const u of source.alignment?.unaligned || []) out.push(["warn", `${u.capture} is not on this axis: ${u.reason}`]);
  // One capture can be unaligned against several others; say it once.
  const unique = out.filter(([, text], i) => out.findIndex(([, t]) => t === text) === i);
  return unique.map(([tone, text]) => `<div class="alert-strip ${tone}">${icon("alert")}<span>${esc(text)}</span></div>`).join("");
}

async function mount(page, id, restart) {
  const session = await call("get_session", { session_id: id });
  const m = session.manifest;
  const [template, instruments, analysisView] = await Promise.all([call("get_template", { template_id: m.template.id, revision: m.template.revision }),
    call("list_instruments"), call("analysis", { session_id: id }).catch(e => ({ error: e.message }))]);
  // view: the engine's analysis view; previews: preview_reading per step for the selection; capture: role -> chosen capture.
  const analysis = { view: analysisView.error ? null : analysisView, error: analysisView.error, previews: {}, capture: {}, labels: {}, exported: {}, version: 0, token: 0 };
  // A view keeps its exact gaps only when its template says `fill: false`.
  const views = template.layout.views.map(v => {
    const shown = visible(v.components, template.hidden_components);
    return { ...v, components: v.fill === false ? shown : fillGaps(shown) };
  });
  const state = { view: views[0].id };
  const currentView = () => views.find(v => v.id === state.view);
  let source = session.live ? liveSource(m, template, currentView) : await replaySource(m, session, template);
  let grid = null, timer = null, storedEvents = null, panelKey = null, stopped = false;
  const actions = [];
  const logged = (text, request) => async (...args) => {
    actions.push({ when: new Date().toISOString(), source: "this page", text, tone: "info" });
    try {
      return await request(...args);
    } catch (e) {
      if (stopped) return;
      actions.push({ when: new Date().toISOString(), source: "engine", text: e.message, tone: "bad" });
      toast(e.message);
    }
  };

  const captureOf = role => analysis.capture[role] ?? capturesFor(m.captures, role)[0] ?? null;
  const refreshPreviews = async () => {
    const sel = view.selection, token = ++analysis.token;
    Object.assign(analysis, { previews: {}, version: analysis.version + 1 });
    paint();
    if (!sel || !analysis.view) return;
    const steps = [...new Set([...walk(currentView().components)].filter(([c]) => c.kind === "readings").flatMap(([c]) => c.steps))];
    const results = await Promise.all(steps.map(async step => {
      const capture = captureOf(analysis.view.steps[step]?.role);
      if (!capture) return null;
      return call("preview_reading", { session_id: m.id, step, capture, range_s: [sel.from, sel.to] })
        .then(r => [step, r], e => [step, { error: e.message }]);
    }));
    if (token !== analysis.token || stopped) return;
    Object.assign(analysis, { previews: Object.fromEntries(results.filter(Boolean)), version: analysis.version + 1 });
    paint();
  };
  /** saved runs once the record is saved, before the page repaints. */
  const record = async (args, saved = () => {}) => {
    const next = await call("record_analysis", { session_id: m.id, request_id: crypto.randomUUID(), ...args });
    if (stopped) return;
    Object.assign(analysis, { view: next, version: analysis.version + 1 });
    saved();
    refreshPreviews();
    // Review charts follow the session's current parameters too; live ones follow params_rev.
    if (source.live) return;
    const recomputed = await replaySource(m, session, template, source.alignment?.reference);
    if (stopped || source.live) return;
    source = recomputed;
    paint();
  };

  const ctx = {
    template, session: m,
    actions: {
      read: logged("Reading requested", async ({ step }) => {
        const sel = view.selection;
        if (sel) await record({ action: "reading", step, capture: captureOf(analysis.view.steps[step].role), range_s: [sel.from, sel.to] });
      }),
      entry: logged("Value entered", async ({ parameter }, text) => {
        const typed = parseEntry(text);
        if (typed.error) throw new Error(typed.error);
        await record({ action: "entry", parameter, value: typed.value });
      }),
      label: ({ measurement, key }, text) => { (analysis.labels[measurement] ??= {})[key] = text; },
      addRow: logged("Add to table requested", async ({ measurement }) => {
        await record({ action: "add_row", measurement, labels: analysis.labels[measurement] || {} }, () => delete analysis.labels[measurement]);
      }),
      exportTable: logged("Table export requested", async ({ measurement }) => {
        analysis.exported[measurement] = await call("export_table", { session_id: m.id, measurement });
        paint();
      }),
      copyTable: logged("Table copy requested", async ({ measurement }) => {
        const table = analysis.view.tables[measurement];
        await navigator.clipboard.writeText(tableTsv(table));
        toast(`Copied ${table.rows.length} rows with ${table.columns.length} columns`);
      }),
      clearTable: ({ measurement }) => openDialog(`
        <form><h2>Clear the table?</h2><p>Every row is retracted. The rows stay in the session's record log.</p><p class="error-text"></p>
          <div class="actions"><button value="cancel">Keep the rows</button><button class="danger" value="ok">Clear table</button></div></form>`,
        logged("Clear table requested", () => record({ action: "retract", records: tableRecords(analysis.view.tables[measurement]) }))),
      reveal: ({ path }) => showInFolder(path).catch(e => toast(e.message)),
      retract: logged("Removal requested", ({ records }) => record({ action: "retract", records: records.split(" ") })),
      capture: ({ role }, capture) => { analysis.capture[role] = capture; refreshPreviews(); },
      mark: logged("Mark requested", async ({ event }) => {
        const mk = await call("mark_session", { session_id: m.id, event });
        toast(`Marked ${mk.label} at ${fmtClock(mk.t_host_utc)}`);
      }),
      stop: logged("Stop requested", async () => { await call("stop_session", { session_id: m.id, cancel: false }); toast("Stopping…"); }),
      cancel: () => openDialog(`
        <form><h2>Cancel the run?</h2><p>Data recorded so far is kept.</p><p class="error-text"></p>
          <div class="actions"><button value="cancel">Keep running</button><button class="danger" value="ok">Cancel run</button></div></form>`,
        logged("Cancel requested", async () => { await call("stop_session", { session_id: m.id, cancel: true }); toast("Cancelling…"); })),
    },
  };

  const view = {
    range: { mode: source.live ? "60" : "all", custom: null },
    frozen: null,
    cursor: null, playing: false, speed: 1, lastTick: 0,
    selection: null, selecting: false, selectionVersion: 0,
  };
  const selectOn = () => ({ live: source.live, reference: source.alignment?.reference });
  const canSelect = () => {
    const specs = Object.fromEntries(template.data.charts.map(c => [c.id, c]));
    return currentView().components.some(c => c.kind === "chart" && selectable(specs[c.chart], selectOn()));
  };
  ctx.onSelect = range => {
    view.selection = range;
    view.selectionVersion++;
    refreshPreviews();
  };
  const windowOf = ds => view.frozen || windowFor(view.range.mode, ds.extent, view.range.custom);

  const frame = () => {
    const dataset = source.dataset();
    const window = windowOf(dataset);
    if (!source.live) view.cursor = Math.min(window.end, Math.max(window.start, view.cursor ?? window.end));
    const select = { ...selectOn(), range: view.selection, active: view.selecting, version: view.selectionVersion };
    return { dataset, window, cursor: source.live ? null : view.cursor, live: source.live, status: source.status, captures: source.captures, select, analysis };
  };
  const paintToolbar = f => {
    const fmt = f.dataset.axis.format;
    const q = sel => page.querySelector(sel);
    q("[data-range-summary]").textContent = `${fmt(f.window.start)} to ${fmt(f.window.end)} · ${Math.round(f.window.end - f.window.start)} s`;
    page.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", !view.frozen && b.dataset.range === view.range.mode));
    q("[data-range-custom]").setAttribute("aria-pressed", view.range.mode === "custom" || !!view.frozen);
    const freeze = q('[data-header="freeze"]');
    if (freeze) freeze.innerHTML = view.frozen ? `${icon("play")}Resume live` : `${icon("pause")}Freeze display`;
    const selecting = canSelect();
    q("[data-selection-controls]").hidden = !selecting;
    q("[data-select-mode]").setAttribute("aria-pressed", selecting && view.selecting);
    q("[data-selection]").textContent = view.selection ? `${fmt(view.selection.from)} to ${fmt(view.selection.to)}` : "No range selected";
    q("[data-selection-clear]").disabled = !view.selection;
    if (source.live) return void (q("[data-elapsed-bar]").textContent = formatDuration(Math.floor(source.elapsed)));
    q("[data-replay-time]").textContent = fmt(f.cursor);
    q("[data-replay-end]").textContent = fmt(f.window.end);
    Object.assign(q("[data-seek]"), { min: f.window.start, max: f.window.end, value: f.cursor });
    q("[data-seek]").setAttribute("aria-valuetext", fmt(f.cursor));
    q("[data-play]").innerHTML = icon(view.playing ? "pause" : "play");
    q("[data-play]").setAttribute("aria-label", view.playing ? "Pause" : "Play interval");
  };
  let statusKey = null;
  const paintStatus = () => {
    const summary = sessionSummary(source.captures, source.status);
    const eventList = source.live ? source.events : storedEvents;
    const counts = { events: eventList ? String(eventList.length) : "" };
    const key = JSON.stringify([summary, source.captures, source.status, source.live && Math.floor(source.elapsed), counts]);
    if (key === statusKey) return;
    statusKey = key;
    page.querySelector("[data-status-toggle]").innerHTML = `<span class="status-dot tone-${summary.tone}"></span>${esc(summary.label)}${icon("down")}`;
    page.querySelector("[data-status-popover]").innerHTML = statusMenu(m, source, counts);
  };
  const paintPanel = () => {
    const aside = page.querySelector("[data-panel]");
    page.querySelector("[data-workspace]").classList.toggle("has-diagnostics", !!view.panel);
    page.querySelectorAll("[data-panel-open]").forEach(b => b.setAttribute("aria-expanded", b.dataset.panelOpen === view.panel));
    aside.hidden = !view.panel;
    if (!view.panel) return void (panelKey = null);
    const eventList = source.live ? source.events : storedEvents?.map(e => ({ ...e, x: e.x_run_s }));
    const key = JSON.stringify([view.panel, eventList?.length, source.captures, actions.length]);
    if (key === panelKey) return;
    panelKey = key;
    aside.innerHTML = panel(view.panel, { m, captures: source.captures, instruments, eventList, actions });
  };
  const openPanel = async tab => {
    view.panel = view.panel === tab ? null : tab;
    if (view.panel === "events" && !source.live && !storedEvents) {
      paintPanel();
      storedEvents = await call("session_events", { session_id: m.id });
    }
    paintPanel();
  };
  const paint = () => {
    const f = frame();
    grid?.paint(f);
    paintToolbar(f);
    paintPanel();
    paintStatus();
    page.querySelector("[data-alerts]").innerHTML = alerts(m, session, source, analysis);
  };
  const mountView = () => {
    grid?.dispose();
    const v = views.find(v => v.id === state.view);
    const canvas = page.querySelector("[data-canvas]");
    canvas.innerHTML = renderGrid(v.components, ctx);
    grid = mountGrid(canvas, v.components, ctx);
    page.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-selected", b.dataset.view === state.view));
    paint();
  };
  const setRange = (mode, custom = null) => {
    Object.assign(view, { range: { mode, custom }, frozen: source.live && custom ? custom : null, playing: false });
    view.cursor = source.live ? null : windowOf(source.dataset()).start;
    paint();
  };

  const references = [["event", "Shared event"], ["elapsed", "Elapsed since each start"], ["clock", "Clock time"]];
  const toolbar = () => `
    <div class="capture-interval">
      <div class="range-options" role="group" aria-label="Time range">
        ${source.live ? "" : `<label class="reference-select"><span>Reference</span><select data-reference>${references.map(([k, label]) =>
          `<option value="${k}" ${k === source.alignment?.reference ? "selected" : ""}>${label}</option>`).join("")}</select></label>`}
        ${RANGE_PRESETS.map(([k, label]) => `<button class="range-chip" data-range="${k}">${label}</button>`).join("")}
        <button class="range-chip" data-range-custom aria-controls="custom-range">${icon("sliders")}Custom</button>
      </div>
    </div>`;
  const customForm = () => `
    <form id="custom-range" class="custom-range-form" hidden novalidate>
      <label class="field">Start<input name="from" autocomplete="off"></label>
      <label class="field">End<input name="to" autocomplete="off"></label>
      <button type="submit" class="primary">Apply</button><button type="button" data-custom-cancel>Cancel</button>
      <p class="small muted">${source.live ? "Run clock" : { event: "Time from the event, negative before it", elapsed: "Time since each capture's start", clock: "Local clock time" }[source.alignment?.reference] || ""}, as HH:MM:SS or seconds.
        Only the display changes; stored data keeps its original times.</p>
      <p class="error-text" role="alert"></p>
    </form>`;
  // Floating at the bottom of the page and hideable: play controls for a recording, the clock and freeze for a run.
  const transport = () => `
    <div class="transport-dock" data-dock>
      <div class="transport-bar" role="group" aria-label="${source.live ? "Live display" : "Replay"}">
        ${source.live ? `<span class="live-pill"><span class="live-dot"></span>Live</span>
          <div class="playhead-readout"><strong data-elapsed-bar></strong><span>run time</span></div>
          <button data-header="freeze"></button>` : `
          <button class="primary icon-only play-button" data-play></button>
          <button class="quiet icon-only" data-restart aria-label="Restart interval" title="Restart interval">${icon("undo")}</button>
          <div class="playhead-readout"><strong data-replay-time></strong><span>/ <span data-replay-end></span></span></div>
          <label class="replay-scrubber"><span class="sr-only">Replay position</span><input type="range" step="0.1" data-seek></label>
          <label class="speed-control"><span class="sr-only">Speed</span><select data-speed>${[0.5, 1, 2, 4, 10, 20].map(v => `<option value="${v}" ${v === view.speed ? "selected" : ""}>${v}×</option>`).join("")}</select></label>`}
        <span class="transport-range" title="${source.live ? "Display interval" : "Replay interval"}" data-range-summary></span>
        <button class="quiet icon-only" data-dock-toggle aria-label="Hide controls" title="Hide controls">${icon("down")}</button>
      </div>
      <button class="dock-show" data-dock-toggle hidden>${icon(source.live ? "clock" : "play")}${source.live ? "Live display" : "Replay controls"}${icon("up")}</button>
    </div>`;

  const t = m.template;
  page.innerHTML = pageHeader([["Home", "#/"], ["Sessions", "#/sessions"], [m.name, `#/sessions/${m.id}`]], m.name, {
    current: "Capture",
    sub: `<a href="#/templates/${esc(t.id)}/r${t.revision}">${esc(t.name)} r${t.revision}</a> · ${statusBadge(m.status)}`,
    actions: `<div class="status-menu"><button class="status-trigger" data-status-toggle aria-expanded="false" aria-controls="session-status"></button>
        <div class="status-popover" id="session-status" data-status-popover hidden></div></div>` + (session.live
      ? `<button class="danger" data-header="stop">${icon("stop")}Stop run</button>`
      : `<a class="button" href="#/sessions/${esc(m.id)}">${icon("file")}Review &amp; export</a>`),
  }) + `
    <div class="runtime-page">
      <div data-alerts></div>
      <section class="replay-controls" aria-label="${source.live ? "Display time range" : "Recording replay"}">
        <div class="capture-toolbar">
          <div class="capture-view-controls">
            <div class="view-tabs" role="tablist" aria-label="Views">${views.map(v => `<button role="tab" data-view="${esc(v.id)}">${esc(v.name)}</button>`).join("")}</div>
            <div class="selection-controls" data-selection-controls hidden>
              <button class="range-chip" data-select-mode title="Drag across a chart to select a range; off, dragging pans">${icon("sliders")}Select range</button>
              <span class="small muted" data-selection></span>
              <button class="quiet" data-selection-clear>Clear</button>
            </div>
          </div>
          ${toolbar()}
        </div>
        ${customForm()}
      </section>
      <div class="runtime-workspace" data-workspace><div class="runtime-canvas" data-canvas></div>
        <aside class="diagnostics-panel" id="diagnostics" data-panel hidden aria-label="Diagnostics"></aside></div>
      ${transport()}
    </div>`;

  const q = sel => page.querySelector(sel);
  const form = q("#custom-range");
  page.querySelectorAll("[data-view]").forEach(b => (b.onclick = () => { state.view = b.dataset.view; mountView(); refreshPreviews(); }));
  page.querySelectorAll("[data-range]").forEach(b => (b.onclick = () => setRange(b.dataset.range)));
  const popover = q("[data-status-popover]"), trigger = q("[data-status-toggle]");
  const showStatus = open => { popover.hidden = !open; trigger.setAttribute("aria-expanded", open); };
  trigger.addEventListener("click", event => { event.stopPropagation(); showStatus(popover.hidden); });
  popover.addEventListener("click", event => {
    const row = event.target.closest("[data-panel-open]");
    if (row) { showStatus(false); if (view.panel !== row.dataset.panelOpen) openPanel(row.dataset.panelOpen); }
  });
  // The page is mounted again on every visit; these die with it.
  const outside = new AbortController();
  document.addEventListener("click", event => event.target.closest?.(".status-menu") || showStatus(false), { signal: outside.signal });
  document.addEventListener("keydown", event => event.key === "Escape" && showStatus(false), { signal: outside.signal });
  const DOCK_KEY = "cousins-transport-hidden";
  const dockHidden = hidden => {
    q("[data-dock]").classList.toggle("collapsed", hidden);
    q(".transport-bar").hidden = hidden;
    q(".dock-show").hidden = !hidden;
    localStorage.setItem(DOCK_KEY, hidden ? "1" : "");
  };
  page.querySelectorAll("[data-dock-toggle]").forEach(b => (b.onclick = () => dockHidden(!q(".transport-bar").hidden)));
  dockHidden(!!localStorage.getItem(DOCK_KEY));
  q("[data-panel]").addEventListener("click", event => {
    if (event.target.closest("[data-panel-close]")) openPanel(view.panel);
    const tab = event.target.closest("[data-panel-tab]");
    if (tab && tab.dataset.panelTab !== view.panel) openPanel(tab.dataset.panelTab);
  });
  q("[data-range-custom]").onclick = () => {
    const f = frame();
    form.hidden = false;
    form.elements.from.value = f.dataset.axis.format(f.window.start);
    form.elements.to.value = f.dataset.axis.format(f.window.end);
    form.elements.from.focus();
  };
  q("[data-custom-cancel]").onclick = () => { form.hidden = true; };
  form.onsubmit = event => {
    event.preventDefault();
    const ds = source.dataset();
    const [from, to] = [form.elements.from.value, form.elements.to.value].map(ds.axis.parse);
    const [lo, hi] = ds.extent;
    const error = !Number.isFinite(from) || !Number.isFinite(to) ? "Enter HH:MM:SS or seconds."
      : from >= to ? "End must be after start."
      : to < lo || from > hi ? `The data spans ${ds.axis.format(lo)} to ${ds.axis.format(hi)}.` : "";
    form.querySelector(".error-text").textContent = error;
    if (error) return;
    form.hidden = true;
    setRange("custom", { start: from, end: to });
  };
  q('[data-header="freeze"]')?.addEventListener("click", () => {
    view.frozen = view.frozen ? null : windowOf(source.dataset());
    if (!view.frozen && view.range.mode === "custom") view.range = { mode: "60", custom: null };
    paint();
  });
  q('[data-header="stop"]')?.addEventListener("click", ctx.actions.stop);
  q("[data-select-mode]").addEventListener("click", () => { view.selecting = !view.selecting; paint(); });
  q("[data-selection-clear]").addEventListener("click", () => ctx.onSelect(null));
  q("[data-reference]")?.addEventListener("change", async event => {
    const next = await replaySource(m, session, template, event.target.value);
    if (stopped) return;
    source = next;
    Object.assign(view, { range: { mode: "all", custom: null }, cursor: null, playing: false, selection: null });
    form.hidden = true;
    mountView();
    refreshPreviews();
  });
  q("[data-play]")?.addEventListener("click", () => {
    const w = windowOf(source.dataset());
    if (!view.playing && view.cursor >= w.end) view.cursor = w.start;
    view.playing = !view.playing;
    view.lastTick = performance.now();
    paint();
  });
  q("[data-restart]")?.addEventListener("click", () => { view.cursor = windowOf(source.dataset()).start; view.playing = false; paint(); });
  q("[data-seek]")?.addEventListener("input", event => { view.cursor = Number(event.target.value); view.playing = false; paint(); });
  q("[data-speed]")?.addEventListener("change", event => { view.speed = Number(event.target.value); });
  mountView();

  const replay = setInterval(() => {
    if (!view.playing) return;
    const now = performance.now();
    const step = advance(view.cursor, (now - view.lastTick) / 1000, view.speed, windowOf(source.dataset()));
    view.lastTick = now;
    view.cursor = step.cursor;
    view.playing = !step.ended;
    paint();
  }, 100);

  const poll = async () => {
    try {
      await source.poll();
      if (stopped) return;
      if (analysis.view && source.paramsRev > analysis.view.rev) {
        Object.assign(analysis, { view: await call("analysis", { session_id: m.id }), version: analysis.version + 1 });
        if (stopped) return;
      }
      paint();
      if (["running", "stopping", "preparing"].includes(source.status)) timer = setTimeout(poll, LIVE_POLL_MS);
      else restart();
    } catch (e) {
      if (stopped) return;
      actions.push({ when: new Date().toISOString(), source: "engine", text: `Live update failed: ${e.message}`, tone: "bad" });
      toast(e.message);
      timer = setTimeout(poll, 2000);
    }
  };
  if (source.live) poll();
  return () => { stopped = true; clearTimeout(timer); clearInterval(replay); grid?.dispose(); outside.abort(); };
}

export async function renderCapture(page, id) {
  let disposed = false;
  let dispose = () => {};
  const restart = async () => {
    dispose();
    const next = await mount(page, id, restart);
    if (disposed) next();
    else dispose = next;
  };
  dispose = await mount(page, id, restart);
  return () => { disposed = true; dispose(); };
}
