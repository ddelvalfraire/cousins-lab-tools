/** Story data for revision history, saved versions, import and export. Mirrors the approved mockups' sample data. */
import type { PresetRevision, RevisionChange } from './RevisionHistory';
import type { SavedChart, SavedReadout } from './SavedVersions';
import type { RecordingFile } from './RecordingImport';
import type { PresetDefinitionSummary } from './PresetImport';
import type { ExportSignal, RecordingExportSettings } from './RecordingExport';

export const presetRevisions: PresetRevision[] = [
  { number: 3, note: 'Adjusted signal scaling', savedAt: '2026-11-02T10:42:00', panels: 5 },
  { number: 2, note: 'Added O₂ and sample volume', savedAt: '2026-11-01T16:08:00', panels: 5 },
  { number: 1, note: 'Initial layout', savedAt: '2026-10-28T09:15:00', panels: 3 },
];
export const restoredRevision: PresetRevision = { number: 4, note: 'Restored from R2', savedAt: '2026-11-02T11:03:00', panels: 5 };

export const revisionChanges: Record<number, RevisionChange[]> = {
  3: [
    { item: 'Mass 44', field: 'Scale', before: 'Automatic', after: 'Fixed' },
    { item: 'Mass 44', field: 'Y range', before: 'Automatic', after: '1.8–2.9 mV' },
    { item: 'Mass 44', field: 'Precision', before: '2 decimal places', after: '3 decimal places' },
  ],
  2: [
    { item: 'O₂', itemKind: 'panel', field: 'Panel', before: 'Not included', after: 'Readout · nmol/mL', kind: 'added' },
    { item: 'Sample volume', itemKind: 'panel', field: 'Panel', before: 'Not included', after: 'Input · mL', kind: 'added' },
    { item: 'CO₂', itemKind: 'panel', field: 'Layout', before: 'Previous position and size', after: 'Updated position or size', kind: 'moved' },
  ],
  1: [],
};

const wave = (mid: number, amp: number) => Array.from({ length: 61 }, (_, i) => mid + amp * Math.sin(i * .25) + amp * .16 * Math.cos(i * .61));
const mass44 = wave(2.31, .18), mass45 = wave(1.035, .08);
/** Layout preview of each revision: R3 fixes the Mass 44 scale and shows three decimals. */
export function savedPreview(revision: number): { charts: SavedChart[]; readouts: SavedReadout[] } {
  const fixed = revision >= 3;
  const charts: SavedChart[] = [
    { title: 'Mass 44', value: mass44[60].toFixed(fixed ? 3 : 2), unit: 'mV', min: fixed ? 1.8 : 2.0, max: fixed ? 2.9 : 2.7, points: mass44 },
    { title: 'Mass 45', value: mass45[60].toFixed(2), unit: 'mV', min: .8, max: 1.3, points: mass45 },
  ];
  const readouts: SavedReadout[] = revision === 1
    ? [{ title: 'CO₂', value: '12.43', unit: 'nmol/mL' }]
    : [{ title: 'CO₂', value: '12.43', unit: 'nmol/mL' }, { title: 'O₂', value: '8.62', unit: 'nmol/mL' }, { title: 'Sample volume', value: '10', unit: 'mL', input: true }];
  return { charts, readouts };
}

export const recordingFiles: RecordingFile[] = [
  { id: 'sample25', name: 'leaf-respiration-025.csv', size: 47 * 1024, duration: 120, status: 'ready', channels: [{ name: 'Mass 44', unit: 'mV' }, { name: 'Mass 45', unit: 'mV' }, { name: 'Temperature', unit: '°C' }] },
  { id: 'sample26', name: 'leaf-respiration-026.csv', size: 29 * 1024, duration: 90, status: 'ready', channels: [{ name: 'Mass 44', unit: 'mV' }, { name: 'Mass 45', unit: 'mV' }] },
];
export const recordingNames = { sample25: 'Leaf respiration · Sample 025', sample26: 'Leaf respiration · Sample 026' };
export const unreadableRecording: RecordingFile = { id: 'bad', name: 'unrecognized-recording.csv', size: 1024, status: 'error', problem: 'Time column is missing; no numeric signals were found.' };
export const unreadableRecording2: RecordingFile = { id: 'bad2', name: 'notes-2026-11-02.csv', size: 3 * 1024, status: 'error', problem: 'The file has no rows after the header.' };
export const recordingPresets = [{ id: 'co2', label: 'CO₂ & O₂ analysis · R3' }, { id: 'signals', label: 'Signal overview · R1' }];

export const gasExchangeDefinition: PresetDefinitionSummary = {
  name: 'Gas exchange',
  description: 'Mass signals with calibrated CO₂ and O₂ readouts.',
  sourceRevision: 3,
  layout: [
    { kind: 'line', x: 0, y: 0, w: 49, h: 57 }, { kind: 'line', x: 51, y: 0, w: 49, h: 57 },
    { kind: 'readout', x: 0, y: 60, w: 32, h: 40 }, { kind: 'readout', x: 34, y: 60, w: 32, h: 40 }, { kind: 'input', x: 68, y: 60, w: 32, h: 40 },
  ],
  routines: [{ name: 'Reference and sample', revision: 3, steps: 3 }],
  roles: [{ name: 'Mass spectrometer', count: 1, signals: ['Mass 44 · mV', 'Mass 45 · mV'] }],
};
export const presetFile = { name: 'gas-exchange.preset.json', size: 18 * 1024 };

export const exportSignals: ExportSignal[] = [
  { id: 'mass44', name: 'Mass 44', unit: 'mV', source: 'MS-01', kind: 'raw' },
  { id: 'mass45', name: 'Mass 45', unit: 'mV', source: 'MS-01', kind: 'raw' },
  { id: 'temperature', name: 'Temperature', unit: '°C', source: 'T-01', kind: 'raw' },
  { id: 'co2', name: 'Dissolved CO₂', unit: 'nmol/mL', kind: 'derived' },
];
export const exportRecording = { name: 'Leaf respiration · Sample 025', duration: 300, preset: { name: 'CO₂ & O₂ analysis', revision: 3 } };
export const exportDefaults: RecordingExportSettings = { range: 'full', start: '120', end: '180', signals: exportSignals.map(signal => signal.id), fileName: 'leaf-respiration-025', format: 'csv', includePreset: true };
/** Rows at two samples a second, inclusive of both ends. */
export function exportRows(value: RecordingExportSettings, duration = 300) {
  if (value.range === 'full') return duration * 2 + 1;
  const start = Number(value.start), end = Number(value.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0 && end <= duration ? Math.floor((end - start) * 2) + 1 : 0;
}
