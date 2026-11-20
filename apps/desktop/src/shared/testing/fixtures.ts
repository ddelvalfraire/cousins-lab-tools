import type uPlot from 'uplot';
import type { SignalSample } from '@/shared/charts/SignalChart';
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
/** Saved interval results of Sample 024, with the calibration stored with them. */
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
