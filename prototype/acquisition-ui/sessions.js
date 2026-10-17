import { call, esc, fileName, fmtTime, icon, inputBadge, openDialog, pageHeader, statusBadge } from "./util.js";
import { importSlots } from "./importing.js";
import { startRunDialog } from "./templates.js";

export async function renderSessions(page) {
  const [sessions, templates] = await Promise.all([call("list_sessions"), call("list_templates")]);
  page.innerHTML = pageHeader([["Home", "#/"]], "Sessions", {
    sub: "Each session is one experiment run or one set of imported recordings, stored as Parquet with its template revision.",
    actions: `<button id="import">${icon("download")}Import recordings</button><button class="primary" id="start">${icon("play")}Start run</button>`,
  }) + `
    <div class="page-body">
      <div class="table-wrap"><table>
        <thead><tr><th>Session</th><th>Template</th><th>Inputs</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>${sessions.map(s => `
          <tr>
            <td><a href="#/sessions/${esc(s.id)}">${esc(s.name)}</a>${s.live ? ' <span class="badge tone-active">Live</span>' : ""}</td>
            <td>${esc(s.template)}</td>
            <td>${s.inputs.map(inputBadge).join(" ")}</td>
            <td>${statusBadge(s.status)}</td>
            <td class="small muted">${esc(fmtTime(s.created_utc))}</td>
            <td><a class="button" href="#/sessions/${esc(s.id)}/capture">${icon("play")}${s.live ? "Open" : "Replay"}</a></td>
          </tr>`).join("") || '<tr><td colspan="6" class="muted">No sessions yet. Start a run or import recordings.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  page.querySelector("#start").onclick = () => startRunDialog(templates[0].data.id, templates);
  page.querySelector("#import").onclick = () => importDialog(templates);
}

async function importDialog(templates) {
  const recordings = await call("list_recordings");
  const options = (list, chosen) => list.map(p => `<option value="${esc(p)}"${p === chosen ? " selected" : ""}>${esc(fileName(p))}</option>`).join("");
  const chosen = id => templates.find(t => t.data.id === id).data;
  const dialog = openDialog(`
    <form>
      <h2>Import recordings</h2>
      <p class="muted small">Imported files keep only the clocks they contain. These files record elapsed time and a device counter, not clock time.</p>
      <label class="field">Template
        <select name="template">${templates.map(t => `<option value="${esc(t.data.id)}">${esc(t.data.name)} r${t.data.revision}</option>`).join("")}</select>
      </label>
      <label class="field">Session name <input name="name"></label>
      <div class="import-slots"></div>
      <p class="error-text"></p>
      <div class="actions"><button value="cancel">Cancel</button><button class="primary" value="ok">Import</button></div>
    </form>`, async form => {
      const template = chosen(form.get("template"));
      const files = importSlots(template, recordings)
        .map((slot, i) => ({ role: slot.role, path: form.get(`path${i}`), label: form.get(`label${i}`) }))
        .filter(f => f.path);
      const manifest = await call("import_files", { template_id: template.id, revision: template.revision, name: form.get("name"), files });
      location.hash = `#/sessions/${manifest.id}`;
    });
  const form = dialog.querySelector("form");
  const showSlots = () => {
    const template = chosen(form.elements.template.value);
    form.elements.name.value = `${template.name} (recorded)`;
    form.querySelector(".import-slots").innerHTML = importSlots(template, recordings).map((slot, i) => `
      <div class="inline">
        <label class="field" style="flex:1">${esc(slot.title)}
          <select name="path${i}"><option value="">Not included</option>${options(slot.files, slot.path)}</select></label>
        <label class="field">Label <input name="label${i}" value="${esc(slot.label)}"></label>
      </div>`).join("");
  };
  form.elements.template.onchange = showSlots;
  showSlots();
}
