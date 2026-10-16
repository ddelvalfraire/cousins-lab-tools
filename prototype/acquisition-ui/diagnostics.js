// The capture page's side panel: devices, events and markers, and a timing log, all from engine records.

import { esc, fmtClock, icon, inputBadge, statusBadge } from "./util.js";
import { formatDuration } from "./timerange.js";

export const PANELS = [["devices", "Devices", "device", "Devices"], ["events", "Events", "clock", "Events"], ["logs", "Capture logs", "file", "Logs"]];

function devices(m, captures, instruments) {
  const control = Object.fromEntries(instruments.map(p => [p.adapter, p.control]));
  return Object.entries(captures).map(([cid, c]) => `
    <article class="diag-card">
      <div class="section-head"><strong>${esc(cid)}</strong>${inputBadge(c.input_kind)}</div>
      <p class="small">${esc(c.label)}</p>
      <p class="small muted">${esc(c.input_note || "")}</p>
      <dl class="kv small">
        <dt>Status</dt><dd>${statusBadge(c.status)} ${c.rows ?? 0} rows</dd>
        ${c.readiness ? `<dt>Readiness</dt><dd>${c.readiness.ok ? "Ready" : "Not ready"}: ${esc(c.readiness.detail)}</dd>` : ""}
        ${c.model ? `<dt>Model</dt><dd>${esc(c.model)}</dd>` : ""}
        <dt>Adapter</dt><dd><code>${esc(c.adapter || "")}</code></dd>
        <dt>Control</dt><dd>${esc(control[c.adapter] || "None")}</dd>
        <dt>Clocks</dt><dd>${(c.clocks || []).map(k => `<code>${esc(k.column)}</code> ${esc(k.kind)}`).join("<br>")}</dd>
        <dt>Sources</dt><dd>${(c.sources || []).map(s => `${esc(s.name)}${s.sha256 ? ` <code>${esc(s.sha256.slice(0, 12))}…</code>` : ""}`).join("<br>") || "none"}</dd>
      </dl>
    </article>`).join("") + (m.run?.note ? `<p class="small muted">${esc(m.run.note)}</p>` : "");
}

function events(list) {
  if (!list) return '<p class="muted small">Loading…</p>';
  if (!list.length) return '<p class="muted small">No events yet. Saturation flashes and operator markers appear here.</p>';
  return `<ol class="diag-list">${list.map(e => `
    <li class="${e.source === "operator" ? "operator" : ""}">
      <span class="diag-time">${e.x != null ? formatDuration(e.x) : e.t_native != null ? `${Number(e.t_native).toFixed(3)} s` : ""}</span>
      <span><strong>${esc(e.label)}</strong><br><span class="small muted">${esc(e.source)} · ${esc(e.kind)}${e.t_host_utc ? ` · host ${esc(fmtClock(e.t_host_utc))}` : ""}${e.x == null && e.t_native != null ? ` · native clock ${esc(e.clock || "")}` : ""}</span></span>
    </li>`).join("")}</ol>
    <p class="small muted">Times are on the run clock when the session is a run; imported events keep only their native clock.</p>`;
}

/** Engine timestamps as a log, plus what this page asked the engine to do. */
function logs(m, captures, actions) {
  const rows = [];
  const add = (when, source, text, tone = "info") => when && rows.push({ when, source, text, tone });
  add(m.created_utc, "session", `Session created from ${m.template.name} r${m.template.revision}`);
  add(m.run?.group_start_utc, "group", `Group start${m.run?.speed ? ` at ${m.run.speed}x` : ""}`);
  for (const [cid, c] of Object.entries(captures)) {
    add(c.requested_start_utc, cid, `Requested start (+${c.requested_delay_s} s)`);
    add(c.start_command_utc, cid, "Start command");
    add(c.first_sample_utc, cid, "First sample");
    add(c.last_sample_utc, cid, `Last sample · ${c.rows ?? 0} rows`);
    add(c.stopped_utc, cid, `Stopped · ${c.status}`);
    if (c.error) rows.push({ when: c.stopped_utc || c.last_sample_utc || m.created_utc, source: cid, text: c.error, tone: "bad" });
  }
  add(m.run?.stopped_utc, "group", `Run ${m.status}${m.stopped_by ? `: ${m.stopped_by}` : ""}`);
  rows.push(...actions);
  rows.sort((a, b) => new Date(a.when) - new Date(b.when));
  return `<ol class="diag-list">${rows.map(r => `
    <li class="tone-${r.tone}"><span class="diag-time">${esc(fmtClock(r.when))}</span><span><strong>${esc(r.source)}</strong> ${esc(r.text)}</span></li>`).join("")}</ol>
    <p class="small muted">Host clock times recorded by the engine, and the requests this page sent.</p>`;
}

export function panel(tab, { m, captures, instruments, eventList, actions }) {
  const body = { devices: () => devices(m, captures, instruments), events: () => events(eventList), logs: () => logs(m, captures, actions) }[tab]();
  return `
    <header class="diag-head"><h2>${esc(PANELS.find(p => p[0] === tab)[1])}</h2>
      <button class="quiet icon-only" data-panel-close aria-label="Close panel">${icon("close")}</button></header>
    <nav class="tabs" role="tablist">${PANELS.map(([k, , , short]) => `<button role="tab" data-panel-tab="${k}" aria-selected="${k === tab}">${short}</button>`).join("")}</nav>
    <div class="diag-body">${body}</div>`;
}
