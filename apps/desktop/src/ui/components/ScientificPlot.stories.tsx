import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { samples } from '@/shared/testing/fixtures';
import { ScientificPlot } from './SignalChart';

const paired = [...samples].sort((a, b) => (a.mass44 ?? 0) - (b.mass44 ?? 0));
const meta = {
  title: 'Components/ScientificPlot',
  component: ScientificPlot,
  tags: ['autodocs'],
  parameters: { previewWidth: 960 },
  args: {
    data: [samples.map((s) => s.time), samples.map((s) => s.mass44)],
    series: [{ label: 'Mass 44', unit: 'mV' }],
    xLabel: 'Elapsed time (s)',
    yLabel: 'Signal (mV)',
    onSelection: fn(),
  },
  argTypes: { data: { control: false }, onSelection: { control: false } },
} satisfies Meta<typeof ScientificPlot>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TimeSeries: Story = {};
export const MassSpectrum: Story = {
  args: {
    xLabel: 'Mass-to-charge ratio (m/z)',
    yLabel: 'Intensity (counts)',
    data: [
      Array.from({ length: 81 }, (_, i) => i + 20),
      Array.from(
        { length: 81 },
        (_, i) =>
          30 +
          500 * Math.exp(-(((i - 24) / 2) ** 2)) +
          250 * Math.exp(-(((i - 29) / 3) ** 2)),
      ),
    ],
    series: [{ label: 'Sample spectrum', unit: 'counts' }],
  },
};
export const XYScatter: Story = {
  args: {
    points: true,
    xLabel: 'Mass 44 (mV)',
    yLabel: 'Mass 49 (mV)',
    data: [paired.map((s) => s.mass44 ?? 0), paired.map((s) => s.mass49)],
    series: [{ label: 'Paired signal specimen', unit: 'mV' }],
  },
};

/** New data reaches the existing chart; a change to how the chart is built replaces it. */
export const DataAndRebuild: Story = {
  render: function DataAndRebuild(args) {
    const [shift, setShift] = useState(0),
      [points, setPoints] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setShift(shift + 10)}>
          Shift data
        </button>
        <button type="button" onClick={() => setPoints(!points)}>
          Toggle points
        </button>
        <ScientificPlot
          {...args}
          data={[samples.map((s) => s.time + shift), args.data[1]]}
          points={points}
        />
      </>
    );
  },
  args: { sparse: true, limits: [0, 20], unit: 'mV' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const host = canvas.getByRole('img', { name: 'Mass 44' });
    const ticks = () =>
      [...canvasElement.querySelectorAll('.dv-plot-ticks text')].map(
        (label) => label.textContent,
      );
    await waitFor(() => expect(ticks()).toContain('120'));
    const first = host.querySelector('canvas');
    await expect(first).not.toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Shift data' }));
    await waitFor(() => expect(ticks()).toContain('130'));
    await expect(host.querySelector('canvas')).toBe(first);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Toggle points' }),
    );
    await waitFor(() => expect(host.querySelector('canvas')).not.toBe(first));
    await expect(host.querySelectorAll('.uplot')).toHaveLength(1);
    await expect(ticks()).toContain('130');
  },
};
