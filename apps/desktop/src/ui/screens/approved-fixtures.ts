// Adapters and sample data that feed the approved components from the screen fixtures.
// Synthetic data for screen review; nothing here reads files or contacts an instrument.

import type {
  ExperimentSummary as ListExperiment,
  SetupPreset,
  SetupRoutine,
  SetupSource,
} from '@/features/experiments';
import type {
  EditablePreset,
  PanelSpan,
  PresetPanel,
} from '@/features/presets';
import type { RoutineDefinition } from '@/features/routines';
import type { AppSettings, BuildInfo } from '@/features/settings';
import {
  type ExperimentSummary,
  type PresetSpec,
  presets,
} from '@/shared/testing/screen-fixtures';
import type {
  CurrentAcquisition,
  RecentExperiment,
} from '../components/SideNavigation';

const instrumentFor = (row: ExperimentSummary) =>
  row.setup?.source && !row.setup.source.startsWith('sample')
    ? row.setup.source
    : 'MS-01';

export function toListExperiment(row: ExperimentSummary): ListExperiment {
  const preset = presets.find((p) => p.id === row.presetId);
  const live = row.input !== 'Recorded file';
  return {
    id: row.id,
    name: row.name,
    kind: live ? 'instrument' : 'recording',
    source: live ? instrumentFor(row) : `${row.id}.csv`,
    preset: preset?.name ?? row.presetId,
    revision: preset?.revision ?? 1,
    samples: row.samples,
    status:
      row.status === 'Running'
        ? 'running'
        : row.status === 'Interrupted'
          ? 'interrupted'
          : 'recorded',
    startedAt: row.date.replace(/Z$/, ''),
  };
}

/** Sidebar recents: the two most recent experiments. */
export function toRecents(
  rows: readonly ExperimentSummary[],
): RecentExperiment[] {
  return [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2)
    .map((row, index) => {
      const [subtitle, title] = row.name.includes(' · ')
        ? row.name.split(' · ')
        : ['', row.name];
      return {
        id: row.id,
        title,
        subtitle,
        state:
          row.status === 'Running'
            ? 'live'
            : index === 0
              ? 'recorded'
              : 'opened',
        tone: row.presetId === 'kinetics' ? 'violet' : 'accent',
      };
    });
}

/** Sidebar acquisition card: the running experiment, if any. */
/** Recent values for the sidebar sparkline (same shape as the main-sidebar review). */
export const acquisitionTrace = [
  10, 11, 12.6, 14.7, 16.9, 18.5, 18.9, 18, 16.1, 13.9, 11.9, 10.7, 10.9, 12.6,
  15.5, 18.2, 20, 21, 20.9, 19.7, 17.5, 14.5, 12.2, 11.5, 13.6, 17,
];

export function toAcquisition(
  rows: readonly ExperimentSummary[],
): CurrentAcquisition | null {
  const running = rows.find((row) => row.status === 'Running');
  if (!running) return null;
  return {
    experimentId: running.id,
    title: running.name.split(' · ').pop() ?? running.name,
    source: 'Simulator',
    samples: running.samples,
    elapsed: '00:43',
    trace: acquisitionTrace,
  };
}

export const setupPresets: SetupPreset[] = presets.map((p) => ({
  id: p.id,
  name: p.name,
  revisions: Array.from({ length: p.revision }, (_, i) => p.revision - i),
  signals: p.signals.map((s) => s.replace('Mass ', '')),
}));
export const setupSources: SetupSource[] = [
  {
    id: 'sample-024',
    kind: 'recording',
    name: 'Sample 024',
    file: 'sample-024.csv',
    signals: ['32', '44', '45', '47', '49'],
    samples: 121,
    duration: 360,
  },
  {
    id: 'sample-023',
    kind: 'recording',
    name: 'Reference 023',
    file: 'reference-023.csv',
    signals: ['32', '44', '45', '47', '49'],
    samples: 121,
    duration: 360,
  },
  {
    id: 'MS-01',
    kind: 'instrument',
    name: 'MS-01',
    detail: 'Simulated mass spectrometer',
    signals: ['32', '44', '45', '47', '49'],
    connected: true,
  },
];
export const setupRoutines: SetupRoutine[] = [
  {
    id: 'measure',
    name: 'Timed measurements',
    revision: 2,
    steps: 3,
    fields: [
      {
        id: 'count',
        label: 'Measurement count',
        value: 100,
        min: 1,
        integer: true,
      },
      {
        id: 'interval',
        label: 'Sample interval',
        value: 0.5,
        unit: 's',
        min: 0.001,
      },
      { id: 'delay', label: 'Start delay', value: 0, unit: 's', min: 0 },
    ],
  },
  {
    id: 'reference',
    name: 'Reference sequence',
    revision: 1,
    steps: 3,
    fields: [
      {
        id: 'referenceDuration',
        label: 'Reference duration',
        value: 10,
        unit: 's',
        min: 0.001,
      },
      { id: 'wait', label: 'Wait', value: 5, unit: 's', min: 0 },
      {
        id: 'sampleDuration',
        label: 'Sample duration',
        value: 30,
        unit: 's',
        min: 0.001,
      },
    ],
  },
];

export const defaultSettings: AppSettings = {
  theme: 'system',
  textSize: 'default',
  decimal: 'system',
  folder: '~/Documents/DVDash/Recordings',
  delimiter: 'comma',
};
/** Real release from this repository. */
export const buildInfo: BuildInfo = {
  version: '0.1.0-rc.2',
  commit: 'fdba48e6d504efa8b66f04b0dd8ea7f892fd4a6b',
  tag: 'desktop-v0.1.0-rc.2',
  dirty: false,
  built: '2026-11-02 02:54 UTC',
  platform: 'macOS 15.1 (arm64)',
  runtime: 'Tauri 2.12.5 · WebKit 620.1',
  settingsFile: '~/Library/Application Support/DVDash/settings.json',
  logs: '~/Library/Logs/DVDash',
};

const SPANS: PanelSpan[] = [3, 4, 6, 8, 12];
const nearestSpan = (w: number): PanelSpan =>
  SPANS.reduce(
    (best, s) => (Math.abs(s - w) < Math.abs(best - w) ? s : best),
    6,
  );

/** Every tile becomes an editor panel: charts, readouts, tables, settings (input tiles) and recording controls. */
export function toEditablePreset(preset: PresetSpec): EditablePreset {
  const kinds = {
    chart: 'line',
    readings: 'readout',
    table: 'table',
    inputs: 'inputs',
    controls: 'controls',
  } as const;
  const minimum: Record<PresetPanel['kind'], PanelSpan> = {
    line: 4,
    scatter: 4,
    table: 4,
    readout: 3,
    inputs: 3,
    controls: 4,
  };
  // Sample settings per input tile, as SETTING_FIELDS keys.
  const fields: Record<string, string[]> = {
    'cal-inputs': ['zero', 'span', 'standard'],
    'o2-inputs': ['zero', 'temperature', 'flow'],
    'assay-inputs': ['zero', 'span', 'noise'],
    'buffer-inputs': ['temperature', 'flow'],
  };
  const panels: PresetPanel[] = preset.tiles.map((t) => {
    const kind = kinds[t.kind],
      signal = kind !== 'inputs' && kind !== 'controls';
    return {
      id: t.id,
      title: t.label,
      kind,
      span: Math.max(minimum[kind], nearestSpan(t.w)) as PanelSpan,
      signals: signal ? preset.signals.slice(0, 2) : [],
      x: null,
      ...(kind === 'inputs' && { fields: fields[t.id] ?? ['zero', 'span'] }),
      ...(kind === 'controls' && {
        controls: ['start', 'instrument', 'samples', 'elapsed'],
      }),
    };
  });
  return { name: preset.name, revision: preset.revision, panels };
}

export const routineDefinitions: Record<string, RoutineDefinition> = {
  reference: {
    parameters: [
      { id: 'q1', name: 'Reference', seconds: 10 },
      { id: 'q2', name: 'Wait', seconds: 5 },
      { id: 'q3', name: 'Sample', seconds: 30 },
    ],
    steps: [
      {
        id: 's1',
        kind: 'capture',
        name: 'Reference',
        duration: { param: 'q1' },
      },
      { id: 's2', kind: 'wait', name: '', duration: { param: 'q2' } },
      { id: 's3', kind: 'capture', name: 'Sample', duration: { param: 'q3' } },
    ],
  },
  measure: {
    parameters: [
      { id: 'q1', name: 'Start delay', seconds: 2 },
      { id: 'q2', name: 'Interval', seconds: 0.5 },
    ],
    steps: [
      { id: 's1', kind: 'wait', name: '', duration: { param: 'q1' } },
      {
        id: 's2',
        kind: 'capture',
        name: 'Measurement',
        duration: { param: 'q2' },
      },
      {
        id: 's3',
        kind: 'annotate',
        name: 'Repeat for the measurement count',
        duration: null,
      },
    ],
  },
};
