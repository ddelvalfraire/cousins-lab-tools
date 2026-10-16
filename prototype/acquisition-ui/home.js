import { api, esc, fmtTime, icon, inputBadge, pageHeader, statusBadge } from "./util.js";
import { componentCount, layoutThumb } from "./components.js";
import { startRunDialog } from "./templates.js";

export async function renderHome(page) {
  const [sessions, templates, instruments] = await Promise.all([api("/api/sessions"), api("/api/templates"), api("/api/instruments")]);
  const live = sessions.filter(s => s.live);
  const kinds = [...new Set(instruments.map(p => p.input_kind))];
  const stat = (ico, label, value, note, href) => `
    <a class="stat-card" href="${href}"><span class="stat-label"><span class="stat-icon">${icon(ico)}</span>${esc(label)}</span>
      <strong>${value}</strong><span class="small muted">${note}</span></a>`;
  page.innerHTML = pageHeader([], "Home", {
    actions: `<button class="primary" id="start">${icon("play")}Start run</button>`,
  }) + `
    <div class="page-body">
      <div class="stat-grid">
        ${stat("chart", "Runs in progress", live.length, live.length ? "Open one below" : "No run is going", "#/sessions")}
        ${stat("device", "Instrument profiles", instruments.length, kinds.map(inputBadge).join(" "), "#/instruments")}
        ${stat("folder", "Sessions recorded", sessions.length, `${sessions.filter(s => s.kind === "import").length} imported`, "#/sessions")}
      </div>
      ${live.length ? `<section class="home-section"><h2>Ongoing</h2><div class="row-list">${live.map(s => `
        <a class="list-row" href="#/sessions/${esc(s.id)}/capture">
          <span class="row-thumb live-icon">${icon("chart")}</span>
          <span class="row-main"><strong>${esc(s.name)}</strong><span class="small muted">${esc(s.template)}</span></span>
          <span>${statusBadge(s.status)}</span><span class="small muted">started ${esc(fmtTime(s.created_utc))}</span>
          <span class="row-go">Open ${icon("right")}</span></a>`).join("")}</div></section>` : ""}
      <section class="home-section">
        <div class="section-head"><h2>Experiment templates</h2><a class="quiet-link" href="#/templates">${icon("right")}All templates</a></div>
        <div class="row-list">${templates.map(t => `
          <div class="list-row">
            <a href="#/templates/${esc(t.data.id)}" class="row-thumb">${layoutThumb(t)}</a>
            <a class="row-main" href="#/templates/${esc(t.data.id)}"><strong>${esc(t.data.name)}</strong><span class="small muted">revision ${t.data.revision}</span></a>
            <span class="row-main"><span>${t.enabled_roles.map(r => esc(r)).join(" + ")}</span>
              <span class="small muted">${t.layout.views.length} views · ${componentCount(t)} components</span></span>
            <span class="chips">${Object.values(t.data.derived || {}).map(d => `<span class="chip">${esc(d.label)}</span>`).join("")}</span>
            <button data-start="${esc(t.data.id)}">${icon("play")}Start</button>
          </div>`).join("")}</div>
      </section>
      <section class="home-section">
        <div class="section-head"><h2>Recent sessions</h2><a class="quiet-link" href="#/sessions">${icon("right")}All sessions</a></div>
        <div class="table-wrap"><table><thead><tr><th>Session</th><th>Template</th><th>Inputs</th><th>Status</th><th></th></tr></thead><tbody>
          ${sessions.slice(0, 5).map(s => `<tr><td><a href="#/sessions/${esc(s.id)}">${esc(s.name)}</a></td><td>${esc(s.template)}</td>
            <td>${s.inputs.map(inputBadge).join(" ")}</td><td>${statusBadge(s.status)}</td>
            <td><a class="button" href="#/sessions/${esc(s.id)}/capture">${icon("play")}${s.live ? "Open" : "Replay"}</a></td></tr>`).join("")
            || '<tr><td colspan="5" class="muted">No sessions yet.</td></tr>'}
        </tbody></table></div>
      </section>
    </div>`;
  page.querySelector("#start").onclick = () => startRunDialog(templates[0].data.id, templates);
  page.querySelectorAll("[data-start]").forEach(b => (b.onclick = () => startRunDialog(b.dataset.start, templates)));
}
