import {
  IconActivity,
  IconArrowsMove,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDeviceAnalytics,
  IconGripVertical,
  IconPlayerStop,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  Ref,
} from 'react';
import { Chip } from './Chip';
import { keyedBy } from './keyedBy';
import './AcquisitionControls.css';

/** `inputs` is a settings panel (labelled quantity fields); `controls` holds the recording controls. */
export type PresetPanelKind =
  | 'line'
  | 'scatter'
  | 'readout'
  | 'table'
  | 'inputs'
  | 'controls';
/** Panel widths snap to these column counts on the 12-column builder. */
export type PanelSpan = 3 | 4 | 6 | 8 | 12;

export interface PresetPanel {
  id: string;
  title: string;
  kind: PresetPanelKind;
  span: PanelSpan;
  /** Signals shown. For an XY scatter this holds the single Y signal. */
  signals: string[];
  /** X signal for an XY scatter; null for every other kind. */
  x: string | null;
  /** Settings panel only: the settings shown, as SETTING_FIELDS keys. */
  fields?: string[];
  /** Recording controls only: the controls shown, as RECORDING_CONTROLS keys. */
  controls?: string[];
}

export const PANEL_KINDS: Record<PresetPanelKind, string> = {
  line: 'Time series',
  scatter: 'XY scatter',
  readout: 'Readout',
  table: 'Table',
  inputs: 'Settings',
  controls: 'Recording controls',
};
export const SNAPS: readonly PanelSpan[] = [3, 4, 6, 8, 12];
export const WIDTH_NAMES: Record<PanelSpan, string> = {
  3: 'Quarter',
  4: 'Third',
  6: 'Half',
  8: 'Two thirds',
  12: 'Full',
};
export const MIN_SPAN: Record<PresetPanelKind, PanelSpan> = {
  line: 4,
  scatter: 4,
  table: 4,
  readout: 3,
  inputs: 3,
  controls: 4,
};
export const MIN_WORD: Record<PresetPanelKind, string> = {
  line: 'a chart',
  scatter: 'a chart',
  table: 'a table',
  readout: 'a readout',
  inputs: 'a settings panel',
  controls: 'recording controls',
};
export const DEFAULT_SIGNALS = [
  'Mass 28',
  'Mass 32',
  'Mass 44',
  'Mass 45',
  'Mass 47',
  'Mass 49',
];
const NAME_PROBLEM = 'Enter a panel name.';

/** Sample settings a settings panel can show. Values are display text, as typed in the approved quantity input. */
export const SETTING_FIELDS: Record<
  string,
  { label: string; value: string; unit: string }
> = {
  zero: { label: 'Zero offset', value: '0.25', unit: 'mV' },
  span: { label: 'Span signal', value: '412.6', unit: 'mV' },
  standard: { label: 'Standard concentration', value: '400', unit: 'ppm' },
  noise: { label: 'Noise floor', value: '2.5e-4', unit: 'mV' },
  temperature: { label: 'Chamber temperature', value: '25', unit: '°C' },
  flow: { label: 'Flow rate', value: '0.5', unit: 'L/min' },
};
/** Controls a recording-controls panel can show. The status word is always shown. */
export const RECORDING_CONTROLS: Record<string, string> = {
  start: 'Start and stop',
  instrument: 'Instrument connection',
  samples: 'Sample count',
  elapsed: 'Elapsed time',
};

/** Charts, readouts and tables show signals; settings and recording controls do not. */
export const showsSignals = (kind: PresetPanelKind) =>
  kind !== 'inputs' && kind !== 'controls';

export const panelName = (panel: PresetPanel) =>
  panel.title || 'Untitled panel';

export function panelProblems(panel: PresetPanel): string[] {
  const out: string[] = [];
  if (!panel.title.trim()) out.push(NAME_PROBLEM);
  if (panel.kind === 'inputs') {
    if (!panel.fields?.length) out.push('Choose at least one setting.');
  } else if (panel.kind === 'controls') {
    if (!panel.controls?.length) out.push('Choose at least one control.');
  } else if (panel.kind === 'scatter') {
    if (!panel.x || !panel.signals.length)
      out.push('Choose a signal for each axis.');
    else if (panel.signals.includes(panel.x))
      out.push('Use different signals for the X and Y axes.');
  } else if (!panel.signals.length) out.push('Choose at least one signal.');
  return out;
}
export const signalProblem = (panel: PresetPanel) =>
  panelProblems(panel).find((problem) => problem !== NAME_PROBLEM);

export function snapSpan(raw: number, min: PanelSpan): PanelSpan {
  const allowed = SNAPS.filter((span) => span >= min);
  let best = allowed[0];
  for (const span of allowed)
    if (Math.abs(span - raw) < Math.abs(best - raw)) best = span;
  return best;
}

/** Series colour for a signal, by its position in the editor's signal list. */
export const seriesColor = (signals: readonly string[], signal: string) =>
  `var(--dv-s${(Math.max(0, signals.indexOf(signal)) % 6) + 1})`;

// Deterministic sample data: previews show the layout, not a recording.
const seriesCache = new Map<number, [number, number][]>();
function sampleSeries(signals: readonly string[], signal: string) {
  const k = Math.max(0, signals.indexOf(signal));
  let rows = seriesCache.get(k);
  if (!rows) {
    rows = Array.from({ length: 61 }, (_, i) => {
      const t = i * 5;
      return [
        t,
        120 +
          k * 35 +
          (40 - k * 4) * Math.sin(t / (45 + k * 9) + k) +
          12 * Math.sin(t / 11 + k * 2),
      ] as [number, number];
    });
    seriesCache.set(k, rows);
  }
  return rows;
}

function GridLines() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M0 ${i * 37.5}H300`}
          stroke="var(--dv-line)"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

function YAxis({ hi, lo }: { hi: number; lo: number }) {
  return (
    <div className="pe-yaxis" aria-hidden="true">
      <span>{Math.round(hi)}</span>
      <span>{Math.round((hi + lo) / 2)}</span>
      <span>{Math.round(lo)} mV</span>
    </div>
  );
}

/** Read-only preview of what a panel will show, drawn with sample data. */
export function PanelPreview({
  panel,
  signals,
}: {
  panel: PresetPanel;
  signals: readonly string[];
}) {
  const problem = signalProblem(panel);
  if (problem) return <div className="pe-panel-empty">{problem}</div>;
  if (panel.kind === 'inputs') {
    // Looks like the approved quantity input, but inert: the editor arranges panels, it does not take values.
    return (
      <div className="pe-settings">
        {Object.entries(SETTING_FIELDS)
          .filter(([key]) => panel.fields?.includes(key))
          .map(([key, field]) => (
            <div key={key} className="pe-setting">
              <span className="pe-setting-label">{field.label}</span>
              <span className="pe-qty">
                <span className="pe-qty-value">{field.value}</span>
                <span className="pe-qty-unit">
                  {field.unit}
                  <IconChevronDown aria-hidden />
                </span>
              </span>
            </div>
          ))}
      </div>
    );
  }
  if (panel.kind === 'controls') {
    // The acquisition bar from AcquisitionControls, drawn while acquiring. Nothing in it can be pressed.
    const has = (key: string) => panel.controls?.includes(key);
    return (
      <div className="pe-controls dv-acq-bar" aria-hidden="true">
        <div className="dv-acq-meta">
          <span className="dv-acq-tag" data-state="acquiring">
            <IconActivity aria-hidden />
            Acquiring
          </span>
          {has('instrument') && (
            <Chip icon={<IconDeviceAnalytics aria-hidden />}>
              MS-01 · Connected
            </Chip>
          )}
          {has('samples') && (
            <Chip icon={<IconActivity aria-hidden />}>87 samples</Chip>
          )}
          {has('elapsed') && (
            <Chip icon={<IconClock aria-hidden />}>00:43</Chip>
          )}
        </div>
        {has('start') && (
          <span className="dv-acq-button">
            <IconPlayerStop aria-hidden />
            Stop acquisition
          </span>
        )}
      </div>
    );
  }
  if (panel.kind === 'line') {
    const all = panel.signals.flatMap((signal) =>
      sampleSeries(signals, signal).map((row) => row[1]),
    );
    const lo = Math.min(...all) - 10,
      hi = Math.max(...all) + 10,
      y = (v: number) => 150 - ((v - lo) / (hi - lo)) * 150;
    return (
      <>
        <div className="pe-legend">
          {panel.signals.map((signal) => (
            <span key={signal}>
              <i style={{ borderColor: seriesColor(signals, signal) }} />
              {signal}
            </span>
          ))}
        </div>
        <div className="pe-plot-wrap">
          <YAxis hi={hi} lo={lo} />
          <svg
            className="pe-plot"
            viewBox="0 0 300 150"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <GridLines />
            {panel.signals.map((signal) => (
              <polyline
                key={signal}
                fill="none"
                stroke={seriesColor(signals, signal)}
                strokeWidth={1.8}
                vectorEffect="non-scaling-stroke"
                points={sampleSeries(signals, signal)
                  .map(([t, v]) => `${t.toFixed(1)},${y(v).toFixed(1)}`)
                  .join(' ')}
              />
            ))}
          </svg>
        </div>
        <div className="pe-axis" aria-hidden="true">
          <span>0 s</span>
          <span>Elapsed time</span>
          <span>300 s</span>
        </div>
      </>
    );
  }
  if (panel.kind === 'scatter') {
    const xSignal = panel.x!,
      ySignal = panel.signals[0];
    const xs = sampleSeries(signals, xSignal).map((row) => row[1]),
      ys = sampleSeries(signals, ySignal).map((row) => row[1]);
    const xl = Math.min(...xs),
      xh = Math.max(...xs),
      yl = Math.min(...ys),
      yh = Math.max(...ys);
    const toX = (v: number) => 8 + ((v - xl) / (xh - xl)) * 284,
      toY = (v: number) => 142 - ((v - yl) / (yh - yl)) * 134;
    const n = xs.length,
      mx = xs.reduce((a, b) => a + b) / n,
      my = ys.reduce((a, b) => a + b) / n;
    const slope =
        xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) /
        xs.reduce((a, x) => a + (x - mx) ** 2, 0),
      intercept = my - slope * mx;
    const color = seriesColor(signals, ySignal);
    return (
      <>
        <div className="pe-legend">
          <span>
            <i style={{ borderColor: color }} />
            {ySignal} against {xSignal}
          </span>
          <span>
            <i
              style={{ borderColor: 'var(--dv-ink)', borderTopStyle: 'dashed' }}
            />
            Linear fit
          </span>
        </div>
        <div className="pe-plot-wrap">
          <YAxis hi={yh} lo={yl} />
          <svg
            className="pe-plot"
            viewBox="0 0 300 150"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <GridLines />
            {keyedBy(xs, (x) => `${x}`).map(({ key, item: x, index }) => (
              <path
                key={key}
                className="pe-point"
                d={`M${toX(x).toFixed(1)} ${toY(ys[index]).toFixed(1)}h0`}
                stroke={color}
                strokeWidth={5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              className="pe-fit"
              d={`M${toX(xl)} ${toY(slope * xl + intercept)}L${toX(xh)} ${toY(slope * xh + intercept)}`}
              stroke="var(--dv-ink)"
              strokeDasharray="5 4"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="pe-axis" aria-hidden="true">
          <span>{Math.round(xl)}</span>
          <span>{xSignal} (mV)</span>
          <span>{Math.round(xh)}</span>
        </div>
      </>
    );
  }
  if (panel.kind === 'readout') {
    return (
      <div className="pe-readout">
        {panel.signals.map((signal) => (
          <div key={signal}>
            <small>{signal}</small>
            <strong>
              {sampleSeries(signals, signal)[60][1].toFixed(2)}
              <em>mV</em>
            </strong>
          </div>
        ))}
      </div>
    );
  }
  const first = sampleSeries(signals, panel.signals[0]);
  return (
    <table className="pe-mini-table" aria-hidden="true">
      <thead>
        <tr>
          <th>Time (s)</th>
          {panel.signals.map((signal) => (
            <th key={signal}>{signal} (mV)</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[40, 41, 42, 43, 44].map((row) => (
          <tr key={row}>
            <td>{first[row][0]}</td>
            {panel.signals.map((signal) => (
              <td key={signal}>
                {sampleSeries(signals, signal)[row][1].toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface PanelCardProps {
  panel: PresetPanel;
  index: number;
  total: number;
  signals: readonly string[];
  /** Width shown, which differs from panel.span while resizing. */
  span: PanelSpan;
  selected?: boolean;
  lifted?: boolean;
  resizing?: { limited: boolean } | null;
  hover?: 'grip' | 'resize' | null;
  ghost?: boolean;
  /** Ghost only: the pointer is outside the builder. */
  cancelling?: boolean;
  helpId?: string;
  ref?: Ref<HTMLElement>;
  onSelect?: () => void;
  onGripPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onGripKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onGripBlur?: () => void;
  onShift?: (direction: -1 | 1) => void;
  onRemove?: () => void;
  onResizePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** One panel on the builder: grip, toolbar, preview and right-edge resize handle. The ghost variant is a visual copy only. */
export function PanelCard({
  panel,
  index,
  total,
  signals,
  span,
  selected = false,
  lifted = false,
  resizing = null,
  hover = null,
  ghost = false,
  cancelling = false,
  helpId,
  ref,
  onSelect,
  onGripPointerDown,
  onGripKeyDown,
  onGripBlur,
  onShift,
  onRemove,
  onResizePointerDown,
  onResizeKeyDown,
}: PanelCardProps) {
  const name = panelName(panel),
    invalid = panelProblems(panel).length > 0;
  const tab = ghost ? -1 : undefined;
  return (
    <article
      ref={ref}
      className={ghost ? 'pe-panel pe-ghost' : 'pe-panel'}
      data-id={ghost ? undefined : panel.id}
      data-span={span}
      style={ghost ? undefined : { gridColumn: `span ${span}` }}
      data-selected={!ghost && selected}
      data-lifted={lifted}
      data-resizing={!!resizing}
      data-invalid={invalid || undefined}
      data-cancel={cancelling || undefined}
      aria-hidden={ghost || undefined}
      inert={ghost || undefined}
      aria-label={
        ghost
          ? undefined
          : `${name}, ${PANEL_KINDS[panel.kind]}, ${WIDTH_NAMES[span].toLowerCase()} width, position ${index + 1} of ${total}`
      }
      onClick={
        ghost
          ? undefined
          : (event) => {
              if (!(event.target as Element).closest('button, [role="slider"]'))
                onSelect?.();
            }
      }
      onFocus={ghost ? undefined : onSelect}
    >
      {cancelling && (
        <span className="pe-ghost-badge">
          <IconX aria-hidden />
          Release to cancel
        </span>
      )}
      {lifted && (
        <span className="pe-move-badge">
          <IconArrowsMove aria-hidden />
          Position {index + 1} of {total}
        </span>
      )}
      {resizing && (
        <span
          className="pe-size-badge"
          data-limit={resizing.limited || undefined}
        >
          {resizing.limited
            ? `Minimum width for ${MIN_WORD[panel.kind]}`
            : `${WIDTH_NAMES[span]} · ${span} of 12 columns`}
        </span>
      )}
      <div className="pe-panel-head">
        <button
          type="button"
          className="pe-tool pe-grip"
          data-grip={ghost ? undefined : panel.id}
          aria-label={`Move ${name}`}
          aria-describedby={ghost ? undefined : helpId}
          aria-pressed={lifted}
          data-hover={hover === 'grip' || undefined}
          tabIndex={tab}
          onPointerDown={onGripPointerDown}
          onKeyDown={onGripKeyDown}
          onBlur={onGripBlur}
        >
          <IconGripVertical aria-hidden />
        </button>
        <h3 title={name}>{name}</h3>
        <div className="pe-tools">
          <button
            type="button"
            className="pe-tool"
            data-shift={ghost ? undefined : panel.id}
            data-dir="-1"
            aria-label={`Move ${name} earlier`}
            disabled={index === 0}
            tabIndex={tab}
            onClick={() => onShift?.(-1)}
          >
            <IconChevronLeft aria-hidden />
          </button>
          <button
            type="button"
            className="pe-tool"
            data-shift={ghost ? undefined : panel.id}
            data-dir="1"
            aria-label={`Move ${name} later`}
            disabled={index === total - 1}
            tabIndex={tab}
            onClick={() => onShift?.(1)}
          >
            <IconChevronRight aria-hidden />
          </button>
          <button
            type="button"
            className="pe-tool"
            aria-label={`Remove ${name}`}
            tabIndex={tab}
            onClick={onRemove}
          >
            <IconTrash aria-hidden />
          </button>
        </div>
      </div>
      <PanelPreview panel={panel} signals={signals} />
      {!ghost && (
        <div
          tabIndex={0}
          className="pe-resize"
          data-resize={panel.id}
          role="slider"
          aria-label={`Width of ${name}`}
          aria-valuemin={MIN_SPAN[panel.kind]}
          aria-valuemax={12}
          aria-valuenow={span}
          aria-valuetext={`${WIDTH_NAMES[span]} width`}
          data-hover={hover === 'resize' || undefined}
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
        />
      )}
    </article>
  );
}
