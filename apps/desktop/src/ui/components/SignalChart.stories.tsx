import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { reduceMotion, settleMotion } from '../../../.storybook/settleMotion';
import { type SignalSample, samples } from '../fixtures';
import type { ChartState } from './SignalChart';
import { analyseSignal, SignalChart, SignalTrace } from './SignalChart';

/** Deterministic synthetic Mass 44 traces from the approved signal edge-case review (same generator and seed). */
function edgeCase(
  kind: 'gap' | 'imported' | 'irregular' | 'nonpositive' | 'range',
): SignalSample[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out: [number, number | null][] = [];
  if (kind === 'gap')
    for (let t = 0; t <= 120; t++)
      out.push([
        t,
        t >= 48 && t <= 61 ? null : 180 + 60 * Math.sin(t / 14) + rand() * 6,
      ]);
  if (kind === 'imported')
    for (let t = 0; t <= 120; t++)
      if (t < 48 || t > 61)
        out.push([t, 180 + 60 * Math.sin(t / 14) + rand() * 6]);
  if (kind === 'irregular') {
    let t = 0;
    while (t <= 120) {
      out.push([+t.toFixed(2), 210 + 40 * Math.sin(t / 18) + rand() * 5]);
      t += t > 40 && t < 55 ? 0.2 : 0.4 + rand() * 2.7;
    }
  }
  if (kind === 'nonpositive')
    for (let t = 0; t <= 120; t++)
      out.push([
        t,
        t < 20
          ? -0.8 + rand() * 1.4
          : Math.max(-0.5, (t - 20) * 1.8 + rand() * 4 - 2),
      ]);
  if (kind === 'range')
    for (let t = 0; t <= 120; t++)
      out.push([t, 0.002 * 10 ** ((t / 120) * 5.6) * (1 + rand() * 0.08)]);
  return out.map(([time, mass44]) => ({ time, mass44, mass49: null }));
}
const edge = {
  signals: ['mass44'] as const,
  title: 'Mass 44 · Sample 025',
  caption: 'Mass 44 · Sample 025',
};

const meta = {
  title: 'Components/SignalChart',
  component: SignalChart,
  tags: ['autodocs'],
  parameters: { previewWidth: 960 },
  args: {
    rows: samples,
    state: 'recorded',
    initialView: 'chart',
    initialFixed: false,
    initialInvalid: false,
    initialLog: false,
    title: 'Scale and precision controls',
    connectNulls: 'never',
    disconnectAfter: 'never',
    onRetry: fn(),
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['recorded', 'live', 'stale', 'missing', 'empty', 'unavailable'],
    },
    rows: { control: false },
    initialView: { control: 'inline-radio', options: ['chart', 'table'] },
    onRetry: { control: false },
    connectNulls: { control: 'object' },
    disconnectAfter: { control: 'object' },
  },
} satisfies Meta<typeof SignalChart>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = within(document.body);
const choose = async (
  canvasElement: HTMLElement,
  field: string,
  option: string,
) => {
  await userEvent.click(
    within(canvasElement).getByRole('combobox', { name: field }),
  );
  await userEvent.click(await body.findByRole('option', { name: option }));
  await settleMotion();
};
const tableRows = (canvasElement: HTMLElement) =>
  within(
    within(canvasElement).getByRole('region', { name: 'Signal sample table' }),
  )
    .getAllByRole('row')
    .slice(1);
const gapLabels = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('.dv-gap-band')].map(
    (el) => el.textContent,
  );

export const Recorded: Story = {};
export const Table: Story = { args: { initialView: 'table' } };
export const Empty: Story = { args: { state: 'empty', rows: [] } };
export const MissingSignal: Story = { args: { state: 'missing' } };
export const Stale: Story = { args: { state: 'stale' } };
export const FixedScale: Story = { args: { initialFixed: true } };
export const InvalidLimits: Story = { args: { initialInvalid: true } };
export const Unavailable: Story = { args: { state: 'unavailable' } };
export const SingleSample: Story = { args: { rows: [samples[30]] } };
export const SmallSignals: Story = {
  args: {
    rows: samples.slice(0, 20).map((row) => ({
      ...row,
      mass44: row.mass44 === null ? null : row.mass44 * 1e-7,
      mass49: row.mass49 === null ? null : row.mass49 * 1e-7,
    })),
  },
};
export const SwitchViews: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    await settleMotion();
    await expect(
      canvas.getByRole('region', { name: 'Signal sample table' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Chart' }));
    await settleMotion();
    await expect(
      canvas.getByRole('img', { name: 'Mass 44, Mass 49' }),
    ).toBeVisible();
  },
};

/** Gap in recording: 14 samples are marked missing. By default (Connect null values: Never) the line breaks there. */
export const GapInRecording: Story = {
  args: { ...edge, rows: edgeCase('gap') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(gapLabels(canvasElement)).toEqual(['No data · 15.0 s']),
    );
    await expect(
      canvas.getByText(/^107 samples · 14 missing · 0–120 s · interval 1 s$/),
    ).toBeVisible();
    await expect(
      canvas.getByRole('combobox', { name: 'Connect null values' }),
    ).toHaveValue('Never');
    await expect(
      canvas.getByRole('combobox', { name: 'Disconnect values' }),
    ).toHaveValue('Never');
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    await settleMotion();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Only rows with notes' }),
    );
    await settleMotion();
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(14));
    await expect(tableRows(canvasElement)[0]).toHaveTextContent(
      'Missing sample',
    );
    await expect(
      canvas.getByText('14 of 121 original rows · Mass 44 · Sample 025'),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'Chart' }));
    await settleMotion();
    await choose(canvasElement, 'Connect null values', 'Always');
    await waitFor(() => expect(gapLabels(canvasElement)).toEqual([]));
    await choose(canvasElement, 'Connect null values', 'Threshold');
    const threshold = canvas.getByRole('textbox', {
      name: 'Connect null values threshold',
    });
    await expect(threshold).toBeVisible();
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '20');
    await waitFor(() => expect(gapLabels(canvasElement)).toEqual([]));
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '10');
    await waitFor(() =>
      expect(gapLabels(canvasElement)).toEqual(['No data · 15.0 s']),
    );
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '0');
    await expect(threshold).toHaveAttribute('aria-invalid', 'true');
    await expect(
      canvas.getByText(
        /Enter a number of seconds above 0 for Connect null values/,
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(gapLabels(canvasElement)).toEqual(['No data · 15.0 s']),
    );
  },
};

/** Imported file, no markers: rows are simply absent, so the line stays connected until a Disconnect values threshold is set. */
export const ImportedNoMarkers: Story = {
  args: { ...edge, rows: edgeCase('imported') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Mass 44' })).toBeVisible();
    await expect(gapLabels(canvasElement)).toEqual([]);
    await choose(canvasElement, 'Disconnect values', 'Threshold');
    await expect(
      canvas.getByRole('textbox', { name: 'Disconnect values threshold' }),
    ).toHaveValue('3');
    await waitFor(() =>
      expect(gapLabels(canvasElement)).toEqual(['No data · 15.0 s']),
    );
    await expect(
      canvas.getByText('No data', { selector: '.dv-legend span' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    await settleMotion();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Only rows with notes' }),
    );
    await settleMotion();
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(1));
    await expect(tableRows(canvasElement)[0]).toHaveTextContent(
      'After a 15.0 s pause',
    );
  },
};

/** Uneven sampling: reported as an interval range with every sample marked, not treated as a gap. */
export const UnevenSampling: Story = {
  args: { ...edge, rows: edgeCase('irregular') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(analyseSignal(args.rows!, ['mass44']).breaks).toHaveLength(0);
    await expect(gapLabels(canvasElement)).toEqual([]);
    await expect(
      canvas.getByText(/interval varies \d+\.\d–\d+\.\d s$/),
    ).toBeVisible();
    await expect(
      canvas.getByText('Sample', { selector: '.dv-legend span' }),
    ).toBeVisible();
  },
};

/** Values at or below 0 on a log scale: one sentence explains the break; the table keeps and notes every value. */
export const ValuesAtOrBelowZero: Story = {
  args: { ...edge, rows: edgeCase('nonpositive'), initialLog: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const hidden = analyseSignal(
      args.rows!,
      ['mass44'],
      'never',
      'never',
      true,
    ).hidden;
    await expect(hidden).toBeGreaterThan(0);
    const banner = canvasElement.querySelector('.dv-plot-surface .dv-banner')!;
    await expect(banner).toHaveTextContent(
      `The log scale can’t show ${hidden} samples at or below 0 mV, so the line breaks there. The table lists them.`,
    );
    await expect(banner.querySelectorAll('li')).toHaveLength(0);
    await userEvent.click(canvas.getByRole('radio', { name: 'Table' }));
    await settleMotion();
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(121));
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Only rows with notes' }),
    );
    await settleMotion();
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(hidden));
    await expect(tableRows(canvasElement)[0]).toHaveTextContent(
      'Not shown on log scale',
    );
    await userEvent.click(canvas.getByRole('radio', { name: 'Chart' }));
    await settleMotion();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Logarithmic Y-axis' }),
    );
    await settleMotion();
    await waitFor(() =>
      expect(canvas.queryByText(/The log scale can’t show/)).toBeNull(),
    );
  },
};

/** Very wide range: a linear axis suggests the log scale; the log axis labels decades. */
export const VeryWideRange: Story = {
  args: { ...edge, rows: edgeCase('range') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        /Values span about 6 orders of magnitude\. Switch to a log scale to see the low end\./,
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: 'Logarithmic Y-axis' }),
    );
    await settleMotion();
    await waitFor(() =>
      expect(canvas.queryByText(/orders of magnitude/)).toBeNull(),
    );
  },
};

const tracePoints = Array.from({ length: 61 }, (_, i) => ({
  time: i * 5,
  value: 2.35 + 0.4 * Math.sin(i / 3),
}));
const viewWidth = (svg: SVGSVGElement) => svg.viewBox.baseVal.width;
/** CSS pixels per SVG user unit. */
const drawScale = (svg: SVGSVGElement) => svg.getScreenCTM()!.a;
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const labelsApart = async (svg: SVGSVGElement) => {
  const boxes = [...svg.querySelectorAll('text')].map((t) => ({
    text: t.textContent,
    box: t.getBoundingClientRect(),
  }));
  for (const [i, a] of boxes.entries())
    for (const b of boxes.slice(i + 1))
      await expect(overlaps(a.box, b.box), `${a.text} and ${b.text}`).toBe(
        false,
      );
};
const traceCard = (
  <div data-testid="trace-card" style={{ width: 720 }}>
    <SignalTrace
      variant="live"
      points={tracePoints
        .slice(-7)
        .map((p) => ({ time: p.time - 300, value: p.value }))}
      from={-30}
      to={0}
      min={1.8}
      max={2.9}
      unit="mV"
      label="Live trace"
    />
    <SignalTrace
      variant="playback"
      points={tracePoints}
      from={0}
      to={300}
      cursor={42}
      min={1.8}
      max={2.9}
      unit="mV"
      label="Playback trace"
    />
  </div>
);
const traceSvgs = (canvasElement: HTMLElement) =>
  [
    within(canvasElement).getByRole('img', { name: 'Live trace' }),
    within(canvasElement).getByRole('img', { name: 'Playback trace' }),
  ] as unknown as SVGSVGElement[];

/** Compact traces fill a wide card and redraw at the new width when the card resizes. */
export const TracesFillCard: Story = {
  render: () => traceCard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId('trace-card');
    const traces = traceSvgs(canvasElement);
    for (const svg of traces)
      await waitFor(() => expect(viewWidth(svg)).toBe(720));
    for (const svg of traces) await expect(drawScale(svg)).toBeCloseTo(1, 3);
    await expect(
      traces.map((svg) => svg.getBoundingClientRect().height),
    ).toEqual([100, 145]);
    const lastTick = [...traces[1].querySelectorAll('text')].find(
      (t) => t.textContent === '300',
    )!;
    await expect(Number(lastTick.getAttribute('x'))).toBe(720 - 12);
    card.style.width = '480px';
    for (const svg of traces)
      await waitFor(() => expect(viewWidth(svg)).toBe(480));
    await expect(Number(lastTick.getAttribute('x'))).toBe(480 - 12);
  },
};
/** Largest text: the whole trace scales by 1.5, so the labels grow with the text and keep their places. */
export const TracesLargestText: Story = {
  globals: { textSize: 'largest' },
  render: () => traceCard,
  play: async ({ canvasElement }) => {
    const traces = traceSvgs(canvasElement);
    for (const svg of traces)
      await waitFor(() => expect(viewWidth(svg)).toBe(480));
    for (const svg of traces)
      await expect(Math.abs(drawScale(svg) - 1.5)).toBeLessThanOrEqual(0.02);
    await expect(
      traces.map((svg) => svg.getBoundingClientRect().height),
    ).toEqual([150, 217.5]);
    for (const svg of traces) await labelsApart(svg);
    // A card as narrow as the playback mockup still scales by 1.5 instead of letterboxing the trace.
    within(canvasElement).getByTestId('trace-card').style.width = '260px';
    for (const svg of traces)
      await waitFor(() => expect(viewWidth(svg)).toBeCloseTo(260 / 1.5, 3));
    for (const svg of traces)
      await expect(Math.abs(drawScale(svg) - 1.5)).toBeLessThanOrEqual(0.02);
    for (const svg of traces) await labelsApart(svg);
  },
};

export const ViewMotion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      plot = canvasElement.querySelector('canvas');
    const surface = canvasElement.querySelector('.dv-chart-views')!;
    const height = surface.getBoundingClientRect().height;
    for (const name of ['Table', 'Chart', 'Table', 'Chart']) {
      await userEvent.click(canvas.getByRole('radio', { name }));
      await settleMotion();
      await settleMotion();
      await expect(surface.getBoundingClientRect().height).toBe(height);
      await expect(canvasElement.querySelector('canvas')).toBe(plot);
      await expect(canvas.getByRole('radio', { name })).toHaveFocus();
      await waitFor(() =>
        expect(surface.querySelectorAll('[data-motion]')).toHaveLength(0),
      );
      await expect(
        surface.querySelectorAll('[data-active="true"]'),
      ).toHaveLength(1);
    }
  },
};
export const ViewMotionReduced: Story = {
  ...ViewMotion,
  beforeEach: reduceMotion,
};

/** Manual controls keep state changes separate from automatic story interactions. */
export const MotionStates: Story = {
  args: { ...edge, rows: edgeCase('nonpositive') },
  render: function States(args) {
    const [state, setState] = useState<ChartState>('recorded');
    return (
      <>
        <fieldset
          aria-label="Example source state"
          style={{ margin: 0, padding: 0, border: 0, minInlineSize: 'auto' }}
        >
          {(
            ['recorded', 'stale', 'missing', 'empty', 'unavailable'] as const
          ).map((value) => (
            <button key={value} type="button" onClick={() => setState(value)}>
              {value}
            </button>
          ))}
        </fieldset>
        <SignalChart {...args} state={state} />
      </>
    );
  },
};

export const FilteredRowsMotion: Story = {
  args: { ...edge, rows: edgeCase('gap'), initialView: 'table' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      filter = canvas.getByRole('checkbox', { name: 'Only rows with notes' });
    await userEvent.click(filter);
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(14));
    await userEvent.click(filter);
    await settleMotion();
    await waitFor(() => expect(tableRows(canvasElement)).toHaveLength(121));
    await expect(filter).toHaveFocus();
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('tr[data-motion]')).toHaveLength(0),
    );
  },
};
