import { useComputedColorScheme } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import { useAppearance } from '../appearance';
import { rootTextScale } from '../textSize';
import { Banner } from './Banner';
import { StatusWord } from './Chip';
import './Approved.css';
import './CalibrationCurve.css';
import { ScrollFrame } from './ScrollFrame';

export interface CalibrationStandard {
  id: string;
  /** Concentration in µmol/mol. */
  concentration: number;
  /** Mean signal in mV; null when the standard has no reading yet. */
  signal: number | null;
  excluded?: boolean;
}
export interface CalibrationFitResult {
  n: number;
  slope?: number;
  intercept?: number;
  r2?: number;
}
export type CalibrationStatus = 'Included' | 'Excluded' | 'No reading';

/** Ordinary least squares over included standards that have a reading. Illustrative, not a validated method. */
export function fitCalibration(
  standards: readonly CalibrationStandard[],
): CalibrationFitResult {
  const points = standards.filter(
    (p) => !p.excluded && p.signal !== null,
  ) as (CalibrationStandard & { signal: number })[];
  const n = points.length;
  if (n < 2) return { n };
  const mx = points.reduce((a, p) => a + p.concentration, 0) / n,
    my = points.reduce((a, p) => a + p.signal, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.concentration - mx) ** 2, 0);
  if (sxx === 0) return { n };
  const sxy = points.reduce(
    (a, p) => a + (p.concentration - mx) * (p.signal - my),
    0,
  );
  const slope = sxy / sxx,
    intercept = my - slope * mx;
  const ssr = points.reduce(
    (a, p) => a + (p.signal - (slope * p.concentration + intercept)) ** 2,
    0,
  );
  const sst = points.reduce((a, p) => a + (p.signal - my) ** 2, 0);
  return { n, slope, intercept, r2: sst === 0 ? 1 : 1 - ssr / sst };
}
export function calibrationStatus(p: CalibrationStandard): CalibrationStatus {
  return p.signal === null
    ? 'No reading'
    : p.excluded
      ? 'Excluded'
      : 'Included';
}

const fixed = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : (Object.is(v, -0) ? 0 : v).toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
/** Smallest 1/1.5/2/2.5/3/5 × 10ⁿ step giving about six ticks that cover the value. */
function niceTop(value: number, ticks = 6): { top: number; step: number } {
  if (!(value > 0)) return { top: 1, step: 0.2 };
  const raw = value / ticks,
    p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 5, 10]
    .map((k) => k * p)
    .find((s) => s >= raw)!;
  return { top: Math.ceil(value / step) * step, step };
}
const statusIcon: Record<CalibrationStatus, typeof IconCircleCheck> = {
  Included: IconCircleCheck,
  Excluded: IconCircleX,
  'No reading': IconAlertTriangle,
};
const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

export function CalibrationCurve({
  title = 'CO₂ calibration · Mass 44',
  caption = 'Calibration standards for CO₂ · Mass 44',
  standards = [],
  axisMax,
  initialView = 'chart',
}: {
  title?: string;
  caption?: string;
  standards?: CalibrationStandard[];
  /** Fixed axis tops (µmol/mol, mV), e.g. the calibrated range. Omit to fit the standards. */
  axisMax?: { concentration: number; signal: number };
  initialView?: 'chart' | 'table';
}) {
  const [view, setView] = useState(initialView);
  // Storing information from the previous render: a new initialView from the parent switches the view.
  const [viewFor, setViewFor] = useState(initialView);
  if (viewFor !== initialView) {
    setViewFor(initialView);
    setView(initialView);
  }
  const titleId = useId(),
    summaryId = useId(),
    captionId = useId();
  const fit = useMemo(() => fitCalibration(standards), [standards]);
  const hasFit = fit.slope !== undefined;
  const used = standards.filter((p) => !p.excluded && p.signal !== null).length;
  const intercept = fit.intercept ?? 0;
  const summary = hasFit
    ? `Linear fit: signal = ${fixed(fit.slope, 4)} × concentration ${intercept < 0 ? '−' : '+'} ${fixed(Math.abs(intercept), 2)} mV · R² = ${fixed(fit.r2, 4)} · ${used} of ${standards.length} standards used`
    : `No fit · ${used} of ${standards.length} standards have a usable reading`;
  const hasExcluded = standards.some((p) => p.excluded && p.signal !== null),
    hasMissing = standards.some((p) => p.signal === null);
  const warnings = [
    ...standards
      .filter((p) => p.signal === null)
      .map(
        (p) =>
          `${p.id} has no reading. Record it in the calibration checklist to include it.`,
      ),
    ...(hasFit ? [] : ['Add readings for at least 2 standards to fit a line.']),
  ];
  return (
    <section className="dv-curve" aria-labelledby={titleId}>
      <div className="dv-curve-head">
        <div>
          <h2 id={titleId}>{title}</h2>
          <p className="dv-curve-summary" id={summaryId}>
            {summary}
          </p>
        </div>
        <fieldset className="dv-curve-switch" aria-label="View">
          {(['chart', 'table'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="dv-curve-frame" hidden={view !== 'chart'}>
        <CurvePlot
          standards={standards}
          fit={fit}
          axisMax={axisMax}
          labelledBy={`${titleId} ${summaryId}`}
        />
      </div>
      <div hidden={view !== 'table'}>
        <ScrollFrame
          rootClassName="dv-curve-table-root"
          className="dv-curve-table"
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
        >
          <table>
            <caption id={captionId}>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">Standard</th>
                <th scope="col">
                  Concentration<small>µmol/mol</small>
                </th>
                <th scope="col">
                  Mean signal<small>mV</small>
                </th>
                <th scope="col">
                  Fitted<small>mV</small>
                </th>
                <th scope="col">
                  Residual<small>mV</small>
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {standards.map((p) => {
                const fitted = hasFit
                  ? fit.slope! * p.concentration + intercept
                  : null;
                const residual =
                  fitted !== null && p.signal !== null
                    ? p.signal - fitted
                    : null;
                const status = calibrationStatus(p),
                  Icon = statusIcon[status];
                return (
                  <tr key={p.id}>
                    <th scope="row">{p.id}</th>
                    <td>{fixed(p.concentration, 0)}</td>
                    <td
                      className={
                        p.signal === null ? 'dv-curve-muted' : undefined
                      }
                    >
                      {fixed(p.signal, 2)}
                    </td>
                    <td>{fixed(fitted, 2)}</td>
                    <td>
                      {residual === null
                        ? '—'
                        : `${residual > 0 ? '+' : ''}${fixed(residual, 2)}`}
                    </td>
                    {/* The mockup sets Included in body ink and the others muted; each keeps its icon. */}
                    <td
                      className={
                        status === 'Included' ? undefined : 'dv-curve-muted'
                      }
                    >
                      <StatusWord icon={<Icon aria-hidden />}>
                        {status}
                      </StatusWord>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollFrame>
      </div>
      <div className="dv-curve-legend">
        <span>
          <svg viewBox="0 0 16 12" aria-hidden>
            <circle cx="8" cy="6" r="4.5" fill="var(--dv-blue)" />
          </svg>
          Included standard
        </span>
        {hasExcluded && (
          <span>
            <svg viewBox="0 0 16 12" aria-hidden>
              <circle
                cx="8"
                cy="6"
                r="4.5"
                fill="var(--dv-paper)"
                stroke="var(--dv-ink-muted)"
                strokeWidth="1.4"
              />
              <path
                d="M5.5 3.5l5 5m0-5-5 5"
                stroke="var(--dv-ink-muted)"
                strokeWidth="1.2"
              />
            </svg>
            Excluded
          </span>
        )}
        {hasMissing && (
          <span>
            <svg viewBox="0 0 16 12" aria-hidden>
              <line
                x1="8"
                x2="8"
                y1="3"
                y2="12"
                stroke="var(--dv-warn)"
                strokeWidth="2"
              />
            </svg>
            No reading
          </span>
        )}
        {hasFit && (
          <span>
            <svg viewBox="0 0 16 12" aria-hidden>
              <line
                x1="1"
                x2="15"
                y1="6"
                y2="6"
                stroke="var(--dv-accent)"
                strokeWidth="2"
              />
            </svg>
            Fit line
          </span>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="dv-curve-messages">
          <Banner severity="warning" messages={warnings} />
        </div>
      )}
    </section>
  );
}

const fallback = {
  blue: '#326db1',
  accent: '#07543e',
  paper: '#fff',
  muted: '#617168',
  line: '#dce3dd',
  warn: '#79520c',
};
function tokens(el: Element) {
  const style = getComputedStyle(el),
    read = (name: string, value: string) =>
      style.getPropertyValue(name).trim() || value;
  return {
    blue: read('--dv-blue', fallback.blue),
    accent: read('--dv-accent', fallback.accent),
    paper: read('--dv-paper', fallback.paper),
    muted: read('--dv-ink-muted', fallback.muted),
    line: read('--dv-line', fallback.line),
    warn: read('--dv-warn', fallback.warn),
  };
}

/** Scatter of standards on a uPlot frame. Markers and the fit line are drawn in the draw hook so each kind keeps its own shape. */
function CurvePlot({
  standards,
  fit,
  axisMax,
  labelledBy,
}: {
  standards: CalibrationStandard[];
  fit: CalibrationFitResult;
  axisMax?: { concentration: number; signal: number };
  labelledBy: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ standards, fit });
  current.current = { standards, fit };
  const scheme = useComputedColorScheme('light'),
    { textSize } = useAppearance();
  const key = JSON.stringify([standards, fit, axisMax ?? null]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const sorted = [...standards].sort(
      (a, b) => a.concentration - b.concentration,
    );
    const x = niceTop(
      axisMax?.concentration ??
        Math.max(0, ...standards.map((p) => p.concentration)) * 1.05,
    );
    const signals = standards.flatMap((p) =>
      p.signal === null ? [] : [p.signal],
    );
    const y = niceTop(axisMax?.signal ?? Math.max(0, ...signals) * 1.05, 5);
    const yLow =
      Math.min(0, ...signals) < 0
        ? -niceTop(-Math.min(...signals) * 1.05, 5).top
        : 0;
    const ticks = (top: number, step: number, low = 0) =>
      Array.from(
        { length: Math.round((top - low) / step) + 1 },
        (_, i) => +(low + i * step).toPrecision(12),
      );
    const size = () => ({
      width: Math.max(1, el.clientWidth),
      height: el.clientHeight || 300,
    });
    // Axis text follows the Text size setting, and the axes grow with it.
    const s = rootTextScale();
    const axis = (label: string, splits: number[]): uPlot.Axis => ({
      label,
      font: `${11 * s}px ${FONT}`,
      labelFont: `${11 * s}px ${FONT}`,
      labelGap: 0,
      stroke: () => tokens(el).muted,
      splits: () => splits,
      values: (_u, values) => values.map((v) => String(+v.toPrecision(12))),
      gap: 8,
      grid: { stroke: () => tokens(el).line, width: 1 },
      ticks: { show: false },
    });
    const u = new uPlot(
      {
        // Plot margins from the mockup: 10 px above, 12 px right; at the Default text size the axes take 58 px left and 44 px below.
        ...size(),
        padding: [10, 12, 0, 0],
        legend: { show: false },
        cursor: { show: false },
        scales: {
          x: { time: false, range: [0, x.top] },
          y: { range: [yLow, y.top] },
        },
        axes: [
          {
            ...axis('Concentration (µmol/mol)', ticks(x.top, x.step)),
            size: 26 * s,
            labelSize: 18 * s,
            labelGap: 7,
          },
          {
            ...axis('Mean signal (mV)', ticks(y.top, y.step, yLow)),
            size: 40 * s,
            labelSize: 18 * s,
          },
        ],
        series: [
          {},
          { label: 'Mean signal', paths: () => null, points: { show: false } },
        ],
        hooks: {
          draw: [
            (u) => {
              const c = tokens(el),
                ctx = u.ctx,
                r = uPlot.pxRatio,
                { left, top, width, height } = u.bbox;
              const px = (v: number) => u.valToPos(v, 'x', true),
                py = (v: number) => u.valToPos(v, 'y', true);
              const { standards: points, fit: F } = current.current;
              ctx.save();
              if (F.slope !== undefined) {
                ctx.beginPath();
                ctx.rect(left, top, width, height);
                ctx.clip();
                ctx.strokeStyle = c.accent;
                ctx.lineWidth = 2 * r;
                ctx.beginPath();
                ctx.moveTo(px(0), py(F.intercept!));
                ctx.lineTo(px(x.top), py(F.slope * x.top + F.intercept!));
                ctx.stroke();
              }
              for (const p of points) {
                const X = px(p.concentration);
                if (p.signal === null) {
                  ctx.strokeStyle = c.warn;
                  ctx.lineWidth = 2 * r;
                  ctx.beginPath();
                  ctx.moveTo(X, top + height - 8 * r);
                  ctx.lineTo(X, top + height);
                  ctx.stroke();
                  continue;
                }
                const Y = py(p.signal);
                ctx.beginPath();
                ctx.arc(X, Y, 5 * r, 0, Math.PI * 2);
                if (p.excluded) {
                  ctx.fillStyle = c.paper;
                  ctx.fill();
                  ctx.strokeStyle = c.muted;
                  ctx.lineWidth = 1.6 * r;
                  ctx.stroke();
                  ctx.lineWidth = 1.4 * r;
                  ctx.beginPath();
                  ctx.moveTo(X - 3 * r, Y - 3 * r);
                  ctx.lineTo(X + 3 * r, Y + 3 * r);
                  ctx.moveTo(X + 3 * r, Y - 3 * r);
                  ctx.lineTo(X - 3 * r, Y + 3 * r);
                  ctx.stroke();
                } else {
                  ctx.fillStyle = c.blue;
                  ctx.fill();
                }
              }
              ctx.restore();
            },
          ],
        },
      },
      [sorted.map((p) => p.concentration), sorted.map((p) => p.signal)],
      el,
    );
    const observer = new ResizeObserver(() => u.setSize(size()));
    observer.observe(el);
    return () => {
      observer.disconnect();
      u.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scheme, textSize]);
  return (
    <div
      ref={host}
      className="dv-curve-plot"
      role="img"
      aria-labelledby={labelledBy}
    />
  );
}
