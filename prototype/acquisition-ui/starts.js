// How each instrument of a run starts: the Start run dialog's choice, and what the run page shows until it starts.

export const START_MODES = [["together", "Together"], ["stagger", "Stagger"], ["hand", "By hand"]];

/** Enabled roles of `template` with their label and the template's start delay, which Stagger starts from. */
export function startRoles(template) {
  return Object.entries(template.roles ?? {}).filter(([, r]) => r.enabled !== false)
    .map(([role, r]) => ({ role, label: r.label || role, delay: r.start_delay_s ?? 0 }));
}

/**
 * The start_run `starts` map for the dialog's choice. Together starts every role at Start run, Stagger each after its
 * typed delay in seconds, and By hand leaves each ticked role to its Start button on the run page and starts the rest
 * at once. Throws with the reason when a delay is not a number of seconds, 0 or more.
 */
export function startsFrom(mode, roles, { delays = {}, hand = {} } = {}) {
  return Object.fromEntries(roles.map(({ role, label }) => {
    if (mode === "hand" && hand[role]) return [role, { manual: true }];
    if (mode !== "stagger") return [role, { delay_s: 0 }];
    const text = String(delays[role] ?? "").trim();
    const delay = Number(text);
    if (!text || !Number.isFinite(delay) || delay < 0) throw new Error(`Enter a delay for ${label} in seconds, 0 or more.`);
    return [role, { delay_s: delay }];
  }));
}

