import { call, esc, fileName, fmtTime, icon, inputBadge, openDialog, pageHeader, statusBadge } from "./util.js";
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

const plantLabel = path => fileName(path).replace(/^Ambit raw data_sample_/, "").replace(/\.csv$/, "").replace("_", "-");

async function importDialog(templates) {
  const recordings = await call("list_recordings");
  const options = list => list.map(p => `<option value="${esc(p)}">${esc(fileName(p))}</option>`).join("");
  const ambit = recordings.ambit_csv;
  openDialog(`
    <form>
      <h2>Import recordings</h2>
      <p class="muted small">Imported files keep only the clocks they contain. These files record elapsed time and a device counter, not clock time.</p>
      <label class="field">Template
        <select name="template">${templates.map(t => `<option value="${esc(t.data.id)}">${esc(t.data.name)} r${t.data.revision}</option>`).join("")}</select>
      </label>
      <label class="field">Session name <input name="name" value="Sample 150 · plants 1 and 2 (recorded)"></label>
      <label class="field">Mass spectrometer workbook (role ms)
        <select name="ms">${options(recordings.ms_workbook)}</select></label>
      ${ambit.map((p, i) => `
        <div class="inline">
          <label class="field" style="flex:1">Ambit recording ${i + 1} (role light)
            <select name="light${i}"><option value="">Not included</option>${options(ambit).replace(`value="${esc(p)}"`, `value="${esc(p)}" selected`)}</select></label>
          <label class="field">Label <input name="label${i}" value="${esc(plantLabel(p))}"></label>
        </div>`).join("")}
      <p class="error-text"></p>
      <div class="actions"><button value="cancel">Cancel</button><button class="primary" value="ok">Import</button></div>
    </form>`, async form => {
      const files = [{ role: "ms", path: form.get("ms"), label: "workbook" }];
      ambit.forEach((_, i) => form.get(`light${i}`) && files.push({ role: "light", path: form.get(`light${i}`), label: form.get(`label${i}`) }));
      const template = templates.find(t => t.data.id === form.get("template")).data;
      const manifest = await call("import_files", { template_id: template.id, revision: template.revision, name: form.get("name"), files });
      location.hash = `#/sessions/${manifest.id}`;
    });
}
