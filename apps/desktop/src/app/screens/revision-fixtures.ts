/** Saved revisions and read-only layout previews for the preset and revision history pages. */

import type {
  PresetRevision,
  RevisionChange,
  SavedChart,
  SavedReadout,
} from '@/features/exchange';
import {
  presetRevisions,
  revisionChanges,
  savedPreview,
} from '@/features/exchange/fixtures';
import { catalogPresets } from './catalog-fixtures';
import type { PresetSpec } from './screen-fixtures';

/** A panel as the preset sidebar lists it. */
export interface PresetPanelSummary {
  name: string;
  kind: string;
  unit: string;
  signal: boolean;
}

const KIND: Record<string, string> = {
  line: 'Line chart',
  multi: 'Multi-series chart',
  scatter: 'Scatter plot',
  readout: 'Readout',
  input: 'Input',
  table: 'Table',
  chart: 'Chart',
  inputs: 'Settings',
  readings: 'Readings',
  controls: 'Recording controls',
};
const NOTES: Record<number, string> = {
  1: 'Initial layout',
  2: 'Updated signal bindings',
};
const DAY = 86_400_000;

export function presetPanels(preset: PresetSpec): PresetPanelSummary[] {
  const catalog = catalogPresets.find((p) => p.id === preset.id);
  if (catalog)
    return catalog.panels.map((p) => ({
      name: p.name,
      kind: KIND[p.kind],
      unit: p.unit,
      signal: ['line', 'multi', 'scatter'].includes(p.kind),
    }));
  return preset.tiles.map((t) => ({
    name: t.label,
    kind: KIND[t.kind],
    unit: '',
    signal: t.kind === 'chart',
  }));
}

/** Newest first. CO₂ & O₂ analysis uses the revisions of the approved mockups. */
export function presetRevisionList(preset: PresetSpec): PresetRevision[] {
  if (preset.id === 'gas') return presetRevisions;
  const latest = new Date(
      catalogPresets.find((p) => p.id === preset.id)?.updated ??
        '2026-10-28T09:15:00',
    ).getTime(),
    panels = presetPanels(preset).length;
  return Array.from({ length: preset.revision }, (_, i) => {
    const number = preset.revision - i;
    const savedAt = new Date(latest - i * DAY);
    const local = `${savedAt.getFullYear()}-${String(savedAt.getMonth() + 1).padStart(2, '0')}-${String(savedAt.getDate()).padStart(2, '0')}T${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}:00`;
    return {
      number,
      note: NOTES[number] ?? 'Added interval readouts',
      savedAt: local,
      panels,
    };
  });
}

export const presetChanges = (
  preset: PresetSpec,
  revision: number,
): RevisionChange[] =>
  preset.id === 'gas' ? (revisionChanges[revision] ?? []) : [];

const wave = (mid: number, amp: number, phase: number) =>
  Array.from(
    { length: 61 },
    (_, i) =>
      mid +
      amp * Math.sin(i * 0.25 + phase) +
      amp * 0.16 * Math.cos(i * 0.61 + phase),
  );
/** Illustrative layout of a revision: up to two charts, then the readouts and inputs. */
export function presetPreview(
  preset: PresetSpec,
  revision: number,
): { charts: SavedChart[]; readouts: SavedReadout[] } {
  if (preset.id === 'gas') return savedPreview(Math.min(revision, 3));
  const panels = presetPanels(preset);
  const charts: SavedChart[] = panels
    .filter((p) => p.signal)
    .slice(0, 2)
    .map((p, i) => {
      const points = wave(2 + i, 0.2, i);
      return {
        title: p.name,
        value: points[60].toFixed(2),
        unit: p.unit || 'mV',
        min: 1.6 + i,
        max: 2.4 + i,
        points,
      };
    });
  const readouts: SavedReadout[] = panels
    .filter(
      (p) => !p.signal && p.kind !== 'Table' && p.kind !== 'Recording controls',
    )
    .slice(0, 3)
    .map((p) => ({
      title: p.name,
      value: p.kind === 'Input' || p.kind === 'Settings' ? '10' : '—',
      unit: p.unit,
      input: p.kind === 'Input' || p.kind === 'Settings',
    }));
  return { charts, readouts };
}
