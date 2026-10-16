// The capture page: a session's run page laid out by its template revision. Live while the engine runs it,
// then the same page over the stored data.

import { api, esc, fmtClock, icon, inputBadge, pageHeader, statusBadge, toast } from "./util.js";
import { mountGrid, renderGrid } from "./components.js";
import { PANELS, panel } from "./diagnostics.js";
import { visible } from "./layout.js";
import { advance, axisFor, extentOf, formatDuration, parseDuration, RANGE_PRESETS, windowFor } from "./timerange.js";

const LIVE_POLL_MS = 500;
const RUN_CLOCK = "Run clock (s since group start, host clock)";

function liveSource(m, template) {
  const points = new Map();
  const events = [];
  const cursors = {};
  const specs = Object.fromEntries(template.charts.map(c => [c.id, c]));
  const source = { live: true, version: 0, elapsed: 0, status: m.status, captures: m.captures, events };

  source.poll = async () => {
    const live = await api(`/api/sessions/${m.id}/live?cursors=${encodeURIComponent(JSON.stringify(cursors))}`);
    for (const [role, cap] of Object.entries(live.captures)) {
      cursors[role] = cap.next;
      cursors[`${role}:events`] = cap.events_next;
      for (const row of cap.rows) {
        for (const [key, value] of Object.entries(row)) {
          if (key === "x" || value == null) continue;
          if (!points.has(`${role}:${key}`)) points.set(`${role}:${key}`, []);
          points.get(`${role}:${key}`).push([row.x, value]);
        }
      }
      for (const ev of cap.events) events.push({ source: role, kind: ev.kind, label: ev.label, x: ev.x_run_s });
    }
    for (const mk of live.markers.slice(events.filter(e => e.source === "operator").length)) {
      events.push({ source: "operator", kind: mk.kind, label: mk.label, x: mk.x_run_s, t_host_utc: mk.t_host_utc });
    }
    Object.assign(source, { elapsed: live.elapsed_s, status: live.status, captures: live.manifest_captures, version: source.version + 1 });
  };

  source.dataset = () => ({
    version: source.version,
    axis: { name: RUN_CLOCK, format: formatDuration, parse: parseDuration },
    extent: [0, source.elapsed],
    chartSeries: id => specs[id].series.map(s => ({ name: `${s.role} · ${s.value}`, points: points.get(`${s.role}:${s.value}`) || [] })),
    chartMarkers: id => events.filter(e => e.x != null && (e.source === "operator"
      || (specs[id].markers && e.source === specs[id].markers.role && e.kind === specs[id].markers.kind))),
    valueSeries: (value, role) => [{ name: role, points: points.get(`${role}:${value}`) || [] }],
  });
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
    aligned = await api(`/api/sessions/${m.id}/alignment/preview`, { method: "POST", body: inputs });
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

const ACQUISITION = { running: "Acquiring", completed: "Stopped", source_ended: "Source ended", waiting: "Waiting for start", imported: "Imported" };

function recordingState(c, status, live) {
  if (status === "interrupted") return statusBadge("interrupted", "Interrupted");
  if (c.input_kind === "import") return statusBadge("imported", "From file");
  if (!c.rows) return statusBadge(live ? "waiting" : "not_started", live ? "Not yet" : "No rows");
  return live && ["running", "starting"].includes(c.status) ? statusBadge("running", "Recording") : statusBadge("completed", "Saved");
}

function statusStrip(m, source) {
  const policies = new Set(Object.values(source.captures).map(c => c.on_failure || "continue_others"));
  const policy = policies.size > 1 ? "Per role" : policies.has("stop_group") ? "Stop the whole group" : "Continue remaining";
  const duration = m.run?.stopped_utc && m.run?.group_start_utc ? (new Date(m.run.stopped_utc) - new Date(m.run.group_start_utc)) / 1000 : null;
  const clock = source.live ? ["Run elapsed", formatDuration(Math.floor(source.elapsed))]
    : m.kind === "import" ? ["Imported recordings", "–"] : ["Run duration", duration == null ? "–" : formatDuration(Math.round(duration))];
  return `
    <div class="capture-clock"><span>${clock[0]}</span><strong data-elapsed>${clock[1]}</strong>
      ${m.run?.speed && m.run.speed !== 1 ? `<small>${m.run.speed}x replay speed</small>` : ""}</div>
    <div class="capture-devices">${Object.entries(source.captures).map(([cid, c]) => `
      <div class="device-state">
        <span class="device-name"><strong>${esc(cid)}</strong>${inputBadge(c.input_kind)}</span>
        <span class="device-row"><span>Acquisition</span>${statusBadge(c.status, ACQUISITION[c.status])}</span>
        <span class="device-row"><span>Recording</span>${recordingState(c, source.status, source.live)}<small>${c.rows ?? 0} rows</small></span>
      </div>`).join("")}</div>
    ${m.kind === "import" ? "" : `<div class="capture-policy"><span>Device failure</span><strong>${policy}</strong></div>`}`;
}

function alerts(m, session, source) {
  const out = [];
  if (session.interrupted_at_startup || source.status === "interrupted") {
    out.push(["bad", "Recording interrupted. Rows written before the interruption are kept; rows still buffered were lost. The gap stays in the recording."]);
  }
  for (const [cid, c] of Object.entries(source.captures)) {
    if (c.error) out.push(["bad", `${cid} failed: ${c.error}`]);
    if (c.readiness && !c.readiness.ok) out.push(["bad", `${cid} was not ready: ${c.readiness.detail}`]);
  }
  if (source.error) out.push(["bad", source.error]);
  for (const u of source.alignment?.unaligned || []) out.push(["warn", `${u.capture} is not on this axis: ${u.reason}`]);
  return out.map(([tone, text]) => `<div class="alert-strip ${tone}">${icon("alert")}<span>${esc(text)}</span></div>`).join("");
}

async function mount(page, id, restart) {
  const session = await api(`/api/sessions/${id}`);
  const m = session.manifest;
  const [template, instruments] = await Promise.all([api(`/api/templates/${m.template.id}?revision=${m.template.revision}`), api("/api/instruments")]);
  const views = template.layout.views.map(v => ({ ...v, components: visible(v.components, template.hidden_components) }));
  const state = { view: views[0].id };
  let source = session.live ? liveSource(m, template) : await replaySource(m, session, template);
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

  const ctx = {
    template, session: m,
    actions: {
      mark: logged("Mark requested", async ({ event }) => {
        const mk = await api(`/api/sessions/${m.id}/mark`, { method: "POST", body: { event } });
        toast(`Marked ${mk.label} at ${fmtClock(mk.t_host_utc)}`);
      }),
      stop: logged("Stop requested", async () => { await api(`/api/sessions/${m.id}/stop`, { method: "POST" }); toast("Stopping…"); }),
      cancel: async () => {
        if (!confirm("Cancel the run? Data recorded so far is kept.")) return;
        await logged("Cancel requested", async () => { await api(`/api/sessions/${m.id}/cancel`, { method: "POST" }); toast("Cancelling…"); })();
      },
    },
  };

  const view = {
    range: { mode: source.live ? "60" : "all", custom: null },
    frozen: null,
    cursor: null, playing: false, speed: 1, lastTick: 0,
  };
  const windowOf = ds => view.frozen || windowFor(view.range.mode, ds.extent, view.range.custom);

  const frame = () => {
    const dataset = source.dataset();
    const window = windowOf(dataset);
    if (!source.live) view.cursor = Math.min(window.end, Math.max(window.start, view.cursor ?? window.end));
    return { dataset, window, cursor: source.live ? null : view.cursor, live: source.live, status: source.status, captures: source.captures };
  };
  const paintToolbar = f => {
    const fmt = f.dataset.axis.format;
    const q = sel => page.querySelector(sel);
    q("[data-range-summary]").textContent = `${fmt(f.window.start)} to ${fmt(f.window.end)} · ${Math.round(f.window.end - f.window.start)} s`;
    page.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", !view.frozen && b.dataset.range === view.range.mode));
    q("[data-range-custom]").setAttribute("aria-pressed", view.range.mode === "custom" || !!view.frozen);
    const freeze = q('[data-header="freeze"]');
    if (freeze) freeze.innerHTML = view.frozen ? `${icon("play")}Resume live` : `${icon("pause")}Freeze display`;
    if (source.live) return;
    q("[data-replay-time]").textContent = fmt(f.cursor);
    q("[data-replay-end]").textContent = fmt(f.window.end);
    Object.assign(q("[data-seek]"), { min: f.window.start, max: f.window.end, value: f.cursor });
    q("[data-seek]").setAttribute("aria-valuetext", fmt(f.cursor));
    q("[data-play]").innerHTML = view.playing ? `${icon("pause")}Pause` : `${icon("play")}Play interval`;
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
      storedEvents = await api(`/api/sessions/${m.id}/events`);
    }
    paintPanel();
  };
  const paint = () => {
    const f = frame();
    grid?.paint(f);
    paintToolbar(f);
    paintPanel();
    page.querySelector("[data-strip]").innerHTML = statusStrip(m, source);
    page.querySelector("[data-alerts]").innerHTML = alerts(m, session, source);
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
      <div class="range-heading"><strong>${source.live ? "Display interval" : "Replay interval"}</strong><span data-range-summary></span></div>
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
  const transport = () => source.live ? "" : `
    <div class="replay-transport">
      <button data-play></button>
      <button class="icon-only" data-restart aria-label="Restart interval" title="Restart interval">${icon("undo")}</button>
      <div class="playhead-readout"><strong data-replay-time></strong><span>/ <span data-replay-end></span></span></div>
      <label class="replay-scrubber"><span class="sr-only">Replay position</span><input type="range" step="0.1" data-seek></label>
      <label class="speed-control">Speed<select data-speed>${[0.5, 1, 2, 4, 10, 20].map(v => `<option value="${v}" ${v === view.speed ? "selected" : ""}>${v}×</option>`).join("")}</select></label>
    </div>`;

  const t = m.template;
  page.innerHTML = pageHeader([["Home", "#/"], ["Sessions", "#/sessions"], [m.name, `#/sessions/${m.id}`]], m.name, {
    current: "Capture",
    sub: `<a href="#/templates/${esc(t.id)}/r${t.revision}">${esc(t.name)} r${t.revision}</a> · ${statusBadge(m.status)}`,
    actions: session.live ? `<button data-header="freeze"></button><button class="danger" data-header="stop">${icon("stop")}Stop run</button>`
      : `<a class="button" href="#/sessions/${esc(m.id)}">${icon("file")}Review &amp; export</a>`,
  }) + `
    <div class="runtime-page">
      <section class="capture-status-strip" aria-label="Session state" data-strip></section>
      <div data-alerts></div>
      <section class="replay-controls" aria-label="${source.live ? "Display time range" : "Recording replay"}">
        <div class="capture-toolbar">
          <div class="capture-view-controls">
            <div class="view-tabs" role="tablist" aria-label="Views">${views.map(v => `<button role="tab" data-view="${esc(v.id)}">${esc(v.name)}</button>`).join("")}</div>
            <div class="actions">${PANELS.map(([k, label, ico]) => `<button class="quiet" data-panel-open="${k}" aria-controls="diagnostics" aria-expanded="false">${icon(ico)}${label}</button>`).join("")}</div>
          </div>
          ${toolbar()}
        </div>
        ${customForm()}
        ${transport()}
      </section>
      <div class="runtime-workspace" data-workspace><div class="runtime-canvas" data-canvas></div>
        <aside class="diagnostics-panel" id="diagnostics" data-panel hidden aria-label="Diagnostics"></aside></div>
    </div>`;

  const q = sel => page.querySelector(sel);
  const form = q("#custom-range");
  page.querySelectorAll("[data-view]").forEach(b => (b.onclick = () => { state.view = b.dataset.view; mountView(); }));
  page.querySelectorAll("[data-range]").forEach(b => (b.onclick = () => setRange(b.dataset.range)));
  page.querySelectorAll("[data-panel-open]").forEach(b => (b.onclick = () => openPanel(b.dataset.panelOpen)));
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
  q("[data-reference]")?.addEventListener("change", async event => {
    const next = await replaySource(m, session, template, event.target.value);
    if (stopped) return;
    source = next;
    Object.assign(view, { range: { mode: "all", custom: null }, cursor: null, playing: false });
    form.hidden = true;
    mountView();
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
  return () => { stopped = true; clearTimeout(timer); clearInterval(replay); grid?.dispose(); };
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
