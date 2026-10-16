import { renderSessions } from "./sessions.js";
import { renderTemplates, renderTemplate } from "./templates.js";
import { renderInstruments } from "./instruments.js";
import { renderSession } from "./session.js";
import { renderSettings } from "./settings.js";
import { renderCapture } from "./capture.js";
import { applyAppearance, esc, icon } from "./util.js";

const NAV = [
  ["sessions", "#/", "folder", "Sessions"],
  ["templates", "#/templates", "grid", "Experiment templates"],
  ["instruments", "#/instruments", "device", "Instruments"],
];

const routes = [
  [/^#?\/?$/, "sessions", renderSessions],
  [/^#\/templates$/, "templates", renderTemplates],
  [/^#\/templates\/([\w-]+)(?:\/r(\d+))?(?:\/(layout))?$/, "templates", renderTemplate],
  [/^#\/instruments$/, "instruments", renderInstruments],
  [/^#\/sessions\/([\w-]+)$/, "sessions", renderSession],
  [/^#\/sessions\/([\w-]+)\/capture$/, "sessions", renderCapture],
  [/^#\/settings$/, "settings", renderSettings],
];

function renderSidebar() {
  const link = ([key, href, ico, label]) => `<a href="${href}" data-nav="${key}" title="${esc(label)}">${icon(ico)}<span>${esc(label)}</span></a>`;
  document.getElementById("sidebar").innerHTML = `
    <a class="brand" href="#/" aria-label="Cousins Lab home"><img src="assets/cousins-logo.png" alt=""><span>Cousins Lab</span></a>
    ${NAV.map(link).join("")}
    <div class="nav-bottom">
      <p class="sidebar-note">Prototype. Inputs are simulated, replayed, or imported. No hardware is connected.</p>
      ${link(["settings", "#/settings", "gear", "Settings"])}
      <button class="collapse-toggle" type="button" aria-label="Collapse main navigation">${icon("left")}<span>Collapse</span></button>
    </div>`;
  document.querySelector(".collapse-toggle").onclick = () => {
    const collapsed = document.body.classList.toggle("nav-collapsed");
    localStorage.setItem("cousins-nav-collapsed", collapsed ? "1" : "");
  };
  document.body.classList.toggle("nav-collapsed", !!localStorage.getItem("cousins-nav-collapsed"));
}

let cleanup = null;

async function route() {
  cleanup?.();
  cleanup = null;
  const page = document.getElementById("page");
  const hash = location.hash || "#/";
  for (const [pattern, nav, render] of routes) {
    const match = hash.match(pattern);
    if (!match) continue;
    document.querySelectorAll("[data-nav]").forEach(a =>
      a.dataset.nav === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    page.innerHTML = '<p class="page-body muted">Loading…</p>';
    try {
      cleanup = (await render(page, ...match.slice(1))) || null;
    } catch (e) {
      page.innerHTML = `<div class="page-body"><div class="notice bad">${esc(e.message)}</div></div>`;
    }
    return;
  }
  page.innerHTML = '<div class="page-body"><div class="notice bad">Page not found.</div></div>';
}

renderSidebar();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyAppearance(); route(); });
window.addEventListener("hashchange", route);
route();
