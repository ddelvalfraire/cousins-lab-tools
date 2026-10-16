import { api, esc, inputBadge, openDialog, toast } from "./util.js";

export async function renderTemplates(page) {
  const templates = await api("/api/templates");
  page.innerHTML = `
    <div class="page-head"><div><h1>Experiment templates</h1>
      <p class="sub">A template names the instruments, how they start, the derived values, the time alignment, and the charts. Screens are generated from it.</p></div></div>
    ${templates.map(t => `
      <section class="card">
        <div class="card-head"><h2><a href="#/templates/${esc(t.data.id)}">${esc(t.data.name)}</a></h2><span class="muted">revision ${t.data.revision}</span></div>
        <p>${esc(t.data.summary)}</p>
        <p class="small muted">Roles: ${t.enabled_roles.map(r => esc(t.data.roles[r].label)).join(" · ")}</p>
        <div class="actions"><button class="primary" data-start="${esc(t.data.id)}">Start run</button><a class="button" href="#/templates/${esc(t.data.id)}">Configure</a></div>
      </section>`).join("")}`;
  page.querySelectorAll("[data-start]").forEach(b => (b.onclick = () => startRunDialog(b.dataset.start, templates)));
}

export async function renderTemplate(page, id, revision) {
  const [view, instruments] = await Promise.all([
    api(`/api/templates/${id}${revision ? `?revision=${revision}` : ""}`),
    api("/api/instruments"),
  ]);
  const data = structuredClone(view.data);
  const latest = Math.max(...view.revisions);
  const profiles = Object.fromEntries(instruments.map(p => [p.id, p]));
  const plan = view.protocol_plans;

  page.innerHTML = `
    <div class="page-head">
      <div><div class="crumbs"><a href="#/templates">Experiment templates</a></div>
        <h1>${esc(data.name)}</h1>
        <p class="sub">${esc(data.id)} · revision ${data.revision}${data.revision !== latest ? ` (latest is <a href="#/templates/${esc(id)}">r${latest}</a>)` : ""}
          · revisions ${view.revisions.map(r => `<a href="#/templates/${esc(id)}/r${r}">r${r}</a>`).join(" ")}</p></div>
      <div class="actions"><button id="save" class="primary" disabled>Save as revision ${latest + 1}</button><button id="start">Start run with r${data.revision}</button></div>
    </div>
    <p>${esc(data.summary)}</p>
    <section class="card">
      <div class="card-head"><h2>Instruments and group start</h2><span class="small muted">Changing these changes the run. Saved revisions are immutable; sessions keep the revision they used.</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Role</th><th>Include</th><th>Instrument profile</th><th>Start delay (s)</th><th>If it fails</th></tr></thead>
        <tbody>${Object.entries(data.roles).map(([role, r]) => `
          <tr>
            <td><strong>${esc(role)}</strong><br><span class="small muted">${esc(r.label)}</span></td>
            <td><input type="checkbox" data-role="${esc(role)}" data-key="enabled" ${r.enabled === false ? "" : "checked"}></td>
            <td><select data-role="${esc(role)}" data-key="instrument">${instruments.filter(p => p.adapter === profiles[r.instrument]?.adapter)
              .map(p => `<option value="${esc(p.id)}" ${p.id === r.instrument ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>
              <div class="small">${inputBadge(profiles[r.instrument]?.input_kind)}</div></td>
            <td><input type="number" min="0" step="1" style="width:90px" data-role="${esc(role)}" data-key="start_delay_s" value="${r.start_delay_s ?? 0}"></td>
            <td><select data-role="${esc(role)}" data-key="on_failure">${["continue_others", "stop_group"].map(v =>
              `<option ${v === (r.on_failure || "continue_others") ? "selected" : ""} value="${v}">${v === "continue_others" ? "Keep the others running" : "Stop the whole group"}</option>`).join("")}</select></td>
          </tr>`).join("")}</tbody>
      </table></div>
      <div id="timeline" class="timeline"></div>
    </section>
    <div class="grid">
      ${Object.entries(plan).filter(([, p]) => p).map(([role, p]) => `
        <section class="card"><h2>Protocol (${esc(role)}): requested timing</h2>
          <dl class="kv"><dt>Protocol</dt><dd>${esc(data.roles[role].protocol)}</dd>
            <dt>Source</dt><dd>${esc(data.protocols[data.roles[role].protocol].source)}</dd>
            <dt>Samples</dt><dd>${p.samples}</dd><dt>Nominal duration</dt><dd>${p.nominal_s} s</dd>
            <dt>Saturation flashes</dt><dd>${p.flashes}</dd><dt>Measurement segments</dt><dd>${p.segments.length}</dd></dl>
          <p class="small muted">Requested timing only. Actual sample times come from the device counter and are compared after the run.</p>
        </section>`).join("")}
      <section class="card"><h2>Parameters</h2>
        ${Object.entries(data.parameters || {}).map(([k, p]) => `
          <label class="field">${esc(k)} (${esc(p.unit)})<input type="number" step="any" data-param="${esc(k)}" value="${p.value}">
            <span class="small">${esc(p.note || "")}</span></label>`).join("")}
      </section>
      <section class="card"><h2>Derived values</h2>
        <dl class="kv">${Object.entries(data.derived || {}).map(([k, d]) => `<dt>${esc(k)} (${esc(d.role)})</dt><dd><code>${esc(d.expr)}</code> ${esc(d.unit)}</dd>`).join("")}</dl>
        <p class="small muted">Evaluated by DuckDB for review and export, and by the engine for live charts.</p>
      </section>
      <section class="card"><h2>Time alignment</h2>
        <dl class="kv"><dt>Default reference</dt><dd>${esc(data.alignment?.default_reference)}</dd>
          <dt>Event</dt><dd>${esc(data.events?.[data.alignment?.event]?.label || "none")}</dd>
          <dt>One trial per</dt><dd>${esc(data.alignment?.trial_role || "session")} capture</dd>
          <dt>Window</dt><dd>${esc(JSON.stringify(data.alignment?.window_s || "all"))} s</dd></dl>
        <p class="small muted">${esc(data.events?.[data.alignment?.event]?.note || "")}</p>
      </section>
      <section class="card"><h2>Charts</h2>
        <ul>${view.charts.map(c => `<li>${esc(c.title)}: ${c.series.map(s => `${esc(s.role)}.${esc(s.value)}`).join(", ")}</li>`).join("")}</ul>
        <p class="small muted">Charts that only use excluded roles are hidden.</p>
      </section>
      <section class="card"><h2>Evidence</h2><ul class="small">${(data.evidence || []).map(e => `<li>${esc(e)}</li>`).join("")}</ul></section>
    </div>
    <details class="card"><summary>Edit as YAML</summary>
      <textarea id="yaml" rows="24">${esc(view.yaml)}</textarea>
      <p class="error-text" id="yaml-error"></p>
      <div class="actions"><button id="save-yaml">Validate and save as revision ${latest + 1}</button></div>
    </details>`;

  const save = page.querySelector("#save");
  const drawTimeline = () => {
    const roles = Object.entries(data.roles).filter(([, r]) => r.enabled !== false);
    const span = Math.max(60, ...roles.map(([role, r]) => (r.start_delay_s || 0) + (plan[role]?.nominal_s || 0))) * 1.1;
    page.querySelector("#timeline").innerHTML = `<p class="small muted">Requested group start (s from Start). Bars run to the protocol's nominal end; roles without a protocol run until stopped.</p>` +
      roles.map(([role, r]) => {
        const left = ((r.start_delay_s || 0) / span) * 100;
        const width = plan[role] ? (plan[role].nominal_s / span) * 100 : 100 - left;
        return `<div class="timeline-row"><span>${esc(role)} · +${r.start_delay_s || 0} s</span>
          <div class="timeline-bar"><span style="left:${left}%;width:${width}%">${plan[role] ? `${plan[role].nominal_s} s protocol` : "until stopped"}</span></div></div>`;
      }).join("");
  };
  drawTimeline();

  page.querySelectorAll("[data-role]").forEach(input => (input.onchange = () => {
    const role = data.roles[input.dataset.role];
    const key = input.dataset.key;
    role[key] = key === "enabled" ? input.checked : key === "start_delay_s" ? Number(input.value) : input.value;
    save.disabled = false;
    drawTimeline();
  }));
  page.querySelectorAll("[data-param]").forEach(input => (input.onchange = () => {
    data.parameters[input.dataset.param].value = Number(input.value);
    save.disabled = false;
  }));
  const saved = t => {
    toast(`Saved revision ${t.data.revision}`);
    location.hash = `#/templates/${t.data.id}/r${t.data.revision}`;
  };
  save.onclick = async () => {
    try { saved(await api(`/api/templates/${id}/revisions`, { method: "POST", body: { data } })); } catch (e) { toast(e.message); }
  };
  page.querySelector("#save-yaml").onclick = async () => {
    try { saved(await api(`/api/templates/${id}/revisions`, { method: "POST", body: { yaml: page.querySelector("#yaml").value } })); }
    catch (e) { page.querySelector("#yaml-error").textContent = e.message; }
  };
  page.querySelector("#start").onclick = () => startRunDialog(id, null, data.revision);
}

export async function startRunDialog(templateId, templates, revision) {
  templates ??= await api("/api/templates");
  const template = templates.find(t => t.data.id === templateId) || templates[0];
  const rev = revision ?? template.data.revision;
  openDialog(`
    <form>
      <h2>Start run</h2>
      <p>${esc(template.data.name)} · revision ${rev}</p>
      <div class="notice warn">No hardware is connected. The mass spectrometer is a simulated EZView spool and the Ambit is a replay of a recorded run. Clock times are this computer's, at the chosen speed.</div>
      <label class="field">Session name <input name="name" value="${esc(template.data.name)} · simulated"></label>
      <label class="field">Replay speed
        <select name="speed"><option value="1">1x (real time)</option><option value="10">10x</option><option value="20" selected>20x</option><option value="50">50x</option></select></label>
      <p class="error-text"></p>
      <div class="actions"><button value="cancel">Cancel</button><button class="primary" value="ok">Check readiness and start</button></div>
    </form>`, async form => {
      const manifest = await api("/api/runs", { method: "POST", body: { template_id: template.data.id, revision: rev, name: form.get("name"), speed: Number(form.get("speed")) } });
      location.hash = `#/sessions/${manifest.id}`;
    });
}
