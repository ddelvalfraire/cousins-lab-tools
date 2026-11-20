import type { LayoutTile } from '@/features/presets';

export interface PresetSpec {
  id: string;
  name: string;
  summary: string;
  revision: number;
  category: string;
  signals: string[];
  views: number;
  tiles: LayoutTile[];
}

// Layout coordinates follow the prototype's three mass-spectrometer specimens.
// Names are current workflow labels, not a promise of legacy file compatibility.
export const presets: PresetSpec[] = [
  {
    id: 'gas',
    name: 'CO₂ & O₂ analysis',
    summary:
      'Calibrate gas signals, inspect concentration and capture interval results.',
    revision: 3,
    category: 'Gas analysis',
    signals: ['Mass 32', 'Mass 44'],
    views: 1,
    tiles: [
      {
        id: 'cal-inputs',
        kind: 'inputs',
        label: 'CO₂ calibration settings',
        x: 0,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'cal-fit',
        kind: 'chart',
        label: 'Calibration fit',
        x: 0,
        y: 2,
        w: 4,
        h: 6,
      },
      {
        id: 'co2',
        kind: 'chart',
        label: 'Concentration',
        x: 4,
        y: 0,
        w: 4,
        h: 8,
      },
      {
        id: 'rate',
        kind: 'chart',
        label: 'Rate of change',
        x: 8,
        y: 0,
        w: 4,
        h: 8,
      },
      {
        id: 'raw',
        kind: 'chart',
        label: 'Raw signals',
        x: 0,
        y: 8,
        w: 12,
        h: 7,
      },
      {
        id: 'controls',
        kind: 'controls',
        label: 'Recording controls',
        x: 0,
        y: 15,
        w: 12,
        h: 2,
      },
      {
        id: 'co2-steps',
        kind: 'readings',
        label: 'CO₂ readings',
        x: 0,
        y: 17,
        w: 4,
        h: 7,
      },
      {
        id: 'o2-steps',
        kind: 'readings',
        label: 'O₂ readings',
        x: 4,
        y: 17,
        w: 4,
        h: 4,
      },
      {
        id: 'o2-inputs',
        kind: 'inputs',
        label: 'O₂ settings',
        x: 4,
        y: 21,
        w: 4,
        h: 3,
      },
      {
        id: 'results',
        kind: 'table',
        label: 'Sample results',
        x: 8,
        y: 17,
        w: 4,
        h: 7,
      },
    ],
  },
  {
    id: 'kinetics',
    name: 'Enzyme kinetics',
    summary:
      'Compare calibration curves, substrate concentrations and reaction rates.',
    revision: 2,
    category: 'Kinetics',
    signals: ['Mass 32', 'Mass 44', 'Mass 49'],
    views: 1,
    tiles: [
      {
        id: 'assay-inputs',
        kind: 'inputs',
        label: 'Assay settings',
        x: 0,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'assay',
        kind: 'chart',
        label: 'Assay calibration',
        x: 0,
        y: 2,
        w: 4,
        h: 5,
      },
      {
        id: 'buffer-inputs',
        kind: 'inputs',
        label: 'Buffer settings',
        x: 4,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        id: 'buffer',
        kind: 'chart',
        label: 'Buffer calibration',
        x: 4,
        y: 2,
        w: 4,
        h: 5,
      },
      {
        id: 'velocity',
        kind: 'chart',
        label: 'Velocity and concentration',
        x: 8,
        y: 0,
        w: 4,
        h: 7,
      },
      {
        id: 'raw',
        kind: 'chart',
        label: 'Raw signals',
        x: 0,
        y: 7,
        w: 12,
        h: 7,
      },
      {
        id: 'controls',
        kind: 'controls',
        label: 'Recording controls',
        x: 0,
        y: 14,
        w: 12,
        h: 2,
      },
      {
        id: 'standards',
        kind: 'readings',
        label: 'Calibration standards',
        x: 0,
        y: 16,
        w: 4,
        h: 7,
      },
      {
        id: 'extract',
        kind: 'readings',
        label: 'Blank and extract readings',
        x: 4,
        y: 16,
        w: 3,
        h: 7,
      },
      {
        id: 'results',
        kind: 'table',
        label: 'Extract results',
        x: 7,
        y: 16,
        w: 5,
        h: 7,
      },
    ],
  },
  {
    id: 'isotope',
    name: 'Isotope exchange',
    summary:
      'Follow isotope abundance, rate of change and selected-interval measurements.',
    revision: 1,
    category: 'Isotope analysis',
    signals: ['Mass 45', 'Mass 47', 'Mass 49'],
    views: 1,
    tiles: [
      {
        id: 'abundance',
        kind: 'chart',
        label: 'Isotope abundance',
        x: 0,
        y: 0,
        w: 6,
        h: 9,
      },
      {
        id: 'rate',
        kind: 'chart',
        label: 'Rate of change',
        x: 6,
        y: 0,
        w: 6,
        h: 9,
      },
      {
        id: 'raw',
        kind: 'chart',
        label: 'Raw signals',
        x: 0,
        y: 9,
        w: 12,
        h: 7,
      },
      {
        id: 'controls',
        kind: 'controls',
        label: 'Recording controls',
        x: 0,
        y: 16,
        w: 12,
        h: 2,
      },
      {
        id: 'readings',
        kind: 'readings',
        label: 'Mean readings',
        x: 0,
        y: 18,
        w: 4,
        h: 7,
      },
      {
        id: 'results',
        kind: 'table',
        label: 'Interval results',
        x: 4,
        y: 18,
        w: 8,
        h: 7,
      },
    ],
  },
];

export interface SetupPreview {
  source: string;
  reference: boolean;
  delay: number;
  routine: string | null;
  count: number;
  interval: number;
  failure: string;
}
export interface ExperimentSummary {
  id: string;
  name: string;
  presetId: string;
  status: 'Recorded' | 'Running' | 'Interrupted';
  date: string;
  samples: number;
  input: string;
  setup?: SetupPreview;
}
export const experiments: ExperimentSummary[] = [
  {
    id: 'sample-024',
    name: 'Leaf respiration · Sample 024',
    presetId: 'gas',
    status: 'Recorded',
    date: '2026-10-30T14:32:00Z',
    samples: 121,
    input: 'Recorded file',
  },
  {
    id: 'sample-025',
    name: 'Leaf respiration · Sample 025',
    presetId: 'gas',
    status: 'Running',
    date: '2026-10-30T15:12:00Z',
    samples: 87,
    input: 'Simulated instrument',
  },
  {
    id: 'assay-08',
    name: 'Enzyme assay · Extract 08',
    presetId: 'kinetics',
    status: 'Recorded',
    date: '2026-10-29T11:04:00Z',
    samples: 121,
    input: 'Recorded file',
  },
  {
    id: 'isotope-03',
    name: 'Isotope exchange · Trial 03',
    presetId: 'isotope',
    status: 'Interrupted',
    date: '2026-10-28T09:20:00Z',
    samples: 64,
    input: 'Recorded file',
  },
];
export const routines = [
  {
    id: 'measure',
    name: 'Timed measurements',
    revision: 2,
    description: 'Collect repeated readings at a configured interval.',
    steps: 3,
    parameters: 'Count · Interval · Initial delay',
  },
  {
    id: 'reference',
    name: 'Reference sequence',
    revision: 1,
    description: 'Capture a reference, wait, then capture the sample.',
    steps: 3,
    parameters: 'Reference duration · Wait · Sample duration',
  },
];
