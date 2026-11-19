/**
 * Review & export page fixtures: the recording and a reference recording, shaped for the approved inspectors.
 * Traces follow alignment-inspector-review.html and source-binding-review.html; nothing is read from disk.
 */

import type { IntervalResult } from '@/features/acquisition';
import type { ChecklistStep, IntervalSummary } from '@/features/calibration';
import type {
  ExportSignal,
  RecordingExportSettings,
} from '@/features/exchange';
import type {
  AlignmentEvent,
  AlignmentRecording,
  AlignmentSettings,
  PanelChannel,
  PanelSourceOption,
  ResultQuantity,
  SavedResult,
} from '@/features/inspectors';
import type { RecordedSample } from '@/features/workspace/fixtures';
import type {
  ExperimentSummary,
  PresetSpec,
} from '@/shared/testing/screen-fixtures';

const DURATION = 300;
/** A response 18 s after the event, then a smaller one 55 s after it (alignment-inspector-review.html `raw`). */
const response = (t: number, event: number) =>
  0.303 +
  0.85 * Math.exp(-(((t - event - 18) / 13) ** 2)) +
  0.14 * Math.exp(-(((t - event - 55) / 18) ** 2));

const shortName = (experiment: ExperimentSummary) =>
  experiment.name.split(' · ').pop() ?? experiment.name;
const fileName = (experiment: ExperimentSummary) => `${experiment.id}.csv`;
const REFERENCE = {
  id: 'reference-023',
  name: 'Reference 023',
  file: 'reference-023.csv',
};

export const alignmentEvents: AlignmentEvent[] = [
  { id: 'sample', label: 'Sample introduced' },
  { id: 'valve', label: 'Valve opened' },
];
export const savedAlignment: AlignmentSettings = {
  method: 'elapsed',
  event: 'sample',
  origins: {},
};

/** The recording and the reference, the same response 15 s apart. */
export function alignmentRecordings(
  experiment: ExperimentSummary,
): AlignmentRecording[] {
  const trace = (event: number) =>
    Array.from({ length: DURATION + 1 }, (_, t) => ({
      t,
      y: response(t, event),
    }));
  const own: AlignmentRecording = {
    id: experiment.id,
    name: shortName(experiment),
    file: fileName(experiment),
    line: 'solid',
    signal: 'Mass 44',
    unit: 'mV',
    duration: DURATION,
    samples: DURATION + 1,
    available: true,
    clockStart: '09:14:00',
    events: { sample: 120, valve: 90 },
    data: trace(120),
  };
  return [
    own,
    {
      ...own,
      ...REFERENCE,
      line: 'dashed',
      clockStart: '09:14:15',
      events: { sample: 135, valve: 102 },
      data: trace(135),
    },
  ];
}
export const alignmentDefaults = (
  recordings: readonly AlignmentRecording[],
): AlignmentSettings => ({
  ...savedAlignment,
  origins: Object.fromEntries(
    recordings.map((r) => [r.id, String(r.events.sample)]),
  ),
});

export const reviewChannels: PanelChannel[] = [
  { id: 'mass44', label: 'Mass 44', line: 'solid' },
  { id: 'mass45', label: 'Mass 45', line: 'dashed' },
  { id: 'mass49', label: 'Mass 49', line: 'dotted' },
];
export const reviewSignalUnit = { unit: 'mV', quantity: 'voltage signals' };
/** Sources the overview chart can show: this recording and the reference, both at 2 samples/s (source-binding-review.html `raw`). */
export function reviewSources(
  experiment: ExperimentSummary,
): PanelSourceOption[] {
  const rows = (n: number) =>
    Array.from({ length: DURATION * 2 + 1 }, (_, i) => ({
      t: i / 2,
      mass44:
        1.55 +
        n * 0.09 +
        0.2 * Math.sin(i / 19) +
        0.35 * Math.exp(-(((i / 2 - 110) / 20) ** 2)),
      mass45: 0.85 + n * 0.04 + 0.12 * Math.sin(i / 25),
      mass49: 0.35 + 0.09 * Math.sin(i / 22),
    }));
  const channels = reviewChannels.map((c) => c.id);
  return [
    {
      id: experiment.id,
      name: shortName(experiment),
      file: fileName(experiment),
      kind: 'Recorded',
      group: 'Recordings',
      duration: DURATION,
      samples: DURATION * 2 + 1,
      channels,
      ...reviewSignalUnit,
      data: rows(0),
    },
    {
      id: REFERENCE.id,
      name: REFERENCE.name,
      file: REFERENCE.file,
      kind: 'Recorded',
      group: 'Recordings',
      duration: DURATION,
      samples: DURATION * 2 + 1,
      channels,
      ...reviewSignalUnit,
      data: rows(1),
    },
  ];
}

export function resultQuantity(preset: PresetSpec): ResultQuantity {
  return preset.id === 'isotope'
    ? {
        symbol: 'Rate',
        label: 'Mean rate',
        unit: '1/s',
        unitName: 'Per second',
      }
    : {
        symbol: 'CO₂',
        label: 'Dissolved CO₂',
        unit: 'nmol/mL',
        unitName: 'Nanomoles per millilitre',
      };
}
/** Saved interval results with the context stored with them. A result saved without its calibration keeps only its value. */
export function savedResultsFor(
  experiment: ExperimentSummary,
  preset: PresetSpec,
  rows: readonly IntervalResult[],
): SavedResult[] {
  return rows.map((row) => {
    const settings = row.settings;
    return {
      id: row.id,
      sample: row.sample,
      start: row.start,
      end: row.end,
      value: row.value,
      mean: settings ? row.value / settings.scale + settings.zero : null,
      sampleCount: Math.round((row.end - row.start) * 2) + 1,
      signal: 'Mass 44',
      signalUnit: 'mV',
      recording: fileName(experiment),
      sourceId: experiment.id,
      calibrationRevision: row.context,
      calibration: settings ? { revision: row.context, ...settings } : null,
      preset: { name: preset.name, revision: `R${row.revision}` },
      savedAt: experiment.date,
    };
  });
}

export const exportSignals: ExportSignal[] = [
  { id: 'mass44', name: 'Mass 44', unit: 'mV', source: 'MS-01', kind: 'raw' },
  { id: 'mass45', name: 'Mass 45', unit: 'mV', source: 'MS-01', kind: 'raw' },
  { id: 'mass49', name: 'Mass 49', unit: 'mV', source: 'MS-01', kind: 'raw' },
  { id: 'co2', name: 'Dissolved CO₂', unit: 'nmol/mL', kind: 'derived' },
];
export const exportDefaults = (
  experiment: ExperimentSummary,
): RecordingExportSettings => ({
  range: 'full',
  start: '120',
  end: '180',
  signals: exportSignals.map((signal) => signal.id),
  fileName: experiment.id,
  format: 'csv',
  includePreset: true,
});
/** Rows at two samples a second, inclusive of both ends. */
export function exportRowCount(
  value: RecordingExportSettings,
  duration = DURATION,
) {
  if (value.range === 'full') return duration * 2 + 1;
  const start = Number(value.start),
    end = Number(value.end);
  return Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    start >= 0 &&
    end <= duration
    ? Math.floor((end - start) * 2) + 1
    : 0;
}
/** CSV of the selected signals over the chosen range: elapsed seconds, then one column per signal with its unit. Missing values are blank. */
export function exportCsv(
  value: RecordingExportSettings,
  source: PanelSourceOption,
) {
  const signals = exportSignals.filter((signal) =>
    value.signals.includes(signal.id),
  );
  const start = value.range === 'full' ? 0 : Number(value.start),
    end = value.range === 'full' ? Infinity : Number(value.end);
  const cell = (row: PanelSourceOption['data'][number], id: string) => {
    const v =
      id === 'co2'
        ? row.mass44 === undefined
          ? undefined
          : (row.mass44 - 0.303) * 83
        : row[id];
    return v === undefined ? '' : String(Number(v.toFixed(4)));
  };
  return [
    [
      'elapsed_s',
      ...signals.map(
        (s) =>
          `${s.name.replace(/\W+/g, '_').toLowerCase()}_${s.unit.replace('/', '_per_')}`,
      ),
    ].join(','),
    ...source.data
      .filter((row) => row.t >= start && row.t <= end)
      .map((row) => [row.t, ...signals.map((s) => cell(row, s.id))].join(',')),
  ].join('\n');
}

/** Calibration steps from calibration-checklist-review.html. */
export const calibrationSteps: ChecklistStep[] = [
  { id: 'zero', label: 'Zero offset', known: 0 },
  { id: 'std100', label: 'Standard 100', known: 100 },
  { id: 'std200', label: 'Standard 200', known: 200 },
  { id: 'sample', label: 'Sample reading', known: null },
];
/** Mean of Mass 44 between start and end. Missing samples block the reading. */
export function summarizeMass44(
  rows: readonly RecordedSample[],
  start: number,
  end: number,
): IntervalSummary {
  const values = rows.filter((row) => row.time >= start && row.time <= end);
  if (!values.length)
    return {
      problem: 'No samples in this interval. Widen the selection.',
      severity: 'warning',
    };
  if (values.some((row) => row.mass44 === null))
    return {
      problem:
        'Samples are missing from this interval. Choose a complete interval.',
      severity: 'warning',
    };
  return {
    mean:
      values.reduce((sum, row) => sum + (row.mass44 as number), 0) /
      values.length,
    count: values.length,
  };
}
