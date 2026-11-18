import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { samples } from '../fixtures';
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
