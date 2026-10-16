export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

export const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const INPUT_LABELS = { hardware: "Hardware", simulated: "Simulated", replay: "Replay", import: "Imported" };
export const inputBadge = kind => `<span class="badge ${esc(kind)}">${esc(INPUT_LABELS[kind] || kind)}</span>`;
export const statusBadge = status => `<span class="badge status-${esc(status)}">${esc(String(status).replaceAll("_", " "))}</span>`;

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
