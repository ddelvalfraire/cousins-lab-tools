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
