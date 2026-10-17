import { call, esc, icon, inputBadge, pageHeader } from "./util.js";

export async function renderInstruments(page) {
  const instruments = await call("list_instruments");
  page.innerHTML = pageHeader([["Home", "#/"]], "Instruments", {
    sub: "A profile configures an existing adapter: file paths, ports, channel names, aliases. A new protocol or file format needs a new adapter class that implements the instrument contract.",
  }) + `<div class="page-body">
    <div class="table-wrap"><table>
      <thead><tr><th>Instrument</th><th>Channels and units</th><th>Input</th><th>Control</th><th></th></tr></thead>
      <tbody>${instruments.map(p => `
        <tr>
          <td><strong>${esc(p.label)}</strong><br><span class="small muted">${esc(p.model)}</span><br><code>${esc(p.id)}</code></td>
          <td class="small">${Object.entries(p.aliases || {}).map(([alias, col]) => `${esc(alias)} <span class="muted">(${esc(col)}, ${esc(p.columns.find(c => c.name === col)?.unit || "")})</span>`).join("<br>")
            || p.columns.filter(c => c.unit && !/^t_/.test(c.name)).slice(0, 4).map(c => `${esc(c.name)} <span class="muted">${esc(c.unit)}</span>`).join("<br>")}</td>
          <td>${inputBadge(p.input_kind)}<br><span class="small muted">${esc(p.capabilities.join(", "))}</span></td>
          <td class="small">${esc(p.control)}</td>
          <td><button class="quiet" data-inspect="${esc(p.id)}" aria-expanded="false">${icon("info")}Inspect</button></td>
        </tr>
        <tr class="detail-row" data-detail="${esc(p.id)}" hidden><td colspan="5">
          <dl class="kv">
            <dt>Adapter</dt><dd><code>${esc(p.adapter)}</code></dd>
            <dt>Settings</dt><dd><code>${esc(JSON.stringify(p.settings || {}))}</code></dd>
            ${p.simulate ? `<dt>Simulation</dt><dd>${esc(p.simulate.note)}</dd>` : ""}
            <dt>Clocks recorded</dt><dd>${p.clocks.map(c => `<code>${esc(c.column)}</code> (${esc(c.kind)}): ${esc(c.description)}`).join("<br>")}</dd>
          </dl>
          <details><summary>${p.columns.length} stored columns</summary>
            <table><thead><tr><th>Column</th><th>Type</th><th>Unit</th><th>Meaning</th></tr></thead><tbody>
            ${p.columns.map(c => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.type)}</td><td>${esc(c.unit)}</td><td>${esc(c.description)}</td></tr>`).join("")}
            </tbody></table></details>
        </td></tr>`).join("")}
      </tbody></table></div>
    <p class="small muted">Registering or testing a device is not part of this prototype: profiles are YAML files in <code>engine/instruments/</code>, and readiness is checked when a run starts.</p>
  </div>`;
  page.querySelectorAll("[data-inspect]").forEach(b => (b.onclick = () => {
    const row = page.querySelector(`[data-detail="${CSS.escape(b.dataset.inspect)}"]`);
    row.hidden = !row.hidden;
    b.setAttribute("aria-expanded", !row.hidden);
  }));
}
