import { APPEARANCE_KEY, applyAppearance, bindReveal, call, esc, icon, pageHeader, pathRow } from "./util.js";

const MODES = [["light", "Light"], ["dark", "Dark"], ["system", "System"]];

export function renderSettings(page) {
  const current = localStorage.getItem(APPEARANCE_KEY) || "system";
  page.innerHTML = pageHeader([["Home", "#/"]], "Settings") + `
    <div class="page-body">
      <section class="settings-section">
        <h2>Appearance</h2>
        <div class="appearance-options" role="radiogroup" aria-label="Appearance">${MODES.map(([mode, label]) => `
          <button class="appearance-option" role="radio" data-mode="${mode}" aria-checked="${mode === current}" aria-pressed="${mode === current}">
            <span class="preview"><i></i><i></i></span><span class="section-head">${esc(label)}${mode === current ? icon("check") : ""}</span></button>`).join("")}
        </div>
        <p class="small muted">Stored in this app only. System follows the operating system setting.</p>
      </section>
      <section class="settings-section">
        <h2>Engine</h2>
        <p class="small">The engine runs inside this app and owns instruments, timing, and storage. Sessions and template revisions are in its data folder.</p>
        <div class="small" id="engine-info"></div>
      </section>
    </div>`;
  const info = page.querySelector("#engine-info");
  call("engine_info").then(({ data_dir, version }) => {
    info.innerHTML = `${pathRow(data_dir)}<p class="muted">Engine version ${esc(version)}</p>`;
    bindReveal(info);
  }, e => (info.textContent = e.message));
  page.querySelectorAll("[data-mode]").forEach(b => (b.onclick = () => {
    localStorage.setItem(APPEARANCE_KEY, b.dataset.mode);
    applyAppearance(b.dataset.mode);
    renderSettings(page);
  }));
}
