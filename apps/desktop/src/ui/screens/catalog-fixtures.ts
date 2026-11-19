import { type PresetSpec, presets } from '@/shared/testing/screen-fixtures';
import type {
  SetupPreset,
  SetupRoutine,
} from '../components/ExperimentSetupForm';
import type { CatalogInstrument } from '../components/InstrumentCatalog';
import type {
  CatalogPreset,
  CatalogPresetPanel,
} from '../components/PresetCatalog';
import type { LayoutTile } from '../components/PresetLayoutPreview';
import type { CatalogRoutine } from '../components/RoutineCatalog';
import type { RoutineDefinition } from '../components/RoutineEditor';

/*
 * Sample catalog rows from the approved catalog mockups:
 * design/dvdash-field-review/preset-catalog-review.html (presetSpecs),
 * instrument-catalog-review.html (instrumentSeed) and routine-catalog-review.html (routineDefinitions).
 * "Reaction kinetics" uses the id `reaction-kinetics` so it never resolves to the app's "Enzyme kinetics" (`kinetics`).
 */
const panel = (
  kind: CatalogPresetPanel['kind'],
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  unit = '',
): CatalogPresetPanel => ({ kind, x, y, w, h, name, unit });

export const catalogPresets: CatalogPreset[] = [
  {
    id: 'gas',
    name: 'CO₂ & O₂ analysis',
    description: 'Compare gas signals with calibrated readouts.',
    revision: 3,
    updated: '2026-11-02T10:42:00',
    panels: [
      panel('line', 0, 0, 49, 57, 'Mass 44', 'mV'),
      panel('line', 51, 0, 49, 57, 'Mass 45', 'mV'),
      panel('readout', 0, 60, 32, 40, 'CO₂', 'nmol/mL'),
      panel('readout', 34, 60, 32, 40, 'O₂', 'nmol/mL'),
      panel('input', 68, 60, 32, 40, 'Sample volume', 'mL'),
    ],
  },
  {
    id: 'thermal',
    name: 'Temperature response',
    description: 'Track temperature alongside a voltage signal.',
    revision: 2,
    updated: '2026-11-01T16:08:00',
    panels: [
      panel('line', 0, 0, 65, 100, 'Temperature', '°C'),
      panel('line', 68, 0, 32, 57, 'Mass 44', 'mV'),
      panel('readout', 68, 60, 32, 40, 'Temperature', '°C'),
    ],
  },
  {
    id: 'reaction-kinetics',
    name: 'Reaction kinetics',
    description: 'Follow a signal and its rate of change.',
    revision: 5,
    updated: '2026-10-31T14:21:00',
    panels: [
      panel('multi', 0, 0, 100, 60, 'Reaction signals', 'mV'),
      panel('line', 0, 63, 65, 37, 'Rate', 'mV/s'),
      panel('input', 68, 63, 32, 37, 'Time window', 's'),
    ],
  },
  {
    id: 'calibration',
    name: 'Signal calibration',
    description: 'Fit measured response to known concentrations.',
    revision: 4,
    updated: '2026-10-30T11:05:00',
    panels: [
      panel('scatter', 0, 0, 60, 64, 'Calibration fit', 'nmol/mL'),
      panel('table', 63, 0, 37, 100, 'Readings'),
      panel('readout', 0, 67, 60, 33, 'Fit coefficient'),
    ],
  },
  {
    id: 'overview',
    name: 'Signal overview',
    description: 'Monitor three instrument channels together.',
    revision: 1,
    updated: '2026-10-29T09:32:00',
    panels: [
      panel('line', 0, 0, 32, 60, 'Mass 44', 'mV'),
      panel('line', 34, 0, 32, 60, 'Mass 45', 'mV'),
      panel('line', 68, 0, 32, 60, 'Temperature', '°C'),
      panel('table', 0, 63, 100, 37, 'Samples'),
    ],
  },
  {
    id: 'ratio',
    name: 'Isotope ratios',
    description: 'Compare two channels and a derived ratio.',
    revision: 3,
    updated: '2026-10-28T15:40:00',
    panels: [
      panel('multi', 0, 0, 100, 62, 'Mass signals', 'mV'),
      panel('readout', 0, 65, 49, 35, 'Ratio'),
      panel('line', 51, 65, 49, 35, 'Ratio trend'),
    ],
  },
  {
    id: 'reference',
    name: 'Reference comparison',
    description: 'Align recorded and reference signal traces.',
    revision: 2,
    updated: '2026-10-27T12:06:00',
    panels: [
      panel('multi', 0, 0, 100, 60, 'Signal comparison', 'mV'),
      panel('table', 0, 63, 66, 37, 'Selected interval', 's'),
      panel('input', 69, 63, 31, 37, 'Time offset', 's'),
    ],
  },
  {
    id: 'baseline',
    name: 'Baseline stability',
    description: 'Watch signal drift over an extended interval.',
    revision: 1,
    updated: '2026-10-26T08:50:00',
    panels: [
      panel('line', 0, 0, 100, 65, 'Baseline signal', 'mV'),
      panel('readout', 0, 68, 49, 32, 'Mean', 'mV'),
      panel('readout', 51, 68, 49, 32, 'Standard deviation', 'mV'),
    ],
  },
];

export const catalogInstruments: CatalogInstrument[] = [
  {
    id: 'MS-01',
    name: 'Mass spectrometer',
    kind: 'mass',
    transport: 'USB serial',
    port: 'COM3',
    state: 'receiving',
    note: 'Last sample just now',
    channels: [
      { name: 'Mass 44', value: '2.310', unit: 'mV', rate: '2 samples/s' },
      { name: 'Mass 45', value: '1.035', unit: 'mV', rate: '2 samples/s' },
      { name: 'Mass 49', value: '0.842', unit: 'mV', rate: '2 samples/s' },
    ],
  },
  {
    id: 'T-01',
    name: 'Temperature probe',
    kind: 'temperature',
    transport: 'USB serial',
    port: 'COM5',
    state: 'ready',
    note: 'Connected · not acquiring',
    channels: [
      { name: 'Temperature', value: '22.0', unit: '°C', rate: '1 sample/s' },
    ],
  },
  {
    id: 'MS-02',
    name: 'Reference spectrometer',
    kind: 'mass',
    transport: 'USB serial',
    port: 'COM7',
    state: 'offline',
    note: 'Last connected yesterday',
    channels: [
      { name: 'Mass 44', value: '—', unit: 'mV', rate: 'No samples' },
      { name: 'Mass 45', value: '—', unit: 'mV', rate: 'No samples' },
    ],
  },
];

export const catalogRoutines: CatalogRoutine[] = [
  {
    id: 'ref-sample',
    name: 'Reference and sample',
    revision: 3,
    role: 'Voltage signal',
    parameters: [
      ['Reference', '10 s'],
      ['Wait', '5 s'],
      ['Sample', '20 s'],
    ],
    steps: [
      { kind: 'capture', name: 'Reference', duration: 10 },
      { kind: 'wait', duration: 5 },
      { kind: 'capture', name: 'Sample', duration: 20 },
    ],
  },
  {
    id: 'repeat',
    name: 'Repeated sampling',
    revision: 2,
    role: 'Voltage signal',
    parameters: [
      ['Cycles', '6'],
      ['Capture', '20 s'],
      ['Wait', '10 s'],
    ],
    steps: Array.from({ length: 6 }, (_, i) => [
      {
        kind: 'capture' as const,
        name: `Sample ${String(i + 1).padStart(2, '0')}`,
        duration: 20,
      },
      { kind: 'wait' as const, duration: 10 },
    ]).flat(),
  },
  {
    id: 'baseline',
    name: 'Baseline then sample',
    revision: 1,
    role: 'Voltage signal',
    parameters: [
      ['Settle', '10 s'],
      ['Baseline', '15 s'],
      ['Sample', '30 s'],
    ],
    steps: [
      { kind: 'wait', duration: 10 },
      { kind: 'capture', name: 'Baseline', duration: 15 },
      { kind: 'annotate', name: 'Sample added' },
      { kind: 'capture', name: 'Sample', duration: 30 },
    ],
  },
];

/* Navigation targets for catalog rows that the app fixtures do not define. */

const tileKind = {
  line: 'chart',
  multi: 'chart',
  scatter: 'chart',
  readout: 'readings',
  input: 'inputs',
  table: 'table',
} as const;
/** A catalog preset as a screen preset (detail, editor, setup). Its tiles follow the thumbnail geometry on a 12-column grid. */
export function catalogPresetSpec(id: string): PresetSpec | undefined {
  const p = catalogPresets.find((item) => item.id === id);
  if (!p) return undefined;
  const tiles: LayoutTile[] = p.panels.map((t, i) => {
    const x = Math.round((t.x / 100) * 12),
      y = Math.round(t.y / 10);
    return {
      id: `${p.id}-${i}`,
      kind: tileKind[t.kind],
      label: t.name,
      x,
      y,
      w: Math.max(1, Math.min(12 - x, Math.round((t.w / 100) * 12))),
      h: Math.max(1, Math.round(t.h / 10)),
    };
  });
  const signals = [
    ...new Set(
      p.panels.map((t) => t.name).filter((name) => name.startsWith('Mass ')),
    ),
  ];
  return {
    id: p.id,
    name: p.name,
    summary: p.description,
    revision: p.revision,
    category: 'Catalog',
    signals: signals.length ? signals : ['Mass 44'],
    views: 1,
    tiles,
  };
}
/** Setup choices for catalog presets the app fixtures do not already offer. */
export const catalogSetupPresets: SetupPreset[] = catalogPresets
  .filter((p) => !presets.some((app) => app.id === p.id))
  .map((p) => {
    const spec = catalogPresetSpec(p.id)!;
    return {
      id: p.id,
      name: p.name,
      revisions: Array.from({ length: p.revision }, (_, i) => p.revision - i),
      signals: spec.signals.map((s) => s.replace('Mass ', '')),
    };
  });

const seconds = (value: string) => Number.parseFloat(value);
/** A catalog routine in the shape of the app's routine summaries (Workspace routine lookup). */
export function catalogRoutine(id: string) {
  const r = catalogRoutines.find((item) => item.id === id);
  return (
    r && {
      id: r.id,
      name: r.name,
      revision: r.revision,
      description: `${r.steps.length} steps`,
      steps: r.steps.length,
      parameters: r.parameters.map(([key]) => key).join(' · '),
    }
  );
}
/** Editor definitions: each timed parameter becomes a routine parameter; steps reference them by duration. */
export const catalogRoutineDefinitions: Record<string, RoutineDefinition> =
  Object.fromEntries(
    catalogRoutines.map((r) => {
      const timed = r.parameters.filter(([, value]) => value.endsWith(' s'));
      const parameters = timed.map(([name, value], i) => ({
        id: `q${i + 1}`,
        name,
        seconds: seconds(value),
      }));
      const param = (duration: number, preferred: string) =>
        (
          parameters.find(
            (p) => p.name === preferred && p.seconds === duration,
          ) ?? parameters.find((p) => p.seconds === duration)
        )?.id;
      const steps = r.steps.map((step, i) => {
        const id = param(
          step.duration ?? -1,
          step.kind === 'wait'
            ? r.id === 'baseline'
              ? 'Settle'
              : 'Wait'
            : step.kind === 'capture' && r.id === 'repeat'
              ? 'Capture'
              : (step.name ?? ''),
        );
        return {
          id: `s${i + 1}`,
          kind: step.kind,
          name: step.kind === 'wait' ? '' : (step.name ?? ''),
          duration:
            step.duration === undefined
              ? null
              : id
                ? { param: id }
                : { fixed: step.duration },
        };
      });
      return [r.id, { parameters, steps }];
    }),
  );
/** Setup choices for catalog routines. */
export const catalogSetupRoutines: SetupRoutine[] = catalogRoutines.map(
  (r) => ({
    id: r.id,
    name: r.name,
    revision: r.revision,
    steps: r.steps.length,
    fields: r.parameters.map(([label, value]) => ({
      id: label.toLowerCase(),
      label,
      value: seconds(value),
      ...(value.endsWith(' s')
        ? { unit: 's', min: 0 }
        : { min: 1, integer: true }),
    })),
  }),
);
