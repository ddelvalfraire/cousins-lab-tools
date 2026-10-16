// The capture page: a session's run page laid out by its template revision. Live while the engine runs it,
// then the same page over the stored data.

import { api, esc, fmtClock, icon, inputBadge, pageHeader, statusBadge, toast } from "./util.js";
import { mountGrid, renderGrid } from "./components.js";
import { visible } from "./layout.js";
import { axisFor, extentOf, formatDuration, windowFor } from "./timerange.js";

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
    axis: { name: RUN_CLOCK, format: formatDuration },
    extent: [0, source.elapsed],
    chartSeries: id => specs[id].series.map(s => ({ name: `${s.role} · ${s.value}`, points: points.get(`${s.role}:${s.value}`) || [] })),
    chartMarkers: id => events.filter(e => e.x != null && (e.source === "operator"
      || (specs[id].markers && e.source === specs[id].markers.role && e.kind === specs[id].markers.kind))),
    valueSeries: (value, role) => [{ name: role, points: points.get(`${role}:${value}`) || [] }],
  });
  return source;
}

async function replaySource(m, session, template, reference) {
  const saved = session.alignments.at(-1);
  const inputs = saved?.inputs ? structuredClone(saved.inputs)
    : { reference: template.data.alignment?.default_reference || "event", manual: {}, trial_params: {} };
  if (reference) inputs.reference = reference;
  const source = { live: false, version: 1, status: m.status, captures: m.captures, inputs, saved, events: [] };
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
    <div class="capture-policy"><span>Device failure</span><strong>${policy}</strong></div>`;
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
  const template = await api(`/api/templates/${m.template.id}?revision=${m.template.revision}`);
  const views = template.layout.views.map(v => ({ ...v, components: visible(v.components, template.hidden_components) }));
  const state = { view: views[0].id };
  let source = session.live ? liveSource(m, template) : await replaySource(m, session, template);
  let grid = null, timer = null;

  const ctx = {
    template, session: m,
    actions: {
      mark: async ({ event }) => {
        const mk = await api(`/api/sessions/${m.id}/mark`, { method: "POST", body: { event } });
        toast(`Marked ${mk.label} at ${fmtClock(mk.t_host_utc)}`);
      },
      stop: async () => { await api(`/api/sessions/${m.id}/stop`, { method: "POST" }); toast("Stopping…"); },
      cancel: async () => {
        if (!confirm("Cancel the run? Data recorded so far is kept.")) return;
        await api(`/api/sessions/${m.id}/cancel`, { method: "POST" });
        toast("Cancelling…");
      },
    },
  };

  const frame = () => {
    const dataset = source.dataset();
    return { dataset, window: windowFor("all", dataset.extent), cursor: null, live: source.live, status: source.status, captures: source.captures };
  };
  const paint = () => {
    grid?.paint(frame());
    page.querySelector("[data-strip]").innerHTML = statusStrip(m, source);
    page.querySelector("[data-alerts]").innerHTML = alerts(m, session, source);
  };
  const mountView = () => {
    grid?.dispose();
    const view = views.find(v => v.id === state.view);
    const canvas = page.querySelector("[data-canvas]");
    canvas.innerHTML = renderGrid(view.components, ctx);
    grid = mountGrid(canvas, view.components, ctx);
    page.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-selected", b.dataset.view === state.view));
    paint();
  };

  const t = m.template;
  page.innerHTML = pageHeader([["Sessions", "#/"], [m.name, `#/sessions/${m.id}`]], m.name, {
    current: "Capture",
    sub: `<a href="#/templates/${esc(t.id)}/r${t.revision}">${esc(t.name)} r${t.revision}</a> · ${statusBadge(m.status)}`,
    actions: session.live ? `<button class="danger" data-header="stop">${icon("stop")}Stop run</button>`
      : `<a class="button" href="#/sessions/${esc(m.id)}">${icon("file")}Review &amp; export</a>`,
  }) + `
    <div class="runtime-page">
      <section class="capture-status-strip" aria-label="Session state" data-strip></section>
      <div data-alerts></div>
      <section class="replay-controls">
        <div class="capture-toolbar">
          <div class="view-tabs" role="tablist" aria-label="Views">${views.map(v => `<button role="tab" data-view="${esc(v.id)}">${esc(v.name)}</button>`).join("")}</div>
        </div>
      </section>
      <div class="runtime-workspace"><div class="runtime-canvas" data-canvas></div></div>
    </div>`;
  page.querySelectorAll("[data-view]").forEach(b => (b.onclick = () => { state.view = b.dataset.view; mountView(); }));
  page.querySelector('[data-header="stop"]')?.addEventListener("click", ctx.actions.stop);
  mountView();

  const poll = async () => {
    try {
      await source.poll();
      paint();
      if (["running", "stopping", "preparing"].includes(source.status)) timer = setTimeout(poll, LIVE_POLL_MS);
      else restart();
    } catch (e) {
      toast(e.message);
      timer = setTimeout(poll, 2000);
    }
  };
  if (source.live) poll();
  return () => { clearTimeout(timer); grid?.dispose(); };
}

export async function renderCapture(page, id) {
  let dispose = () => {};
  const restart = async () => { dispose(); dispose = await mount(page, id, restart); };
  dispose = await mount(page, id, restart);
  return () => dispose();
}
