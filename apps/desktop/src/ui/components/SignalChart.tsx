import {
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextInput,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import {
  IconAdjustmentsHorizontal,
  IconChartLine,
  IconTable,
} from '@tabler/icons-react';
import { motion as animated, type Transition } from 'motion/react';
import { useId, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import { formatMeasurement } from '@/shared/lib/measurement';
import { MotionList, Presence, Swap } from '@/shared/motion/Motion';
import { curves, motion } from '@/shared/motion/motion';
import type { SignalSample } from '@/shared/testing/fixtures';
import { useAppearance } from '@/shared/theme/appearance';
import { rootTextScale, textScales } from '@/shared/theme/textSize';
import { seriesColors } from '@/shared/theme/theme';
import { StatusMessages } from './Primitives';
import { useElementWidth } from './useElementWidth';
import { useUplotChart } from './useUplotChart';
import '@/shared/theme/Approved.css';
import './SignalChart.css';
import { ScrollFrame } from './ScrollFrame';
import { useKeyedValue } from './useKeyedValue';

export type { PlotSeries } from './ScientificPlot';
export { ScientificPlot } from './ScientificPlot';

export type ChartState =
  | 'recorded'
  | 'live'
  | 'stale'
  | 'missing'
  | 'empty'
  | 'unavailable';
export type SignalKey = 'mass44' | 'mass49';
/** Grafana's "Connect null values": how the line treats samples the recording marks missing (null). */
export type ConnectNulls = 'never' | 'always' | { threshold: number };
/** Grafana's "Disconnect values": break the line where consecutive samples are further apart than the threshold. */
export type DisconnectAfter = 'never' | { threshold: number };
export interface SignalBreak {
  key: SignalKey;
  fromIndex: number;
  index: number;
  from: number;
  to: number;
  kind: 'missing' | 'pause';
}
export interface SignalAnalysis {
  breaks: SignalBreak[];
  bands: { from: number; to: number }[];
  notes: string[];
  real: number;
  missing: number;
  median: number;
  min: number;
  max: number;
  uneven: boolean;
  /** Sampling varies throughout (not one pause): every sample is marked and times keep two decimals. */
  irregular: boolean;
  /** Samples a log axis cannot draw (values at or below 0). */
  hidden: number;
  /** Orders of magnitude spanned by all-positive values; 0 when values include 0 or less. */
  orders: number;
  /** Orders of magnitude spanned by the positive values alone (what a log axis draws). */
  logOrders: number;
  connected: Record<SignalKey, Set<number>>;
}
const signalLabels: Record<SignalKey, string> = {
  mass44: 'Mass 44',
  mass49: 'Mass 49',
};
const seconds = (text: string) => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null;
};
const superscript: Record<string, string> = {
  '-': '⁻',
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹',
};
const decade = (v: number) =>
  `10${String(Math.round(Math.log10(v))).replace(/[-0-9]/g, (c) => superscript[c])}`;
const plain = (v: number) =>
  v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });

/** Where the line breaks and why, following Grafana's time series gap rules. Values are never interpolated or changed. */
export function analyseSignal(
  rows: readonly SignalSample[],
  keys: readonly SignalKey[],
  connect: ConnectNulls = 'never',
  disconnect: DisconnectAfter = 'never',
  log = false,
): SignalAnalysis {
  const breaks: SignalBreak[] = [],
    connected: Record<SignalKey, Set<number>> = {
      mass44: new Set(),
      mass49: new Set(),
    };
  for (const key of keys) {
    let prev = -1;
    rows.forEach((row, i) => {
      if (row[key] === null) return;
      if (prev >= 0) {
        const span = row.time - rows[prev].time,
          nullRun = i - prev > 1;
        let kind: SignalBreak['kind'] | null = null;
        if (
          nullRun &&
          (connect === 'never' ||
            (connect !== 'always' && span > connect.threshold))
        )
          kind = 'missing';
        if (!kind && disconnect !== 'never' && span > disconnect.threshold)
          kind = 'pause';
        if (kind)
          breaks.push({
            key,
            fromIndex: prev,
            index: i,
            from: rows[prev].time,
            to: row.time,
            kind,
          });
        else for (let j = prev + 1; j < i; j++) connected[key].add(j);
      }
      prev = i;
    });
  }
  const bands = [
    ...new Map(
      breaks.map((b) => [`${b.from}-${b.to}`, { from: b.from, to: b.to }]),
    ).values(),
  ].sort((a, b) => a.from - b.from);
  const isReal = (row: SignalSample) => keys.some((k) => row[k] !== null);
  const dts: number[] = [];
  for (let i = 1; i < rows.length; i++)
    if (isReal(rows[i]) && isReal(rows[i - 1]))
      dts.push(rows[i].time - rows[i - 1].time);
  const sorted = [...dts].sort((a, b) => a - b),
    median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const min = sorted[0] ?? median,
    max = sorted[sorted.length - 1] ?? median;
  const values = rows.flatMap((row) =>
    keys.flatMap((k) => (row[k] === null ? [] : [row[k] as number])),
  );
  const positive = values.length > 1 && values.every((v) => v > 0),
    positives = values.filter((v) => v > 0);
  const notes = rows.map((row, i) => {
    if (keys.every((k) => row[k] === null)) return 'Missing sample';
    const note: string[] =
      keys.length > 1
        ? keys
            .filter((k) => row[k] === null)
            .map((k) => `Missing ${signalLabels[k]}`)
        : [];
    for (const b of breaks)
      if (b.kind === 'pause' && b.index === i) {
        const text = `After a ${(b.to - b.from).toFixed(1)} s pause`;
        if (!note.includes(text)) note.push(text);
      }
    if (log && keys.some((k) => row[k] !== null && (row[k] as number) <= 0))
      note.push('Not shown on log scale');
    return note.join(' · ');
  });
  return {
    breaks,
    bands,
    notes,
    connected,
    median,
    min,
    max,
    real: rows.filter(isReal).length,
    missing: rows.filter((row) => !isReal(row)).length,
    uneven: sorted.length > 1 && max - min > median * 0.5,
    irregular:
      sorted.length > 1 &&
      dts.filter((dt) => Math.abs(dt - median) > median * 0.5).length >
        dts.length * 0.1,
    hidden: log ? values.filter((v) => v <= 0).length : 0,
    orders: positive
      ? Math.log10(Math.max(...values) / Math.min(...values))
      : 0,
    logOrders:
      positives.length > 1
        ? Math.log10(Math.max(...positives) / Math.min(...positives))
        : 0,
  };
}

/** uPlot data: breaking nulls stay null, connected nulls become undefined (spanned), pauses get an inserted null. */
function plotData(
  rows: readonly SignalSample[],
  keys: readonly SignalKey[],
  analysis: SignalAnalysis,
  log: boolean,
): uPlot.AlignedData {
  if (!rows.length)
    return [[0, 120], ...keys.map(() => [null, null])] as uPlot.AlignedData;
  const pauses = new Map<number, Set<SignalKey>>();
  for (const b of analysis.breaks)
    if (b.kind === 'pause' && b.index - b.fromIndex === 1)
      pauses.set(b.index, (pauses.get(b.index) ?? new Set()).add(b.key));
  const xs: number[] = [],
    ys = keys.map(() => [] as (number | null | undefined)[]);
  rows.forEach((row, i) => {
    const inserted = pauses.get(i);
    if (inserted) {
      xs.push((rows[i - 1].time + row.time) / 2);
      keys.forEach((k, s) => {
        ys[s].push(inserted.has(k) ? null : undefined);
      });
    }
    xs.push(row.time);
    keys.forEach((k, s) => {
      const v = row[k];
      ys[s].push(
        v === null
          ? analysis.connected[k].has(i)
            ? undefined
            : null
          : log && v <= 0
            ? null
            : v,
      );
    });
  });
  return [xs, ...ys] as uPlot.AlignedData;
}

/** A sample with no drawable neighbour would be invisible as a line, so it is drawn as a dot. */
const isolated: uPlot.Series.Points.Filter = (u, si, show) => {
  if (show) return null;
  const ys = u.data[si],
    out: number[] = [];
  for (let k = 0; k < ys.length; k++) {
    if (ys[k] == null) continue;
    let a = k - 1,
      b = k + 1;
    while (a >= 0 && ys[a] === undefined) a--;
    while (b < ys.length && ys[b] === undefined) b++;
    if ((a < 0 || ys[a] === null) && (b >= ys.length || ys[b] === null))
      out.push(k);
  }
  return out.length ? out : null;
};

interface BandBox {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
}
function SignalPlot({
  data,
  labels,
  bands,
  limits,
  logarithmic,
  logDecades,
  points,
  height = 280,
  minimumWidth = 240,
  xLabel = 'Elapsed time (s)',
  yLabel = 'Signal (mV)',
}: {
  data: uPlot.AlignedData;
  labels: string[];
  bands: { from: number; to: number }[];
  limits?: [number, number];
  logarithmic: boolean;
  logDecades: boolean;
  points: boolean;
  height?: number;
  minimumWidth?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  const lastY = useRef<[number, number] | undefined>(undefined);
  const current = useRef({ data, bands });
  current.current = { data, bands };
  const [boxes, setBoxes] = useState<BandBox[]>([]);
  const scheme = useComputedColorScheme('light'),
    { textSize } = useAppearance();
  const hasBands = bands.length > 0;
  const create = (el: HTMLDivElement) => {
    const colors = seriesColors[scheme],
      ink = scheme === 'dark' ? '#b5c6bb' : '#53675e';
    // Band geometry comes from uPlot's own layout, so it stays correct while the chart view is hidden.
    const place = (u: uPlot) => {
      const r = uPlot.pxRatio,
        left = u.bbox.left / r,
        top = u.bbox.top / r,
        w = u.bbox.width / r,
        h = u.bbox.height / r;
      const clamp = (v: number) => Math.min(w, Math.max(0, v));
      const next = current.current.bands
        .map((b) => {
          const a = clamp(u.valToPos(b.from, 'x')),
            z = clamp(u.valToPos(b.to, 'x'));
          return {
            left: left + a,
            top,
            width: z - a,
            height: h,
            label: `No data · ${(b.to - b.from).toFixed(1)} s`,
          };
        })
        .filter((b) => b.width > 0);
      setBoxes((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    // Axis text follows the Text size setting; the axes grow with it so tick labels are not cut off.
    const s = rootTextScale(),
      font = `${11 * s}px system-ui`,
      labelFont = `${12 * s}px system-ui`;
    const yAxis: uPlot.Axis = {
      label: yLabel,
      stroke: ink,
      font,
      labelFont,
      size: 58 * s,
      labelSize: 30 * s,
      grid: { stroke: scheme === 'dark' ? '#40564a' : '#e2e8df', width: 1 },
    };
    if (logDecades)
      Object.assign(yAxis, {
        splits: (_u: uPlot, _i: number, min: number, max: number) => {
          const out: number[] = [];
          for (
            let e = Math.ceil(Math.log10(min) - 1e-9);
            e <= Math.floor(Math.log10(max) + 1e-9);
            e++
          )
            out.push(10 ** e);
          return out;
        },
        values: (_u: uPlot, splits: number[]) => splits.map(decade),
      });
    const options: uPlot.Options = {
      width: Math.max(minimumWidth, el.clientWidth),
      height,
      padding: [hasBands ? 26 : null, null, null, null],
      scales: {
        x: { time: false },
        y: {
          distr: logarithmic ? 3 : 1,
          range:
            limits ??
            ((_u, min, max) => {
              if (
                typeof min !== 'number' ||
                typeof max !== 'number' ||
                !Number.isFinite(min) ||
                !Number.isFinite(max)
              )
                return lastY.current && (!logarithmic || lastY.current[0] > 0)
                  ? lastY.current
                  : [logarithmic ? 0.1 : 0, 20];
              let next: [number, number];
              if (logarithmic && logDecades) {
                const [lo, hi] = uPlot.rangeLog(min, max, 10, true);
                next = [lo ?? min, hi ?? max];
              } else {
                const bounds = uPlot.rangeNum(min, max, 0.1, true);
                next = logarithmic
                  ? [
                      Math.max(bounds[0] ?? min, min / 2, Number.MIN_VALUE),
                      bounds[1] ?? max,
                    ]
                  : [bounds[0] ?? min, bounds[1] ?? max];
              }
              lastY.current = next;
              return next;
            }),
        },
      },
      axes: [
        {
          label: xLabel,
          stroke: ink,
          grid: { show: false },
          font,
          labelFont,
          size: 50 * s,
          labelSize: 30 * s,
        },
        yAxis,
      ],
      series: [
        { label: xLabel },
        ...labels.map((label, i) => ({
          label,
          stroke: colors[i % colors.length],
          width: 2,
          dash: i === 1 ? [6, 4] : [],
          spanGaps: false,
          value: (_u: uPlot, value: number | null) =>
            `${formatMeasurement(value)} mV`,
          points: {
            show: () => points || current.current.data[0].length === 1,
            size: points ? 4 : 5,
            fill: colors[i % colors.length],
            filter: isolated,
          },
        })),
      ],
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      hooks: { draw: [place] },
    };
    return new uPlot(options, current.current.data, el);
  };
  const update = (u: uPlot) => {
    u.setData(data);
    const xs = data[0],
      first = xs[0] ?? 0,
      last = xs[xs.length - 1] ?? 120;
    u.setScale('x', {
      min: first === last ? first - 1 : first,
      max: first === last ? last + 1 : last,
    });
    // Do not rebuild from uncommitted scales during uPlot's initial microtask; only schedule a repaint.
    u.redraw(false);
  };
  const { host, follow } = useUplotChart({
    buildFrom: [
      labels.length,
      ...labels,
      scheme,
      textSize,
      limits?.[0],
      limits?.[1],
      logarithmic,
      logDecades,
      points,
      hasBands,
      height,
      minimumWidth,
      xLabel,
      yLabel,
    ],
    create,
    size: (el) => ({ width: Math.max(minimumWidth, el.clientWidth), height }),
    update,
    updateFrom: [data, bands],
  });
  return (
    <ScrollFrame
      axes="x"
      className="dv-plot-scroll"
      tabIndex={0}
      role="region"
      aria-label={`${labels.join(', ')} · ${yLabel} by ${xLabel}. Scroll horizontally when needed.`}
    >
      <div className="dv-signal-plot" ref={follow}>
        <div
          ref={host}
          className="dv-plot"
          role="img"
          aria-label={labels.join(', ')}
        />
        {boxes.map((b) => (
          <div
            key={`${b.left}-${b.width}`}
            className="dv-gap-band"
            style={{
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
            }}
          >
            <span>{b.label}</span>
          </div>
        ))}
      </div>
    </ScrollFrame>
  );
}

/** Table rows fade through MotionList, which needs a motion component made outside render. */
const AnimatedRow = animated.create(Table.Tr);

/** The chart waits for the table to fade out before it fades in, so the two never show at once. */
const chartViewTransition = (active: boolean): Transition => ({
  duration: (active ? motion.base : motion.fast) / 1000,
  delay: active ? motion.fast / 1000 : 0,
  ease: curves.easeOut,
});

/** Keep both surfaces measurable so returning to the chart never reconstructs its canvas. */
function ChartView({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion(false, { getInitialValueInEffect: false });
  const [moving, setMoving] = useState<'enter' | 'leave'>();
  return (
    <animated.div
      className="dv-chart-view"
      data-active={active}
      data-motion={moving}
      inert={!active}
      aria-hidden={!active || undefined}
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={reduced ? { duration: 0 } : chartViewTransition(active)}
      onAnimationStart={() => setMoving(active ? 'enter' : 'leave')}
      onAnimationComplete={() => setMoving(undefined)}
    >
      {children}
    </animated.div>
  );
}

type ConnectMode = 'never' | 'always' | 'threshold';
const connectMode = (c: ConnectNulls | DisconnectAfter): ConnectMode =>
  typeof c === 'object' ? 'threshold' : c;
function ThresholdInput({
  prefix,
  label,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  prefix: string;
  label: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Group gap={6} wrap="nowrap" className="dv-threshold">
      <Text size="sm" c="dimmed" aria-hidden>
        {prefix}
      </Text>
      <TextInput
        aria-label={label}
        inputMode="decimal"
        w={84}
        value={value}
        error={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        onChange={(e) => onChange(e.currentTarget.value)}
        rightSection={
          <Text size="sm" c="dimmed" aria-hidden>
            s
          </Text>
        }
      />
    </Group>
  );
}

export function SignalChart({
  state = 'recorded',
  initialView = 'chart',
  initialFixed = false,
  initialInvalid = false,
  initialLog = false,
  rows = [],
  signals = ['mass44', 'mass49'],
  title = 'Scale and precision controls',
  caption = 'Signal voltage by elapsed time',
  sourceLabel = 'MS-01',
  connectNulls = 'never',
  disconnectAfter = 'never',
  onRetry,
}: {
  state?: ChartState;
  initialView?: 'chart' | 'table';
  initialFixed?: boolean;
  initialInvalid?: boolean;
  initialLog?: boolean;
  rows?: SignalSample[];
  /** Signals to plot and tabulate. */
  signals?: readonly SignalKey[];
  title?: string;
  /** Table caption, after the row count. */
  caption?: string;
  sourceLabel?: string;
  /** Initial "Connect null values" setting. Default 'never' breaks the line at samples marked missing. */
  connectNulls?: ConnectNulls;
  /** Initial "Disconnect values" setting. Default 'never' keeps unmarked gaps connected. */
  disconnectAfter?: DisconnectAfter;
  onRetry?: () => void;
}) {
  const [view, setView] = useState(initialView),
    [fixed, setFixed] = useState(initialFixed || initialInvalid);
  const [min, setMin] = useState<number | string>(0),
    [max, setMax] = useState<number | string>(initialInvalid ? -1 : 20);
  const [precision, setPrecision] = useState<string | null>('2'),
    [log, setLog] = useState(initialLog);
  const [recorded, setRecorded] = useState(false),
    [message, setMessage] = useState('');
  const [onlyNotes, setOnlyNotes] = useState(false);
  const connectKey = JSON.stringify(connectNulls),
    disconnectKey = JSON.stringify(disconnectAfter);
  const [connect, setConnect] = useState<ConnectMode>(
      connectMode(connectNulls),
    ),
    [disconnect, setDisconnect] = useState<ConnectMode>(
      connectMode(disconnectAfter),
    );
  const [connectDraft, setConnectDraft] = useState(
    String(typeof connectNulls === 'object' ? connectNulls.threshold : 5),
  );
  const [disconnectDraft, setDisconnectDraft] = useState(
    String(typeof disconnectAfter === 'object' ? disconnectAfter.threshold : 3),
  );
  const [connectSeconds, setConnectSeconds] = useState(
      typeof connectNulls === 'object' ? connectNulls.threshold : 5,
    ),
    [disconnectSeconds, setDisconnectSeconds] = useState(
      typeof disconnectAfter === 'object' ? disconnectAfter.threshold : 3,
    );
  // Storing information from the previous render: new initial settings from the parent reset the controls.
  const [logFor, setLogFor] = useState(initialLog);
  if (logFor !== initialLog) {
    setLogFor(initialLog);
    setLog(initialLog);
  }
  const [connectFor, setConnectFor] = useState(connectKey);
  if (connectFor !== connectKey) {
    setConnectFor(connectKey);
    setConnect(connectMode(connectNulls));
    if (typeof connectNulls === 'object') {
      setConnectDraft(String(connectNulls.threshold));
      setConnectSeconds(connectNulls.threshold);
    }
  }
  const [disconnectFor, setDisconnectFor] = useState(disconnectKey);
  if (disconnectFor !== disconnectKey) {
    setDisconnectFor(disconnectKey);
    setDisconnect(connectMode(disconnectAfter));
    if (typeof disconnectAfter === 'object') {
      setDisconnectDraft(String(disconnectAfter.threshold));
      setDisconnectSeconds(disconnectAfter.threshold);
    }
  }
  const connectInvalid =
      connect === 'threshold' && seconds(connectDraft) === null,
    disconnectInvalid =
      disconnect === 'threshold' && seconds(disconnectDraft) === null;
  const scheme = useComputedColorScheme('light'),
    errorId = useId();
  const unavailable = state === 'unavailable' && !recorded;
  const limitError =
    fixed && (typeof min !== 'number' || typeof max !== 'number' || min >= max)
      ? 'Maximum Y must be greater than minimum Y.'
      : fixed && log && Number(min) <= 0
        ? 'Logarithmic scaling requires a minimum greater than zero.'
        : undefined;
  const currentRows = useMemo(
    () =>
      state === 'empty' || unavailable
        ? []
        : state === 'missing'
          ? rows.map((row) => ({ ...row, mass44: null }))
          : rows,
    [rows, state, unavailable],
  );
  const keys = signals;
  const plotKeys = useKeyedValue(keys.join(), keys);
  const connectSetting: ConnectNulls =
    connect === 'threshold'
      ? { threshold: connectSeconds }
      : (connect as 'never' | 'always');
  const disconnectSetting: DisconnectAfter =
    disconnect === 'threshold' ? { threshold: disconnectSeconds } : 'never';
  const gaps = useKeyedValue(
    JSON.stringify([connectSetting, disconnectSetting]),
    { connect: connectSetting, disconnect: disconnectSetting },
  );
  const analysis = useMemo(
    () =>
      analyseSignal(currentRows, plotKeys, gaps.connect, gaps.disconnect, log),
    [currentRows, plotKeys, gaps, log],
  );
  const data = useMemo(
    () => plotData(currentRows, plotKeys, analysis, log),
    [currentRows, plotKeys, analysis, log],
  );
  const enteredLimits = useMemo<[number, number] | undefined>(
    () => (fixed && !limitError ? [Number(min), Number(max)] : undefined),
    [fixed, limitError, min, max],
  );
  // Storing information from the previous render: while the entry is invalid the chart keeps the last valid limits.
  const [lastLimits, setLastLimits] = useState(enteredLimits);
  if (
    enteredLimits &&
    (enteredLimits[0] !== lastLimits?.[0] || enteredLimits[1] !== lastLimits[1])
  )
    setLastLimits(enteredLimits);
  const limits = fixed ? (enteredLimits ?? lastLimits) : undefined;
  const labels = keys.map((k) => signalLabels[k]);
  const t0 = currentRows[0]?.time,
    t1 = currentRows[currentRows.length - 1]?.time;
  const summary = currentRows.length
    ? `${analysis.real} samples${analysis.missing ? ` · ${analysis.missing} missing` : ''} · ${plain(t0 as number)}–${plain(t1 as number)} s · ${analysis.uneven ? `interval varies ${analysis.min.toFixed(1)}–${analysis.max.toFixed(1)} s` : `interval ${plain(analysis.median)} s`}`
    : undefined;
  const noted = analysis.notes.filter(Boolean).length;
  const tableRows = currentRows
    .map((row, i) => ({ row, note: analysis.notes[i], index: i }))
    .filter((item) => !onlyNotes || item.note);
  return (
    <Paper className="dv-panel dv-scale-card">
      <div className="dv-panel-head">
        <div className="dv-scale-heading">
          <span className="dv-heading-icon">
            <IconAdjustmentsHorizontal size={20} aria-hidden />
          </span>
          <div>
            <Title order={2}>{title}</Title>
            <Presence show={!!summary} variant="fade">
              <Text className="dv-signal-summary">{summary}</Text>
            </Presence>
          </div>
        </div>
        <SegmentedControl
          aria-label="Data presentation"
          value={view}
          onChange={(v) => setView(v as 'chart' | 'table')}
          data={[
            {
              label: (
                <span className="dv-view-label">
                  <IconChartLine size={14} aria-hidden />
                  Chart
                </span>
              ),
              value: 'chart',
            },
            {
              label: (
                <span className="dv-view-label">
                  <IconTable size={14} aria-hidden />
                  Table
                </span>
              ),
              value: 'table',
            },
          ]}
        />
      </div>
      <div className="dv-plot-surface dv-stack">
        <Swap sequential swapKey={view} className="dv-signal-toolbar">
          {view === 'chart' ? (
            <div className="dv-legend">
              {labels.map((label, i) => (
                <span key={label}>
                  <i
                    style={{
                      borderColor: seriesColors[scheme][i],
                      borderTopStyle: i ? 'dashed' : 'solid',
                    }}
                  />
                  {label} <span className="dv-muted">mV</span>
                  {state === 'missing' && keys[i] === 'mass44'
                    ? ' · missing'
                    : ''}
                </span>
              ))}
              {analysis.bands.length > 0 && (
                <span>
                  <i className="dv-legend-gap" />
                  No data
                </span>
              )}
              {analysis.irregular && (
                <span>
                  <i
                    className="dv-legend-sample"
                    style={{ background: seriesColors[scheme][0] }}
                  />
                  Sample
                </span>
              )}
            </div>
          ) : (
            <Checkbox
              size="sm"
              label="Only rows with notes"
              checked={onlyNotes}
              onChange={(event) => setOnlyNotes(event.currentTarget.checked)}
            />
          )}
        </Swap>
        <Presence
          show={
            state === 'stale' ||
            state === 'missing' ||
            unavailable ||
            !!message ||
            (view === 'chart' &&
              (analysis.hidden > 0 || (!log && analysis.orders >= 4)))
          }
        >
          <Swap
            sequential
            swapKey={`${state}-${message}-${analysis.hidden}-${log}`}
          >
            <StatusMessages
              announce={!!message}
              messages={[
                state === 'stale' && {
                  severity: 'warning',
                  text: 'Connection interrupted. Previously received samples remain visible.',
                },
                state === 'missing' && {
                  severity: 'error',
                  text: 'Unavailable · Mass 44 is missing. Mass 49 remains available.',
                },
                unavailable && {
                  severity: 'error',
                  text: `${sourceLabel} · Mass 44 and Mass 49 are unavailable.`,
                },
                !!message && { severity: 'info', text: message },
                view === 'chart' &&
                  analysis.hidden > 0 && {
                    severity: 'info',
                    text: `The log scale can’t show ${analysis.hidden} sample${analysis.hidden === 1 ? '' : 's'} at or below 0 mV, so the line breaks there. The table lists them.`,
                  },
                view === 'chart' &&
                  !log &&
                  analysis.orders >= 4 && {
                    severity: 'info',
                    text: `Values span about ${Math.round(analysis.orders)} orders of magnitude. Switch to a log scale to see the low end.`,
                  },
              ]}
              action={
                unavailable ? (
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      variant="default"
                      onClick={() => {
                        onRetry?.();
                        setMessage(
                          'Display retry requested. Acquisition was not restarted.',
                        );
                      }}
                    >
                      Retry
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="default"
                      disabled={!rows.length}
                      onClick={() => {
                        setRecorded(true);
                        setMessage(
                          'Recorded example selected. The live source remains unavailable.',
                        );
                      }}
                    >
                      Open recorded example
                    </Button>
                  </Group>
                ) : undefined
              }
            />
          </Swap>
        </Presence>
        <div className="dv-chart-views">
          <ChartView active={view === 'chart'}>
            <div style={{ position: 'relative' }}>
              <SignalPlot
                data={data}
                labels={labels}
                bands={analysis.bands}
                limits={limits}
                logarithmic={log}
                logDecades={log && analysis.logOrders >= 2}
                points={analysis.irregular}
              />
              <Presence
                show={!currentRows.length}
                variant="fade"
                className="dv-chart-empty"
              >
                <Text fw={600}>
                  {unavailable ? 'Signal unavailable' : 'No samples yet'}
                </Text>
                <Text size="sm" c="dimmed">
                  {unavailable
                    ? `No display samples from ${sourceLabel}.`
                    : 'This recording contains no signal samples.'}
                </Text>
              </Presence>
            </div>
          </ChartView>
          <ChartView active={view === 'table'}>
            <ScrollFrame
              className="dv-table-frame"
              style={{ height: 280 }}
              tabIndex={0}
              role="region"
              aria-label="Signal sample table"
            >
              <Table striped highlightOnHover>
                <Table.Caption>
                  {onlyNotes ? `${noted} of ` : ''}
                  {currentRows.length} original rows · {caption}
                </Table.Caption>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Elapsed (s)</Table.Th>
                    {labels.map((label) => (
                      <Table.Th key={label}>{label} (mV)</Table.Th>
                    ))}
                    <Table.Th className="dv-signal-note">Note</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <MotionList>
                    {tableRows.map(({ row, note, index }) => (
                      <AnimatedRow key={`${row.time}-${index}`}>
                        <Table.Td>
                          {row.time.toFixed(analysis.irregular ? 2 : 1)}
                        </Table.Td>
                        {keys.map((k) => (
                          <Table.Td key={k}>
                            {formatMeasurement(row[k], Number(precision))}
                          </Table.Td>
                        ))}
                        <Table.Td
                          className="dv-signal-note"
                          data-noted={note ? true : undefined}
                        >
                          {note}
                        </Table.Td>
                      </AnimatedRow>
                    ))}
                    {!tableRows.length && (
                      <AnimatedRow key="empty">
                        <Table.Td colSpan={keys.length + 2}>
                          {onlyNotes && currentRows.length
                            ? 'No rows have notes.'
                            : 'No samples in this range.'}
                        </Table.Td>
                      </AnimatedRow>
                    )}
                  </MotionList>
                </Table.Tbody>
              </Table>
            </ScrollFrame>
          </ChartView>
        </div>
      </div>
      <div className="dv-controls">
        <Group justify="space-between">
          <Text size="sm" fw={650}>
            Vertical axis
          </Text>
          <Text size="xs" c="dimmed">
            Display only
          </Text>
        </Group>
        <Select
          label="Y-axis limits"
          value={fixed ? 'fixed' : 'auto'}
          onChange={(v) => setFixed(v === 'fixed')}
          allowDeselect={false}
          data={[
            { label: 'Auto scale', value: 'auto' },
            { label: 'Fixed limits', value: 'fixed' },
          ]}
        />
        <div className="dv-input-grid">
          <NumberInput
            label="Minimum Y (mV)"
            value={min}
            onChange={setMin}
            disabled={!fixed}
            aria-invalid={!!limitError}
            aria-describedby={limitError ? errorId : undefined}
          />
          <NumberInput
            label="Maximum Y (mV)"
            value={max}
            onChange={setMax}
            disabled={!fixed}
            aria-invalid={!!limitError}
            aria-describedby={limitError ? errorId : undefined}
          />
        </div>
        <Group justify="space-between" align="end">
          <Checkbox
            label="Logarithmic Y-axis"
            checked={log}
            onChange={(event) => setLog(event.currentTarget.checked)}
          />
          <Select
            label="Decimal places"
            w={140}
            allowDeselect={false}
            value={precision}
            onChange={setPrecision}
            data={['1', '2', '3']}
          />
        </Group>
        <div className="dv-gap-settings">
          <Select
            label="Connect null values"
            w={170}
            allowDeselect={false}
            value={connect}
            onChange={(v) => setConnect(v as ConnectMode)}
            data={[
              { label: 'Never', value: 'never' },
              { label: 'Always', value: 'always' },
              { label: 'Threshold', value: 'threshold' },
            ]}
          />
          <Presence show={connect === 'threshold'}>
            <ThresholdInput
              prefix="Up to"
              label="Connect null values threshold"
              value={connectDraft}
              invalid={connectInvalid}
              describedBy={errorId}
              onChange={(text) => {
                setConnectDraft(text);
                const n = seconds(text);
                if (n !== null) setConnectSeconds(n);
              }}
            />
          </Presence>
          <Select
            label="Disconnect values"
            w={170}
            allowDeselect={false}
            value={disconnect}
            onChange={(v) => setDisconnect(v as ConnectMode)}
            data={[
              { label: 'Never', value: 'never' },
              { label: 'Threshold', value: 'threshold' },
            ]}
          />
          <Presence show={disconnect === 'threshold'}>
            <ThresholdInput
              prefix="Over"
              label="Disconnect values threshold"
              value={disconnectDraft}
              invalid={disconnectInvalid}
              describedBy={errorId}
              onChange={(text) => {
                setDisconnectDraft(text);
                const n = seconds(text);
                if (n !== null) setDisconnectSeconds(n);
              }}
            />
          </Presence>
        </div>
        <Presence show={!!limitError || connectInvalid || disconnectInvalid}>
          <div id={errorId}>
            <StatusMessages
              messages={[
                !!limitError && { severity: 'error', text: limitError! },
                connectInvalid && {
                  severity: 'error',
                  text: `Enter a number of seconds above 0 for Connect null values. The chart keeps ${plain(connectSeconds)} s.`,
                },
                disconnectInvalid && {
                  severity: 'error',
                  text: `Enter a number of seconds above 0 for Disconnect values. The chart keeps ${plain(disconnectSeconds)} s.`,
                },
              ]}
            />
          </div>
        </Presence>
        <Text size="xs" c="dimmed">
          A logarithmic axis changes spacing. A logarithm in a formula changes
          the calculated quantity.
        </Text>
      </div>
    </Paper>
  );
}

/** One sample of a single signal for `SignalTrace`; `null` marks a missing sample. */
export interface TracePoint {
  time: number;
  value: number | null;
}

/**
 * Line segments for a trace, following the same rules as the full chart: a missing sample breaks the line unless
 * `connectNulls` allows it, and consecutive samples further apart than `disconnectAfter` are not joined.
 */
export function traceSegments(
  points: readonly TracePoint[],
  connectNulls: ConnectNulls = 'never',
  disconnectAfter: DisconnectAfter = 'never',
) {
  const segments: TracePoint[][] = [];
  let current: TracePoint[] = [],
    last: TracePoint | null = null,
    skipped = false;
  for (const point of points) {
    if (point.value === null) {
      skipped = true;
      continue;
    }
    if (last) {
      const span = point.time - last.time;
      const missing =
        skipped &&
        (connectNulls === 'never' ||
          (connectNulls !== 'always' && span > connectNulls.threshold));
      const pause =
        disconnectAfter !== 'never' && span > disconnectAfter.threshold;
      if (missing || pause) {
        segments.push(current);
        current = [];
      }
    }
    current.push(point);
    last = point;
    skipped = false;
  }
  if (current.length) segments.push(current);
  return segments;
}

/**
 * Plot geometry from the approved mockups, in px. The mockups draw at `width`; wider cards stretch the plot area
 * and keep the margins, the height and the 9 px labels.
 */
const traceFrames = {
  /** right-sidebar-review.html `.live-plot`: the last 30 s of a live stream. */
  live: {
    width: 214,
    height: 100,
    left: 30,
    top: 18,
    right: 10,
    plotHeight: 58,
  },
  /** sticky-playback-review.html `.playback-plot`: the whole recording with a playhead. */
  playback: {
    width: 260,
    height: 145,
    left: 38,
    top: 18,
    right: 12,
    plotHeight: 85,
  },
} as const;

const tick = (v: number) =>
  Number(v.toFixed(3)).toLocaleString('en-US', { maximumFractionDigits: 3 });

/**
 * A compact chart of one signal for workspace cards: the live stream card (last 30 s) or the playback card
 * (whole recording, with a playhead at `cursor`). Gaps follow `connectNulls` and `disconnectAfter`.
 * It fills the card's width and redraws when the card resizes.
 */
export function SignalTrace({
  variant,
  points,
  min,
  max,
  unit,
  label,
  from,
  to,
  cursor,
  color,
  connectNulls = 'never',
  disconnectAfter = 'never',
}: {
  variant: 'live' | 'playback';
  points: readonly TracePoint[];
  /** Vertical range. */
  min: number;
  max: number;
  unit: string;
  /** Accessible description of the chart. */
  label: string;
  /** Horizontal range in seconds. Defaults to the first and last sample. */
  from?: number;
  to?: number;
  /** Playback position in seconds (playback only). */
  cursor?: number;
  /** Line colour; defaults to the current text colour. */
  color?: string;
  connectNulls?: ConnectNulls;
  disconnectAfter?: DisconnectAfter;
}) {
  const f = traceFrames[variant],
    { textSize } = useAppearance(),
    scale = textScales[textSize];
  const [ref, measured] = useElementWidth<SVGSVGElement>(f.width);
  const width = Math.max(f.width, measured) / scale,
    plotWidth = width - f.left - f.right,
    end = f.left + plotWidth;
  const t0 = from ?? points[0]?.time ?? 0,
    t1 = to ?? points[points.length - 1]?.time ?? 1,
    span = t1 - t0 || 1;
  const x = (t: number) => ((t - t0) / span) * plotWidth,
    y = (v: number) => ((max - v) / (max - min || 1)) * f.plotHeight;
  const visible = points.filter((p) => p.time >= t0 && p.time <= t1);
  const path = traceSegments(visible, connectNulls, disconnectAfter)
    .map((seg) =>
      seg
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${x(p.time).toFixed(2)},${y(p.value as number).toFixed(2)}`,
        )
        .join(' '),
    )
    .join(' ');
  const style = color ? { color } : undefined;
  const mid = f.left + plotWidth / 2;
  if (variant === 'live')
    return (
      <svg
        ref={ref}
        className="dv-trace"
        data-variant="live"
        viewBox={`0 0 ${width} ${f.height}`}
        role="img"
        aria-label={label}
        style={style}
      >
        <text x={f.left} y="10">
          {unit}
        </text>
        <g transform={`translate(${f.left},${f.top})`}>
          <path
            className="dv-trace-grid"
            d={`M0 0H${plotWidth}M0 29H${plotWidth}M0 58H${plotWidth}`}
          />
          <path className="dv-trace-line" d={path} />
        </g>
        <text x="0" y="22">
          {tick(max)}
        </text>
        <text x="0" y="78">
          {tick(min)}
        </text>
        <text x={f.left} y="94">
          −30
        </text>
        <text x={mid} y="94" textAnchor="middle">
          −15
        </text>
        <text x={end} y="94" textAnchor="end">
          0 s
        </text>
      </svg>
    );
  const at =
    cursor === undefined
      ? null
      : visible.reduce<TracePoint | null>(
          (best, p) =>
            p.value !== null &&
            p.time <= cursor &&
            (!best || p.time >= best.time)
              ? p
              : best,
          null,
        );
  const cx =
    cursor === undefined ? 0 : f.left + x(Math.min(t1, Math.max(t0, cursor)));
  return (
    <svg
      ref={ref}
      className="dv-trace"
      data-variant="playback"
      viewBox={`0 0 ${width} ${f.height}`}
      role="img"
      aria-label={label}
      style={style}
    >
      <text x={f.left} y="10">
        {unit}
      </text>
      <path
        className="dv-trace-grid"
        d={`M${f.left} 18H${end}M${f.left} 60.5H${end}M${f.left} 103H${end}`}
      />
      <text x="4" y="21">
        {tick(max)}
      </text>
      <text x="4" y="63">
        {tick((max + min) / 2)}
      </text>
      <text x="4" y="106">
        {tick(min)}
      </text>
      <path
        className="dv-trace-line"
        transform={`translate(${f.left},${f.top})`}
        d={path}
      />
      {cursor !== undefined && (
        <>
          <line
            className="dv-trace-playhead"
            x1={cx.toFixed(1)}
            x2={cx.toFixed(1)}
            y1="18"
            y2="103"
          />
          {at && (
            <circle
              className="dv-trace-dot"
              cx={cx.toFixed(1)}
              cy={(f.top + y(at.value as number)).toFixed(1)}
              r="3"
            />
          )}
        </>
      )}
      <text x={f.left} y="120">
        {tick(t0)}
      </text>
      <text x={mid} y="120" textAnchor="middle">
        {tick((t0 + t1) / 2)}
      </text>
      <text x={end} y="120" textAnchor="end">
        {tick(t1)}
      </text>
      <text x={mid} y="140" textAnchor="middle">
        Time (s)
      </text>
    </svg>
  );
}
