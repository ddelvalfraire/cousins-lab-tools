import { useEffect, useRef, useState } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import { useAppearance } from '../appearance';
import { rootTextScale } from '../textSize';
import uPlot from 'uplot';
import { seriesColors } from '../theme';
import { formatMeasurement } from '../measurement';
import { ScrollFrame } from './ScrollFrame';

export type LineDash = 'solid' | 'dashed' | 'dotted';
/** Dash patterns from the approved inspector charts: dashed `6 4`, dotted `2 4`. */
const dashes: Record<LineDash, number[]> = { solid: [], dashed: [6, 4], dotted: [2, 4] };

export interface PlotSeries {
  label: string; unit: string; kind?: 'line' | 'points'; color?: string;
  /** Line style. Without it the second series is dashed and the others solid. */
  dash?: LineDash;
}

/**
 * Room for the tick labels in the sparse frame, in px: left of and below the plot area.
 * alignment-inspector-review.html uses 42 × 37; source-binding-review.html uses 38 × 34.
 */
export interface SparseFrame { left?: number; bottom?: number }

interface TickLabel { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }
interface Overlay { width: number; height: number; labels: TickLabel[] }

/** The sparse frame's fixed edges (alignment-inspector-review.html `paintChart`): 24 px above, 12 px right. */
const SPARSE_TOP = 24, SPARSE_RIGHT = 12;
const clockText = (seconds: number) => {
  const t = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return [t / 3600, (t % 3600) / 60, t % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
};
/** Approved.css tokens used on the canvas: --dv-line, --dv-ink-muted and --dv-soft. */
const frameColors = { light: { line: '#dce3dd', muted: '#617168', soft: '#edf1ed' }, dark: { line: '#45584a', muted: '#b5c4b5', soft: '#303f34' } } as const;

export function ScientificPlot({ data, series, xLabel = 'Elapsed time (s)', yLabel = 'Signal (mV)', range, limits, logarithmic = false, selection, onSelection, points = false, height = 280, minimumWidth = 240, sparse, unit, marker, clock, band = 'lime' }: {
  data: uPlot.AlignedData; series: PlotSeries[]; xLabel?: string; yLabel?: string;
  range?: [number, number]; limits?: [number, number]; logarithmic?: boolean;
  selection?: [number, number]; onSelection?: (interval: [number, number]) => void; points?: boolean; height?: number; minimumWidth?: number;
  /**
   * Inspector chart frame: three ticks per axis (both ends and the middle, values to one decimal), the unit above the
   * vertical axis and `xLabel` as a caption below the chart. Needs `limits`. Values from alignment-inspector-review.html
   * and source-binding-review.html.
   */
  sparse?: boolean | SparseFrame;
  /** Unit shown above the vertical axis in the sparse frame, e.g. "mV". */
  unit?: string;
  /** Draws a dashed vertical line at this time, e.g. a shared event at 0 s. */
  marker?: number;
  /** Labels time ticks as UTC clock times (hh:mm:ss): the clock time of 0 s, in seconds since midnight. `null` shows "—" when the clock is unknown. */
  clock?: number | null;
  /** Colour of the selected interval: `lime` (default) or the mockups' soft panel colour. The sparse frame always uses `soft`. */
  band?: 'lime' | 'soft';
}) {
  const host = useRef<HTMLDivElement>(null), plot = useRef<uPlot | null>(null);
  const lastYExtent = useRef<[number, number] | undefined>(undefined);
  const callbacks = useRef({ onSelection, selection, range, data, marker, clock });
  callbacks.current = { onSelection, selection, range, data, marker, clock };
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const scheme = useComputedColorScheme('light'), { textSize } = useAppearance();
  const seriesKey = JSON.stringify(series);
  const limitKey = JSON.stringify(limits);
  const frame = sparse ? { left: 42, bottom: 37, ...(typeof sparse === 'object' ? sparse : {}) } : null;
  const frameKey = JSON.stringify(frame);
  const soft = !!frame || band === 'soft';
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    const colors = seriesColors[scheme], ink = scheme === 'dark' ? '#b5c6bb' : '#53675e';
    const parsedSeries: PlotSeries[] = JSON.parse(seriesKey);
    const parsedLimits: [number, number] | undefined = limitKey ? JSON.parse(limitKey) : undefined;
    const sparseFrame: Required<SparseFrame> | null = JSON.parse(frameKey);
    const { line, muted } = frameColors[scheme];
    const bandColor = soft ? frameColors[scheme].soft : scheme === 'dark' ? '#344a2a' : '#eff8cc';
    const bandSpan = (u: uPlot) => {
      const interval = callbacks.current.selection;
      if (!interval) return null;
      const left = Math.max(u.bbox.left, u.valToPos(interval[0], 'x', true)), right = Math.min(u.bbox.left + u.bbox.width, u.valToPos(interval[1], 'x', true));
      return right > left ? [left, right] as const : null;
    };
    // Sparse frame: grid, then the interval, then the marker, all under the series (the mockups' SVG drawing order).
    const drawFrame = (u: uPlot) => {
      const r = uPlot.pxRatio, { left, top, width, height: h } = u.bbox, ctx = u.ctx, y = u.scales.y;
      ctx.save();
      if (y.min !== undefined && y.max !== undefined) {
        ctx.strokeStyle = line; ctx.lineWidth = r; ctx.setLineDash([]); ctx.beginPath();
        for (const v of [y.min, (y.min + y.max) / 2, y.max]) { const py = u.valToPos(v, 'y', true); ctx.moveTo(left, py); ctx.lineTo(left + width, py); }
        ctx.stroke();
      }
      const span = bandSpan(u);
      if (span) { ctx.fillStyle = bandColor; ctx.fillRect(span[0], top, span[1] - span[0], h); }
      const at = callbacks.current.marker;
      if (at !== undefined) {
        const px = u.valToPos(at, 'x', true);
        if (px >= left && px <= left + width) { ctx.strokeStyle = muted; ctx.lineWidth = r; ctx.setLineDash([3 * r, 4 * r]); ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + h); ctx.stroke(); }
      }
      ctx.restore();
    };
    // Tick labels are SVG text over the canvas, positioned from uPlot's own layout.
    const placeLabels = (u: uPlot) => {
      if (!sparseFrame) return;
      const r = uPlot.pxRatio, left = u.bbox.left / r, top = u.bbox.top / r, w = u.bbox.width / r, h = u.bbox.height / r;
      const x = u.scales.x, y = u.scales.y, labels: TickLabel[] = [];
      if (unit) labels.push({ x: sparseFrame.left, y: 13, text: unit, anchor: 'start' });
      if (y.min !== undefined && y.max !== undefined) for (const v of [y.min, (y.min + y.max) / 2, y.max]) labels.push({ x: sparseFrame.left - 8, y: top + u.valToPos(v, 'y') + 4, text: v.toFixed(1), anchor: 'end' });
      if (x.min !== undefined && x.max !== undefined) [x.min, (x.min + x.max) / 2, x.max].forEach((v, i) => {
        const at = callbacks.current.clock;
        labels.push({ x: left + (i === 0 ? 0 : i === 2 ? w : w / 2), y: top + h + 24, text: at === undefined ? String(Math.round(v)) : at === null ? '—' : clockText(at + v), anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' });
      });
      const next = { width: u.width, height: u.height, labels };
      setOverlay(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    // Axis text follows the Text size setting; the axes grow with it so tick labels are not cut off.
    const s = rootTextScale(), font = `${11 * s}px system-ui`, labelFont = `${12 * s}px system-ui`;
    const options: uPlot.Options = {
      width: Math.max(minimumWidth, el.clientWidth), height,
      ...(sparseFrame ? { padding: [SPARSE_TOP, SPARSE_RIGHT, sparseFrame.bottom, sparseFrame.left] as uPlot.Padding } : {}),
      scales: { x: { time: false }, y: { distr: logarithmic ? 3 : 1, range: parsedLimits ?? ((_u, min, max) => {
        if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max)) return lastYExtent.current && (!logarithmic || lastYExtent.current[0] > 0) ? lastYExtent.current : [logarithmic ? 0.1 : 0, 20];
        const bounds = uPlot.rangeNum(min, max, 0.1, true);
        const next: [number, number] = logarithmic ? [Math.max(bounds[0] ?? min, min / 2, Number.MIN_VALUE), bounds[1] ?? max] : [bounds[0] ?? min, bounds[1] ?? max];
        lastYExtent.current = next; return next;
      }) } },
      axes: sparseFrame ? [{ show: false }, { show: false }] : [
        { label: xLabel, stroke: ink, grid: { show: false }, font, labelFont, size: 50 * s, labelSize: 30 * s, ...(callbacks.current.clock !== undefined ? { values: (_u: uPlot, splits: number[]) => splits.map(v => { const at = callbacks.current.clock; return at === null || at === undefined ? '—' : clockText(at + v); }) } : {}) },
        { label: yLabel, stroke: ink, font, labelFont, size: 58 * s, labelSize: 30 * s, grid: { stroke: scheme === 'dark' ? '#40564a' : '#e2e8df', width: 1 } },
      ],
      series: [{ label: xLabel }, ...parsedSeries.map((s, i) => ({ label: s.label, stroke: s.color ?? colors[i % colors.length], width: 2, dash: s.dash ? dashes[s.dash] : i === 1 ? dashes.dashed : [], value: (_u: uPlot, value: number | null) => `${formatMeasurement(value)} ${s.unit}`, paths: points || s.kind === 'points' ? () => null : undefined, points: { show: () => points || s.kind === 'points' || callbacks.current.data[0].length === 1, size: 5 } }))],
      legend: { show: false }, cursor: { drag: { x: true, y: false, setScale: false } },
      hooks: {
        setSelect: [(u) => { if (u.select.width > 3) callbacks.current.onSelection?.([+u.posToVal(u.select.left, 'x').toFixed(2), +u.posToVal(u.select.left + u.select.width, 'x').toFixed(2)]); }],
        drawAxes: sparseFrame ? [drawFrame] : [],
        draw: [(u) => {
          placeLabels(u);
          if (sparseFrame) return;
          const span = bandSpan(u);
          if (span) { u.ctx.save(); u.ctx.globalCompositeOperation = 'destination-over'; u.ctx.fillStyle = bandColor; u.ctx.fillRect(span[0], u.bbox.top, span[1] - span[0], u.bbox.height); u.ctx.restore(); }
          const at = callbacks.current.marker;
          if (at !== undefined) {
            const r = uPlot.pxRatio, px = u.valToPos(at, 'x', true);
            if (px >= u.bbox.left && px <= u.bbox.left + u.bbox.width) { u.ctx.save(); u.ctx.strokeStyle = muted; u.ctx.lineWidth = r; u.ctx.setLineDash([3 * r, 4 * r]); u.ctx.beginPath(); u.ctx.moveTo(px, u.bbox.top); u.ctx.lineTo(px, u.bbox.top + u.bbox.height); u.ctx.stroke(); u.ctx.restore(); }
          }
        }],
      },
    };
    const u = new uPlot(options, callbacks.current.data, el); plot.current = u;
    if (callbacks.current.range) u.setScale('x', { min: callbacks.current.range[0], max: callbacks.current.range[1] });
    const observer = new ResizeObserver(() => { if (host.current) u.setSize({ width: Math.max(minimumWidth, host.current.clientWidth), height }); });
    observer.observe(el);
    return () => { observer.disconnect(); u.destroy(); plot.current = null; };
  }, [seriesKey, scheme, textSize, limitKey, logarithmic, points, height, xLabel, yLabel, minimumWidth, frameKey, unit, soft]);
  useEffect(() => {
    const u = plot.current; if (!u) return;
    u.setData(data);
    const xs = data[0], first = xs[0] ?? 0, last = xs[xs.length - 1] ?? 120;
    u.setScale('x', { min: range?.[0] ?? (first === last ? first - 1 : first), max: range?.[1] ?? (first === last ? last + 1 : last) });
    // Do not rebuild from uncommitted scales during uPlot's initial microtask.
    // setData/setScale already invalidate paths; only schedule the selection paint.
    u.redraw(false);
  }, [data, range, selection, marker, clock]);
  const description = `${series.map(s => s.label).join(', ')} · ${yLabel} by ${xLabel}. Scroll horizontally when needed.`;
  if (!frame) return <ScrollFrame axes="x" className="dv-plot-scroll" tabIndex={0} role="region" aria-label={description}><div ref={host} className="dv-plot" role="img" aria-label={series.map(s => s.label).join(', ')} /></ScrollFrame>;
  return <>
    <ScrollFrame axes="x" className="dv-plot-scroll" tabIndex={0} role="region" aria-label={description}>
      <div className="dv-plot dv-plot-sparse">
        <div ref={host} role="img" aria-label={series.map(s => s.label).join(', ')} />
        {overlay && <svg className="dv-plot-ticks" width={overlay.width} height={overlay.height} aria-hidden="true" focusable="false">
          {overlay.labels.map((label, i) => <text key={i} x={label.x} y={label.y} textAnchor={label.anchor}>{label.text}</text>)}
        </svg>}
      </div>
    </ScrollFrame>
    <p className="dv-plot-x-title">{xLabel}</p>
  </>;
}
