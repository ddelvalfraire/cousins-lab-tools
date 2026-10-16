import { APPEARANCE_KEY, applyAppearance, esc, icon, pageHeader } from "./util.js";

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
        <p class="small muted">Stored in this browser only. System follows the operating system setting.</p>
      </section>
      <section class="settings-section">
        <h2>Engine</h2>
        <p class="small">The engine serves this UI on 127.0.0.1 and owns instruments, timing, and storage. Sessions and template revisions are in its data folder.</p>
      </section>
    </div>`;
  page.querySelectorAll("[data-mode]").forEach(b => (b.onclick = () => {
    localStorage.setItem(APPEARANCE_KEY, b.dataset.mode);
    applyAppearance(b.dataset.mode);
    renderSettings(page);
  }));
}
