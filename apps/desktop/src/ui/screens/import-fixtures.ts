/** Fixture readers for the workspace's import dialogs. No Tauri calls; files are read in the browser only. */

import type {
  PresetFileCheck,
  PresetTile,
  PresetTileKind,
  RecordingFile,
  RecordingPresetOption,
} from '@/features/exchange';
import { type PresetSpec, presets } from '@/shared/testing/screen-fixtures';
import type { LayoutTile } from '@/shared/ui/PresetLayoutPreview';

export const recordingPresetOptions: RecordingPresetOption[] = presets.map(
  (preset) => ({
    id: preset.id,
    label: `${preset.name} · R${preset.revision}`,
  }),
);

/**
 * Reads a recording's header and last row: a CSV whose first column is elapsed seconds.
 * Anything else is listed as needing attention.
 */
export async function readRecordingFile(file: File): Promise<RecordingFile> {
  const base = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
  };
  const lines = (await file.text())
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const header = lines[0]?.split(',').map((cell) => cell.trim()) ?? [];
  if (!/^(elapsed|time)/i.test(header[0] ?? ''))
    return { ...base, status: 'error', problem: 'Time column is missing.' };
  if (lines.length < 2 || header.length < 2)
    return {
      ...base,
      status: 'error',
      problem: 'No numeric signals were found.',
    };
  const last = Number(lines[lines.length - 1].split(',')[0]);
  const channels = header.slice(1).map((column) => {
    const [name, unit = ''] = column.split('_');
    return { name: name.replace(/^mass/i, 'Mass '), unit };
  });
  return {
    ...base,
    status: 'ready',
    duration: Number.isFinite(last) ? last : undefined,
    channels,
  };
}

const tileKind: Record<LayoutTile['kind'], PresetTileKind> = {
  chart: 'line',
  inputs: 'input',
  readings: 'readout',
  table: 'table',
  controls: 'input',
};
/** Panel geometry on the 12-column preset grid, in percent. */
export function presetTiles(tiles: readonly LayoutTile[]): PresetTile[] {
  const rows = Math.max(1, ...tiles.map((tile) => tile.y + tile.h));
  return tiles.map((tile) => ({
    kind: tileKind[tile.kind],
    x: (tile.x / 12) * 100,
    y: (tile.y / rows) * 100,
    w: (tile.w / 12) * 100,
    h: (tile.h / rows) * 100,
  }));
}

/** Validates a definition exported from a preset page (`dvdash-screen-review`, schema 1). */
export async function checkPresetFile(file: File): Promise<PresetFileCheck> {
  let parsed: {
    kind?: unknown;
    schemaVersion?: unknown;
    preset?: Partial<PresetSpec>;
  };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { valid: false, problems: ['The file isn’t a preset definition.'] };
  }
  const problems = [
    parsed.kind !== 'dvdash-screen-review' &&
      'The file isn’t a DVDash preset definition.',
    parsed.schemaVersion !== 1 && 'This definition version isn’t supported.',
    !parsed.preset?.name && 'The preset has no name.',
    !Array.isArray(parsed.preset?.tiles) && 'The preset has no panel layout.',
  ].filter((problem): problem is string => !!problem);
  if (problems.length || !parsed.preset) return { valid: false, problems };
  const preset = parsed.preset as PresetSpec;
  const nameTaken = presets.some((existing) => existing.name === preset.name);
  return {
    valid: true,
    nameTaken,
    suggestedName: nameTaken ? `${preset.name} (imported)` : preset.name,
    definition: {
      name: preset.name,
      description: preset.summary ?? '',
      sourceRevision: preset.revision ?? 1,
      layout: presetTiles(preset.tiles),
      routines: [],
      roles: preset.signals?.length
        ? [{ name: 'Mass spectrometer', count: 1, signals: preset.signals }]
        : [],
    },
  };
}
