import { fileName } from "./util.js";

// Keyed by a template role's `import`. The default label names the capture `<role>-<label>`.
const IMPORT_KINDS = {
  ms_workbook: { title: "Mass spectrometer workbook", label: () => "workbook" },
  ambit_csv: {
    title: "Ambit recording",
    label: path => fileName(path).replace(/^Ambit raw data_sample_/, "").replace(/\.csv$/, "").replace("_", "-"),
  },
  legacy_frames: { title: "Legacy frame files (zip or folder)", label: path => fileName(path.replace(/[\\/]+$/, "")).replace(/\.zip$/i, "") },
};

/** One file slot per offered recording of each importing role, or one empty slot when none is offered. */
export function importSlots(template, recordings) {
  return Object.entries(template.roles ?? {}).flatMap(([role, spec]) => {
    const kind = IMPORT_KINDS[spec.import];
    if (!kind) return [];
    const files = recordings[spec.import] ?? [];
    const numbered = files.length > 1;
    return (files.length ? files : [""]).map((path, i) => ({
      role,
      title: `${kind.title}${numbered ? ` ${i + 1}` : ""} (role ${role})`,
      files,
      path,
      label: path ? kind.label(path) : "",
      labelFor: kind.label,
    }));
  });
}

/**
 * The import_files list from each slot's form values: a typed path wins over the chosen suggestion, and a slot with
 * neither is left out. `values(i)` gives slot i's {chosen, typed, label}.
 */
export function importFiles(slots, values) {
  return slots
    .map((slot, i) => {
      const { chosen, typed, label } = values(i);
      return { role: slot.role, path: typed?.trim() || chosen || "", label };
    })
    .filter(f => f.path);
}

/**
 * What a run of `template` reads, from its roles' instrument profiles: one label per role and the session name
 * suffix ("simulated", "replay", or both). The start dialog says this instead of naming instruments it assumes.
 */
export function runInputs(template, instruments) {
  const profiles = Object.fromEntries(instruments.map(p => [p.id, p]));
  const used = Object.values(template.roles ?? {}).map(r => profiles[r.instrument]).filter(Boolean);
  const kinds = [...new Set(used.map(p => p.input_kind))];
  return { labels: used.map(p => p.label), suffix: kinds.join(" and ") || "run" };
}

// The profile setting that names the file each adapter reads; start_run accepts a replacement per role.
const SOURCE_SETTING = { legacy_frames_replay: "path", ambit_replay: "recording", ezview_spool: "spool_path" };

/**
 * Enabled roles of `template` whose source a run may replace: replays and real spools, not simulators. Each comes
 * with the profile's own path, shown as the placeholder, and whether its profile reads hardware.
 */
export function runSources(template, instruments) {
  const profiles = Object.fromEntries(instruments.map(p => [p.id, p]));
  return Object.entries(template.roles ?? {}).flatMap(([role, spec]) => {
    const profile = profiles[spec.instrument];
    const key = SOURCE_SETTING[profile?.adapter];
    if (spec.enabled === false || !key || profile.simulate) return [];
    return [{ role, label: spec.label || role, path: profile.settings?.[key] ?? "", hardware: profile.input_kind === "hardware" }];
  });
}

/** The start_run `sources` object from typed paths; blank fields keep the profile's source. */
export function sourcesFrom(entries) {
  return Object.fromEntries(entries.map(([role, path]) => [role, String(path ?? "").trim()]).filter(([, path]) => path));
}
