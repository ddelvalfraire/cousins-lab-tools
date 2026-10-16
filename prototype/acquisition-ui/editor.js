// Layout editor on the template page. Edits a copy of the revision's layout; saving posts a new revision.

import { api, esc, icon } from "./util.js";
import { CATALOG, find, placeBelow, settle, SIZES, uniqueId } from "./layout.js";
import { componentTitle } from "./components.js";

const SECTIONS = ["Visualize", "Configure", "Operate", "Arrange"];
const KIND_ICON = Object.fromEntries(CATALOG.map(c => [c.kind, c.icon]));

function binding(c, template) {
  const d = template.data.derived?.[c.value];
  return {
    chart: () => (template.data.charts.find(ch => ch.id === c.chart)?.series || []).map(s => `${s.role}.${s.value}`).join(", "),
    metric: () => (d ? `${d.role}.${c.value} (${d.unit})` : c.value),
    controls: () => (c.role ? `Role ${c.role}` : "Every role"),
    captures: () => (c.role ? `Role ${c.role}` : "Every role"),
    inputs: () => (c.parameters?.length ? c.parameters.join(", ") : "Every parameter"),
    group: () => `${c.components.length} components`,
  }[c.kind]?.() ?? "";
}

function editGrid(items, ctx) {
  const rows = Math.max(4, ...items.map(c => c.y + c.h));
  return `<div class="bento-grid editable" data-list="${esc(ctx.listId)}" style="--rows:${rows}">${items.map(c => `
    <section class="bento-tile kind-${esc(c.kind)} ${ctx.selected === c.id ? "selected" : ""} ${ctx.hidden[c.id] ? "is-hidden" : ""}" tabindex="0"
      data-component="${esc(c.id)}" style="grid-column:${c.x + 1} / span ${c.w};grid-row:${c.y + 1} / span ${c.h}"
      aria-label="${esc(componentTitle(c, ctx.template))}, ${c.w} by ${c.h} at column ${c.x + 1}, row ${c.y + 1}">
      <header class="tile-header"><div class="tile-title"><button class="drag-handle quiet icon-only" data-drag="${esc(c.id)}" aria-label="Move">${icon("grip")}</button>
        <h3>${esc(componentTitle(c, ctx.template))}</h3></div><span class="source-tag">${icon(KIND_ICON[c.kind])}</span></header>
      ${c.kind === "group" ? editGrid(c.components, { ...ctx, listId: c.id })
        : `<p class="small muted">${esc(binding(c, ctx.template))}</p>`}
      ${ctx.hidden[c.id] ? `<p class="small hidden-note">${icon("info")}Hidden in this revision: ${esc(ctx.hidden[c.id])}</p>` : ""}
      <span class="tile-size small muted">${c.w} × ${c.h}</span>
      <button class="resize-handle quiet icon-only" data-resize="${esc(c.id)}" aria-label="Resize">${icon("resize")}</button>
    </section>`).join("")}${items.length ? "" : '<div class="grid-empty">Add a component from the catalog.</div>'}</div>`;
}

function inspector(c, template) {
  const d = template.data;
  const select = (key, options, value) => `<select data-field="${key}">${options.map(([v, label]) => `<option value="${esc(v)}" ${v === (value ?? "") ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
  const field = (label, control) => `<label class="field">${label}${control}</label>`;
  const roles = [["", "Every role"], ...Object.entries(d.roles).map(([k, r]) => [k, `${k}: ${r.label}`])];
  return `
    <div class="section-head"><div><span class="small muted">${esc(CATALOG.find(x => x.kind === c.kind).name)}</span><h3>${esc(componentTitle(c, template))}</h3></div>
      <button class="quiet icon-only" data-deselect aria-label="Close">${icon("close")}</button></div>
    ${field("Title", `<input data-field="title" value="${esc(c.title || "")}" placeholder="${esc(componentTitle({ ...c, title: "" }, template))}">`)}
    ${c.kind === "chart" ? field("Chart", select("chart", d.charts.map(ch => [ch.id, ch.title]), c.chart)) : ""}
    ${c.kind === "metric" ? field("Derived value", select("value", Object.entries(d.derived).map(([k, v]) => [k, `${v.label} (${v.role}, ${v.unit})`]), c.value)) : ""}
    ${["controls", "captures"].includes(c.kind) ? field("Role", select("role", roles, c.role)) : ""}
    ${c.kind === "inputs" ? `<fieldset class="field"><legend>Parameters (none ticked shows all)</legend>${Object.keys(d.parameters || {}).map(k =>
      `<label class="check"><input type="checkbox" data-param="${esc(k)}" ${c.parameters?.includes(k) ? "checked" : ""}>${esc(k)}</label>`).join("")}</fieldset>` : ""}
    <div class="inspector-geometry">${["x", "y", "w", "h"].map(k => field(k.toUpperCase(), `<input type="number" min="${k === "w" || k === "h" ? 1 : 0}" data-field="${k}" value="${c[k]}">`)).join("")}</div>
    <p class="small muted">Columns 0 to 11; width and height in grid cells. Arrow keys move the selected component, Shift+arrows resize it.</p>
    <button class="danger" data-remove>Remove component</button>`;
}

function catalog(filter) {
  const entries = CATALOG.filter(c => !filter || `${c.name} ${c.description}`.toLowerCase().includes(filter.toLowerCase()));
  return SECTIONS.map(section => {
    const items = entries.filter(c => c.section === section);
    return items.length ? `<div class="catalog-section"><h4>${section}</h4><div class="catalog-grid">${items.map(c => `
      <button class="catalog-item quiet" data-kind="${c.kind}" ${c.disabled ? "disabled" : ""}>${icon(c.icon)}<strong>${esc(c.name)}</strong><span>${esc(c.description)}</span>
        ${c.disabled ? "" : `<span class="small muted">${SIZES[c.kind].join(" × ")}</span>`}</button>`).join("")}</div></div>` : "";
  }).join("") || '<p class="small muted">No component matches.</p>';
}

function defaults(kind, layout, view, template) {
  const used = key => new Set([...view.components].map(c => c[key]));
  const pick = (all, key) => all.find(v => !used(key).has(v)) ?? all[0];
  return {
    chart: { chart: pick(template.data.charts.map(c => c.id), "chart") },
    metric: { value: pick(Object.keys(template.data.derived || {}), "value") },
    group: { components: [] },
  }[kind] || {};
}

/** draft is the template page's unsaved copy of the revision; the editor edits its layout, and saving posts all of it. */
export function mountEditor(el, template, { draft, onSaved }) {
  const { columns, ...initial } = structuredClone(template.layout);
  const layout = (draft.layout = initial);
  const latest = Math.max(...template.revisions);
  const state = { view: layout.views[0].id, selected: null, dirty: false, catalogOpen: false, filter: "", error: "" };
  const currentView = () => layout.views.find(v => v.id === state.view);

  const render = () => {
    const view = currentView();
    const selected = state.selected && find(layout, state.selected)?.component;
    el.innerHTML = `
      <div class="editor-toolbar">
        <div class="view-tabs" role="tablist">${layout.views.map(v => `<button role="tab" data-view="${esc(v.id)}" aria-selected="${v.id === state.view}">${esc(v.name)}</button>`).join("")}
          <button class="quiet icon-only" data-add-view aria-label="Add view" title="Add view">${icon("plus")}</button></div>
        <div class="actions">
          <button class="quiet" data-rename-view>Rename view</button>
          <div class="catalog-wrap"><button data-catalog aria-expanded="${state.catalogOpen}">${icon("plus")}Add component</button>
            ${state.catalogOpen ? `<div class="catalog" role="dialog" aria-label="Component catalog"><input type="search" data-filter placeholder="Find a component" value="${esc(state.filter)}">${catalog(state.filter)}</div>` : ""}</div>
          <button class="primary" data-save ${state.dirty ? "" : "disabled"}>${icon("save")}Save as revision ${latest + 1}</button>
        </div>
      </div>
      ${state.error ? `<div class="notice bad">${icon("alert")}<div>${esc(state.error)}</div></div>` : ""}
      <p class="small muted">${state.dirty ? "Unsaved layout changes. Saving creates a new revision with them and any unsaved Setup changes; sessions keep the layout they ran with." : `Layout of revision ${template.data.revision}. Drag the handle to move, the corner to resize.`}</p>
      <div class="editor-workspace ${selected ? "has-inspector" : ""}">
        <div class="editor-canvas">${editGrid(view.components, { template, hidden: template.hidden_components, selected: state.selected, listId: view.id })}</div>
        ${selected ? `<aside class="inspector">${inspector(selected, template)}</aside>` : ""}
      </div>`;
    if (state.catalogOpen) el.querySelector("[data-filter]")?.focus();
  };

  const changed = id => {
    const hit = find(layout, id);
    if (hit) settle(hit.list, id);
    state.dirty = true;
    state.error = "";
    render();
    el.querySelector(`[data-component="${CSS.escape(id)}"]`)?.focus();
  };

  const drag = (event, id, mode) => {
    const { component } = find(layout, id);
    const gridEl = event.target.closest(".bento-grid");
    const rect = gridEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(gridEl).columnGap) || 16;
    const colW = (rect.width - 11 * gap) / 12 + gap;
    const rowH = parseFloat(getComputedStyle(gridEl).gridAutoRows.match(/[\d.]+px/)[0]) + gap;
    const start = { x: event.clientX, y: event.clientY, c: { ...component } };
    const tile = event.target.closest(".bento-tile");
    const move = e => {
      const dx = Math.round((e.clientX - start.x) / colW), dy = Math.round((e.clientY - start.y) / rowH);
      if (mode === "move") Object.assign(component, { x: start.c.x + dx, y: Math.max(0, start.c.y + dy) });
      else Object.assign(component, { w: Math.max(1, start.c.w + dx), h: Math.max(1, start.c.h + dy) });
      tile.style.gridColumn = `${Math.max(0, Math.min(11, component.x)) + 1} / span ${Math.min(12, component.w)}`;
      tile.style.gridRow = `${component.y + 1} / span ${component.h}`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      changed(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };

  el.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-drag], [data-resize]");
    if (!handle) return;
    state.selected = handle.dataset.drag || handle.dataset.resize;
    drag(event, state.selected, handle.dataset.drag ? "move" : "resize");
  });

  el.addEventListener("click", event => {
    const t = event.target;
    const viewTab = t.closest("[data-view]");
    if (viewTab) return void ((state.view = viewTab.dataset.view), (state.selected = null), render());
    if (t.closest("[data-catalog]")) return void ((state.catalogOpen = !state.catalogOpen), render());
    const kind = t.closest("[data-kind]")?.dataset.kind;
    if (kind) {
      const view = currentView();
      const group = state.selected && find(layout, state.selected)?.component;
      const list = group?.kind === "group" ? group.components : view.components;
      const added = placeBelow(list, { id: uniqueId(layout, kind), kind, ...defaults(kind, layout, view, template) });
      Object.assign(state, { catalogOpen: false, filter: "", selected: added.id });
      return changed(added.id);
    }
    if (t.closest("[data-add-view]")) {
      const name = prompt("Name of the new view");
      if (!name) return;
      const id = uniqueId(layout, "view");
      layout.views.push({ id, name, components: [] });
      Object.assign(state, { view: id, selected: null, dirty: true });
      return render();
    }
    if (t.closest("[data-rename-view]")) {
      const name = prompt("Rename view", currentView().name);
      if (!name) return;
      currentView().name = name;
      state.dirty = true;
      return render();
    }
    if (t.closest("[data-deselect]")) return void ((state.selected = null), render());
    if (t.closest("[data-remove]")) {
      const { list } = find(layout, state.selected);
      list.splice(list.findIndex(c => c.id === state.selected), 1);
      Object.assign(state, { selected: null, dirty: true });
      return render();
    }
    if (t.closest("[data-save]")) return save();
    const tile = t.closest("[data-component]");
    if (tile && !t.closest(".inspector")) {
      state.selected = tile.dataset.component;
      render();
      el.querySelector(`[data-component="${CSS.escape(state.selected)}"]`)?.focus();
    }
  });

  el.addEventListener("input", event => {
    if (event.target.matches("[data-filter]")) {
      state.filter = event.target.value;
      const pos = event.target.selectionStart;
      render();
      el.querySelector("[data-filter]").setSelectionRange(pos, pos);
    }
  });

  el.addEventListener("change", event => {
    const t = event.target;
    const c = state.selected && find(layout, state.selected)?.component;
    if (!c || !t.closest(".inspector")) return;
    if (t.dataset.param) {
      c.parameters = [...el.querySelectorAll("[data-param]:checked")].map(i => i.dataset.param);
      if (!c.parameters.length) delete c.parameters;
    } else if (["x", "y", "w", "h"].includes(t.dataset.field)) {
      c[t.dataset.field] = Number(t.value);
    } else if (t.value === "" && ["title", "role"].includes(t.dataset.field)) {
      delete c[t.dataset.field];
    } else {
      c[t.dataset.field] = t.value;
    }
    changed(c.id);
  });

  el.addEventListener("keydown", event => {
    const tile = event.target.closest?.("[data-component]");
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!tile || !step || event.target !== tile) return;
    const { component } = find(layout, tile.dataset.component);
    if (event.shiftKey) Object.assign(component, { w: Math.max(1, component.w + step[0]), h: Math.max(1, component.h + step[1]) });
    else Object.assign(component, { x: component.x + step[0], y: Math.max(0, component.y + step[1]) });
    state.selected = component.id;
    event.preventDefault();
    changed(component.id);
  });

  const save = async () => {
    try {
      const saved = await api(`/api/templates/${template.data.id}/revisions`, { method: "POST", body: { data: draft } });
      onSaved(saved);
    } catch (e) {
      state.error = e.message;
      render();
    }
  };

  render();
}
