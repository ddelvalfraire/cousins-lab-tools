import type { LayoutTile } from '@/features/presets';
import { presetLayouts } from '@/features/presets/fixtures';

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

// Names are current workflow labels, not a promise of legacy file compatibility.
export const presets: PresetSpec[] = [
  {
    id: 'gas',
    name: presetLayouts.gas.name,
    summary:
      'Calibrate gas signals, inspect concentration and capture interval results.',
    revision: 3,
    category: 'Gas analysis',
    signals: ['Mass 32', 'Mass 44'],
    views: 1,
    tiles: presetLayouts.gas.tiles,
  },
  {
    id: 'kinetics',
    name: presetLayouts.kinetics.name,
    summary:
      'Compare calibration curves, substrate concentrations and reaction rates.',
    revision: 2,
    category: 'Kinetics',
    signals: ['Mass 32', 'Mass 44', 'Mass 49'],
    views: 1,
    tiles: presetLayouts.kinetics.tiles,
  },
  {
    id: 'isotope',
    name: presetLayouts.isotope.name,
    summary:
      'Follow isotope abundance, rate of change and selected-interval measurements.',
    revision: 1,
    category: 'Isotope analysis',
    signals: ['Mass 45', 'Mass 47', 'Mass 49'],
    views: 1,
    tiles: presetLayouts.isotope.tiles,
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
