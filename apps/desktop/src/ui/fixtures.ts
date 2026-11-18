import type uPlot from 'uplot';
export interface SignalSample {
  time: number;
  mass44: number | null;
  mass49: number | null;
}
export const samples: SignalSample[] = Array.from({ length: 121 }, (_, i) => ({
  time: i,
  mass44: 10 + 2 * Math.sin(i / 12) + 3 * Math.exp(-(((i - 48) / 12) ** 2)),
  mass49: 6 + 1.5 * Math.cos(i / 16) + 1.4 * Math.exp(-(((i - 76) / 10) ** 2)),
}));
export function alignedData(rows: SignalSample[]): uPlot.AlignedData {
  return [
    rows.map((row) => row.time),
    rows.map((row) => row.mass44),
    rows.map((row) => row.mass49),
  ];
}
/** Saved interval results of Sample 024, with the calibration stored with them (saved-result-inspector-review.html means). */
export const savedResults = [1.508, 1.742, 2.713, 1.92, 1.335, 0.85].map(
  (mean, i) => ({
    id: `result-${i + 1}`,
    sample: `Sample ${String(i + 1).padStart(2, '0')}`,
    start: 120 + i * 10,
    end: 140 + i * 10,
    value: Number(((mean - 0.303) * 83).toFixed(3)),
    context: 'c2',
    revision: 3,
    settings: { zero: 0.303, scale: 83 },
  }),
);
/** Reproducible UI fixture, not a scientifically validated conversion. */
export const experimentRecording = Array.from({ length: 121 }, (_, i) => ({
  time: i * 3,
  mass44: 0.303 + (260 - i * 1.65 + 7 * Math.sin(i / 12)) / 83,
  mass32: (220 - i * 0.45 + 2 * Math.sin(i / 15)) / 100,
}));
export const templates = [
  {
    id: 'gas',
    name: 'Gas exchange',
    description: 'Signals, calibration and interval results.',
    revision: 3,
    panels: 6,
  },
  {
    id: 'compare',
    name: 'Recording comparison',
    description: 'Two recordings with shared interval analysis.',
    revision: 2,
    panels: 4,
  },
  {
    id: 'monitor',
    name: 'Signal monitor',
    description: 'Voltage readouts and instrument controls.',
    revision: 1,
    panels: 3,
  },
];
