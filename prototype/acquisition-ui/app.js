import { renderSessions } from "./sessions.js";
import { renderTemplates, renderTemplate } from "./templates.js";
import { renderInstruments } from "./instruments.js";
import { renderSession } from "./session.js";
import { esc } from "./util.js";

const routes = [
  [/^#?\/?$/, "sessions", renderSessions],
  [/^#\/templates$/, "templates", renderTemplates],
  [/^#\/templates\/([\w-]+)(?:\/r(\d+))?$/, "templates", renderTemplate],
  [/^#\/instruments$/, "instruments", renderInstruments],
  [/^#\/sessions\/([\w-]+)$/, "sessions", renderSession],
];

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
    page.innerHTML = '<p class="muted">Loading…</p>';
    try {
      cleanup = (await render(page, ...match.slice(1))) || null;
    } catch (e) {
      page.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`;
    }
    return;
  }
  page.innerHTML = '<div class="notice bad">Page not found.</div>';
}

window.addEventListener("hashchange", route);
route();
