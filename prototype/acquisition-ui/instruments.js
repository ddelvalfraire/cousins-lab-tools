import { api, esc, inputBadge, pageHeader } from "./util.js";

export async function renderInstruments(page) {
  const instruments = await api("/api/instruments");
  page.innerHTML = pageHeader([["Home", "#/"]], "Instruments", {
    sub: "A profile configures an existing adapter: file paths, ports, channel names, aliases. A new protocol or file format needs a new adapter class that implements the instrument contract.",
  }) + `<div class="page-body">
    ${instruments.map(p => `
      <section class="card">
        <div class="card-head"><h2>${esc(p.label)}</h2><span>${inputBadge(p.input_kind)} <code>${esc(p.id)}</code></span></div>
        <dl class="kv">
          <dt>Adapter</dt><dd><code>${esc(p.adapter)}</code></dd>
          <dt>Model</dt><dd>${esc(p.model)}</dd>
          <dt>Capabilities</dt><dd>${p.capabilities.map(esc).join(", ")}</dd>
          <dt>Device control</dt><dd>${esc(p.control)}</dd>
          <dt>Settings</dt><dd><code>${esc(JSON.stringify(p.settings || {}))}</code></dd>
          ${p.aliases ? `<dt>Aliases</dt><dd>${Object.entries(p.aliases).map(([a, c]) => `${esc(a)} = ${esc(c)}`).join(", ")}</dd>` : ""}
          ${p.simulate ? `<dt>Simulation</dt><dd>${esc(p.simulate.note)}</dd>` : ""}
        </dl>
        <h3>Clocks recorded</h3>
        <ul class="small">${p.clocks.map(c => `<li><code>${esc(c.column)}</code> (${esc(c.kind)}): ${esc(c.description)}</li>`).join("")}</ul>
        <details><summary>${p.columns.length} stored columns</summary>
          <div class="table-wrap"><table><thead><tr><th>Column</th><th>Type</th><th>Unit</th><th>Meaning</th></tr></thead><tbody>
          ${p.columns.map(c => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.type)}</td><td>${esc(c.unit)}</td><td>${esc(c.description)}</td></tr>`).join("")}
          </tbody></table></div></details>
      </section>`).join("")}</div>`;
}
