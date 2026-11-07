import type { Problem } from './ProblemsPanel';
import type { TracePoint } from './SignalChart';

/** A live stream shown as a card (right-sidebar-review.html `streams`). */
export interface LiveStream {
  id: string;
  title: string;
  source: string;
  unit: string;
  min: number;
  max: number;
  precision: number;
  /** The last 30 s of samples, timed relative to now (−30 to 0 s). */
  points: TracePoint[];
  /** Selected for the recording. */
  captured: boolean;
}

/** A recorded signal shown as a playback card (sticky-playback-review.html `pbChannels`). */
export interface RecordedChannel { id: 'mass44' | 'mass45'; name: string; unit: string; min: number; max: number; color: string }
export interface RecordedSample { time: number; mass44: number | null; mass45: number | null }

/** Values from right-sidebar-review.html: 2 samples/s, a wave around each stream's middle, ending on the mockup's reading. */
function livePoints(middle: number, amplitude: number, phase: number, last: number): TracePoint[] {
  const wave = (t: number) => middle + amplitude * Math.sin(t / 2.2 + phase) + amplitude * 0.35 * Math.sin(t / 0.9 + phase);
  const shift = last - wave(30);
  return Array.from({ length: 61 }, (_, i) => ({ time: i * 0.5 - 30, value: Number((wave(i * 0.5) + shift).toFixed(4)) }));
}

export const liveStreams: LiveStream[] = [
  { id: 'mass44', title: 'Mass 44', source: 'MS-01', unit: 'mV', min: 1.8, max: 2.9, precision: 2, points: livePoints(2.32, 0.19, 0, 2.34), captured: true },
  { id: 'mass45', title: 'Mass 45', source: 'MS-01', unit: 'mV', min: 0.8, max: 1.3, precision: 3, points: livePoints(1.04, 0.08, 0.6, 1.05), captured: true },
  { id: 'temperature', title: 'Temperature', source: 'T-01', unit: '°C', min: 19, max: 25, precision: 1, points: livePoints(22, 1.1, 1.2, 22.1), captured: false },
];

export const recordedChannels: RecordedChannel[] = [
  { id: 'mass44', name: 'Mass 44', unit: 'mV', min: 1.8, max: 2.9, color: 'var(--dv-blue)' },
  { id: 'mass45', name: 'Mass 45', unit: 'mV', min: 0.8, max: 1.3, color: 'var(--dv-purple)' },
];

/** sticky-playback-review.html `dxRecording`: 601 samples at 0.5 s, 0–300 s. */
export const recordedSamples: RecordedSample[] = Array.from({ length: 601 }, (_, i) => ({
  time: i * 0.5,
  mass44: Number((2.31 + 0.18 * Math.sin(i * 0.12)).toFixed(3)),
  mass45: Number((1.03 + 0.08 * Math.cos(i * 0.11)).toFixed(3)),
}));

/** The same recording with 15 s missing at 150–165 s (diagnostics-review.html, "Recording with a gap"). */
export const recordedSamplesWithGap: RecordedSample[] = recordedSamples.map(row => row.time > 150 && row.time < 165 ? { ...row, mass44: null, mass45: null } : row);

/** Panels of the experiment workspace that problems can point at. */
export const workspacePanels = {
  mass44: { id: 'mass44', title: 'Mass 44' },
  mass45: { id: 'mass45', title: 'Mass 45' },
  temperature: { id: 'temperature', title: 'Temperature' },
  derived: { id: 'derived', title: 'Dissolved CO₂' },
  charts: { id: 'charts', title: 'Recorded signals' },
} as const;

/** diagnostics-review.html "Several problems", pointed at this workspace's panels. */
export const liveProblems: Problem[] = [
  {
    id: 'i1', severity: 'error', title: 'MS-01 stopped sending data', when: 'Since 14:02:31 · 45 s ago',
    explanation: 'No new samples are arriving, so live values have stopped updating. Samples recorded before 14:02:31 are saved.',
    affects: [workspacePanels.mass44, workspacePanels.mass45],
    actions: [{
      id: 'reconnect', label: 'Reconnect MS-01', kind: 'fix', pending: 'Reconnecting…', waiting: 'Waiting for MS-01…',
      failed: 'MS-01 didn’t answer. Check its cable and power, then try again.', done: 'MS-01 is sending data again.',
    }],
  },
  {
    id: 'i2', severity: 'warning', title: 'Dissolved CO₂ can’t be calculated', when: 'Since 14:00:05',
    explanation: 'It needs Mass 44 from the zero gas recording, which isn’t set for this experiment.',
    affects: [workspacePanels.derived], actions: [{ id: 'source', label: 'Choose a zero gas recording', kind: 'navigate', tab: 'signals' }],
  },
  {
    id: 'i3', severity: 'warning', title: 'Mass 44 is above the calibrated range', when: 'Since 13:58:40 · 12 readings',
    explanation: 'Readings above 800 mV use a straight-line extension of the calibration, so they are less certain.',
    affects: [workspacePanels.mass44], actions: [{ id: 'curve', label: 'View calibration', kind: 'navigate', tab: 'details' }],
  },
  {
    id: 'i4', severity: 'info', title: '3 samples arrived out of order and were sorted', when: '13:57:12',
    explanation: 'They were placed by their timestamps. No values changed.',
    affects: [], actions: [{ id: 'dismiss', label: 'Dismiss', kind: 'dismiss' }],
  },
];

/** diagnostics-review.html "Recording with a gap". */
export const recordedProblems: Problem[] = [{
  id: 'r1', severity: 'info', title: 'The recording has a 15 s gap', when: 'At 150–165 s',
  explanation: 'No samples were recorded there, so the chart leaves a gap instead of drawing a line across it.',
  affects: [workspacePanels.charts], actions: [{ id: 'show', label: 'Show on chart', kind: 'locate' }],
}];
