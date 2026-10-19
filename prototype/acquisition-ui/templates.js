import { call, esc, icon, inputBadge, openDialog, pageHeader, toast } from "./util.js";
import { mountEditor } from "./editor.js";
import { componentCount, layoutThumb } from "./components.js";
import { profileChoices, runInputs, runSources, sourcesFrom } from "./importing.js";
import { START_MODES, startRoles, startsFrom } from "./starts.js";

export async function renderTemplates(page) {
  const templates = await call("list_templates");
  page.innerHTML = pageHeader([["Home", "#/"]], "Experiment templates", {
    sub: "A template names the instruments, how they start, the derived values, the time alignment, the charts, and the run-page layout. Screens are generated from it.",
  }) + `<div class="page-body">
    ${templates.map(t => `
      <section class="card">
        <div class="template-card-head"><a href="#/templates/${esc(t.data.id)}/r${t.data.revision}/layout" class="row-thumb" title="Run-page layout">${layoutThumb(t)}</a>
          <div class="card-head" style="flex:1"><h2><a href="#/templates/${esc(t.data.id)}">${esc(t.data.name)}</a></h2>
          <span class="muted">revision ${t.data.revision} · ${t.layout.views.length} views · ${componentCount(t)} components</span></div></div>
        <p>${esc(t.data.summary)}</p>
        <p class="small muted">Roles: ${t.enabled_roles.map(r => esc(t.data.roles[r].label)).join(" · ")}</p>
        <div class="actions"><button class="primary" data-start="${esc(t.data.id)}">Start run</button><a class="button" href="#/templates/${esc(t.data.id)}">Configure</a></div>
      </section>`).join("")}</div>`;
  page.querySelectorAll("[data-start]").forEach(b => (b.onclick = () => startRunDialog(b.dataset.start, templates)));
}

export async function renderTemplate(page, id, revision, tab) {
  page.classList.add("template-page");
  const [view, instruments] = await Promise.all([
    call("get_template", { template_id: id, revision: revision ? Number(revision) : null }),
    call("list_instruments"),
  ]);
  const data = structuredClone(view.data);
  const latest = Math.max(...view.revisions);
  const profiles = Object.fromEntries(instruments.map(p => [p.id, p]));
  const plan = view.protocol_plans;

  page.innerHTML = pageHeader([["Home", "#/"], ["Experiment templates", "#/templates"]], data.name, {
    sub: `${esc(data.id)} · revision ${data.revision}${data.revision !== latest ? ` (latest is <a href="#/templates/${esc(id)}">r${latest}</a>)` : ""}
          · revisions ${view.revisions.map(r => `<a href="#/templates/${esc(id)}/r${r}">r${r}</a>`).join(" ")}`,
    actions: `<button id="save" disabled>${icon("save")}Save as revision ${latest + 1}</button><button id="start" class="primary">${icon("play")}Start run with r${data.revision}</button>`,
  }) + `<div class="page-body">
    <nav class="tabs" role="tablist">${[["setup", "Setup"], ["layout", "Run-page layout"]].map(([k, label]) =>
      `<button role="tab" data-page-tab="${k}" aria-selected="${k === (tab || "setup")}">${label}</button>`).join("")}</nav>
    <div class="layout-editor" data-tab-panel="layout" hidden></div>
    <div class="setup" data-tab-panel="setup">
    <p>${esc(data.summary)}</p>
    <section class="card">
      <div class="card-head"><h2>Instruments and group start</h2><span class="small muted">Changing these changes the run. Saved revisions are immutable; sessions keep the revision they used.</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Role</th><th>Include</th><th>Instrument profile</th><th>Start delay (s)</th><th>If it fails</th></tr></thead>
        <tbody>${Object.entries(data.roles).map(([role, r]) => `
          <tr>
            <td><strong>${esc(role)}</strong><br><span class="small muted">${esc(r.label)}</span></td>
            <td><input type="checkbox" data-role="${esc(role)}" data-key="enabled" ${r.enabled === false ? "" : "checked"}></td>
            <td><select data-role="${esc(role)}" data-key="instrument">${profileChoices(view.compatible_instruments, role, r.instrument, instruments)
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
    </details></div></div>`;

  let editorHandle = null;
  const showTab = key => {
    page.dataset.templateTab = key;
    page.querySelector("#save").hidden = key === "layout";
    page.querySelectorAll("[data-page-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.pageTab === key));
    page.querySelectorAll("[data-tab-panel]").forEach(p => (p.hidden = p.dataset.tabPanel !== key));
    const editor = page.querySelector('[data-tab-panel="layout"]');
    if (key === "layout" && !editor.childElementCount) {
      editorHandle = mountEditor(editor, view, { draft: data, hasSetupChanges: () => !page.querySelector("#save").disabled,
        onSaved: t => { toast(`Saved revision ${t.data.revision}`); location.hash = `#/templates/${t.data.id}/r${t.data.revision}/layout`; } });
    } else if (key === "layout") {
      editorHandle.refresh();
    }
  };
  page.querySelectorAll("[data-page-tab]").forEach(b => (b.onclick = () => showTab(b.dataset.pageTab)));
  showTab(tab || "setup");

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
    try { saved(await call("save_template", { template_id: id, data })); } catch (e) { toast(e.message); }
  };
  page.querySelector("#save-yaml").onclick = async () => {
    try { saved(await call("save_template", { template_id: id, yaml: page.querySelector("#yaml").value })); }
    catch (e) { page.querySelector("#yaml-error").textContent = e.message; }
  };
  page.querySelector("#start").onclick = () => startRunDialog(id, null, data.revision);
  return () => editorHandle?.dispose();
}

export async function startRunDialog(templateId, templates, revision) {
  const instruments = call("list_instruments");
  templates ??= await call("list_templates");
  const template = templates.find(t => t.data.id === templateId) || templates[0];
  const rev = revision ?? template.data.revision;
  const profiles = await instruments;
  const inputs = runInputs(template.data, profiles);
  const sources = runSources(template.data, profiles);
  const hardware = sources.some(s => s.hardware);
  const roles = startRoles(template.data);
  const speeds = hardware ? [[1, "1x (real time)"]] : [[1, "1x (real time)"], [10, "10x"], [20, "20x"], [50, "50x"]];
  const dialog = openDialog(`
    <form>
      <h2>Start run</h2>
      <p>${esc(template.data.name)} · revision ${rev}</p>
      <div class="notice warn">${hardware ? "" : "No hardware is connected. "}This run reads: ${inputs.labels.map(esc).join("; ")}. Clock times are this computer's${hardware ? ", in real time" : ", at the chosen speed"}.</div>
      <label class="field">Session name <input name="name" value="${esc(template.data.name)} · ${esc(inputs.suffix)}"></label>
      <label class="field">Replay speed
        <select name="speed">${speeds.map(([v, label]) => `<option value="${v}"${v === (hardware ? 1 : 20) ? " selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="field">Start
        <select name="start">${START_MODES.map(([v, label]) => `<option value="${v}">${label}</option>`).join("")}</select></label>
      <p class="small muted" data-start-for="together">Every instrument starts when the run starts. Stop run stops them all.</p>
      <div class="inline" data-start-for="stagger">${roles.map(r => `<label class="field">${esc(r.label)}, after (s)
        <input type="number" min="0" step="any" name="delay:${esc(r.role)}" value="${r.delay}" style="width:90px"></label>`).join("")}</div>
      <div data-start-for="hand">${roles.map(r => `<label class="check"><input type="checkbox" name="hand:${esc(r.role)}">${esc(r.label)}: start it from the run page</label>`).join("")}
        <span class="small muted">Unticked instruments start when the run starts.</span></div>
      ${sources.map((s, i) => `<label class="field">${s.hardware ? "Spool file" : "Recording to replay"} for ${esc(s.label)} (role ${esc(s.role)})
        <input name="source${i}" placeholder="${esc(s.hint)}" title="${esc(s.path)}" data-browse="${s.browse}"><span class="small muted">Leave empty to use the profile's. Not saved to the profile or the template.</span></label>`).join("")}
      <p class="error-text"></p>
      <div class="actions"><button value="cancel">Cancel</button><button class="primary" value="ok">Check readiness and start</button></div>
    </form>`, async form => {
      const chosen = sourcesFrom(sources.map((s, i) => [s.role, form.get(`source${i}`)]));
      const starts = startsFrom(form.get("start"), roles, {
        delays: Object.fromEntries(roles.map(r => [r.role, form.get(`delay:${r.role}`)])),
        hand: Object.fromEntries(roles.map(r => [r.role, form.has(`hand:${r.role}`)])),
      });
      const manifest = await call("start_run", { template_id: template.data.id, revision: rev, speed: Number(form.get("speed")), name: form.get("name"), sources: chosen, starts });
      location.hash = `#/sessions/${manifest.id}`;
    });
  const mode = dialog.querySelector('[name="start"]');
  const showMode = () => dialog.querySelectorAll("[data-start-for]").forEach(el => (el.hidden = el.dataset.startFor !== mode.value));
  mode.onchange = showMode;
  showMode();
}
