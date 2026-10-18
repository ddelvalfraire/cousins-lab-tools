async function invoke(command, args) {
  const tauri = globalThis.window?.__TAURI__;
  if (!tauri) throw new Error("The engine is not connected. Open this page in the Cousins Lab app.");
  try {
    return await tauri.core.invoke(command, args);
  } catch (e) {
    throw new Error(e?.message ?? String(e));
  }
}

/** Runs one command of the engine's command table; a rejection `{kind, message}` becomes `Error(message)`. */
export const call = (command, args = {}) => invoke("api", { command, args });
export const showInFolder = path => invoke("show_in_folder", { path });
export const pathRow = path =>
  `<div class="inline"><code>${esc(path)}</code><button class="quiet" data-reveal="${esc(path)}">${icon("folder")}Show in folder</button></div>`;
export const bindReveal = root =>
  root.querySelectorAll("[data-reveal]").forEach(b => (b.onclick = () => showInFolder(b.dataset.reveal).catch(e => toast(e.message))));

/** The last part of a path the engine sent, which uses \ on Windows and / elsewhere. */
export const fileName = path => String(path).split(/[\\/]/).pop();
export const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const INPUT_LABELS = { hardware: "Hardware", simulated: "Simulated", replay: "Replay", import: "Imported" };
export const inputBadge = kind => `<span class="badge ${esc(kind)}">${esc(INPUT_LABELS[kind] || kind)}</span>`;
const STATUS_TONES = {
  running: ["active", "chart"], starting: ["pending", "clock"], waiting: ["pending", "clock"], preparing: ["pending", "clock"],
  stopping: ["pending", "clock"], completed_with_failures: ["pending", "alert"], not_started: ["neutral", "stop"],
  completed: ["good", "check"], imported: ["good", "check"], ready: ["good", "check"], source_ended: ["good", "check"],
  failed: ["bad", "alert"], not_ready: ["bad", "alert"], interrupted: ["bad", "alert"], cancelled: ["bad", "stop"],
};
export const statusLabel = status => String(status).replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
export function statusBadge(status, label = statusLabel(status)) {
  const [tone, ico] = STATUS_TONES[status] || ["neutral", "info"];
  return `<span class="badge tone-${tone}">${icon(ico)}${esc(label)}</span>`;
}

export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 5000);
}

export const fmtTime = iso => (iso ? new Date(iso).toLocaleString([], { hour12: false }) : "");
export const fmtClock = iso =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false }) : "";
export const fmtSeconds = s => (s == null ? "" : `${Number(s).toFixed(s < 10 ? 3 : 1)} s`);
export const deltaSeconds = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 1000 : null);

export function hms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export function openDialog(html, onSubmit) {
  const dialog = document.getElementById("dialog");
  dialog.innerHTML = html;
  const form = dialog.querySelector("form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") return dialog.close();
    const error = form.querySelector(".error-text");
    try {
      error.textContent = "";
      await onSubmit(new FormData(form), form);
      dialog.close();
    } catch (e) {
      error.textContent = e.message;
    }
  });
  dialog.showModal();
  return dialog;
}

const ICONS = {
  home: "m3 10 9-7 9 7v10H3Z M9 20v-7h6v7", grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  device: "M6 3h12v18H6z M9 7h6 M9 11h6 M10 17h4", chart: "M3 3v18h18 M6 15l4-5 4 3 6-8", folder: "M3 6h7l2 3h9v11H3z",
  gear: "m9 3-.7 3-2 .9-2.7-.9-1.5 2.6 2 2.1v2.5l-2 2.1 1.5 2.6 2.7-.9 2 .9.7 3h3l.7-3 2-.9 2.7.9 1.5-2.6-2-2.1v-2.5l2-2.1-1.5-2.6-2.7.9-2-.9-.7-3z M14.5 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  left: "m14 6-6 6 6 6", right: "m10 6 6 6-6 6", down: "m6 9 6 6 6-6", up: "m6 15 6-6 6 6", plus: "M12 5v14 M5 12h14", close: "m6 6 12 12 M18 6 6 18",
  play: "m8 4 12 8-12 8z", pause: "M8 5v14 M16 5v14", stop: "M5 5h14v14H5z", check: "m5 12 4 4L19 6",
  alert: "m12 3 10 18H2z M12 9v4 M12 17h.01", clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5", save: "M3 3h15l3 3v15H3z M7 3v6h10V3 M7 21v-8h10v8",
  undo: "M8 4 3 9l5 5 M3 9h11a7 7 0 0 1 0 14", grip: "M8 5h.01 M16 5h.01 M8 12h.01 M16 12h.01 M8 19h.01 M16 19h.01",
  resize: "m13 20 7-7 M7 20 13 14", table: "M3 3h18v18H3z M3 9h18 M9 3v18 M3 15h18", hash: "M5 9h14 M4 15h14 M10 3 6 21 M18 3l-4 18",
  sliders: "M3 6h6 M13 6h8 M3 18h12 M19 18h2 M9 3v6 M15 15v6 M3 12h12 M19 12h2 M15 9v6", power: "M12 2v10 M6 5a9 9 0 1 0 12 0",
  file: "M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6", flag: "M5 21V4 M5 4h11l-2 4 2 4H5", refresh: "M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 14-2l1 2 M4 17l1 2a8 8 0 0 0 14-2",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7h.01", link: "m10 8 3-3a4 4 0 0 1 6 6l-3 3 M14 16l-3 3a4 4 0 0 1-6-6l3-3 M8 16l8-8",
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.grid}"/></svg>`;

/** crumbs: [[label, href], ...] leading to the current page, shown last without a link as `current` or the title. */
export function pageHeader(crumbs, title, { actions = "", sub = "", current = title } = {}) {
  const items = crumbs.map(([label, href]) => `<li><a href="${esc(href)}">${esc(label)}</a>${icon("right")}</li>`).join("");
  return `
    <header class="page-header">
      <div><nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items}<li aria-current="page">${esc(current)}</li></ol></nav>
        <h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
      <div class="actions">${actions}</div>
    </header>`;
}

export const APPEARANCE_KEY = "cousins-appearance";
export function applyAppearance(mode = localStorage.getItem(APPEARANCE_KEY) || "system") {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
