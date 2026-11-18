import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type uPlot from 'uplot';
import { experimentRecording } from '../fixtures';
import { GasSignals } from './GasSignals';
import { settleMotion } from './settleMotion';

const data: uPlot.AlignedData = [
  experimentRecording.map((row) => row.time),
  experimentRecording.map((row) => (row.mass44 - 0.303) * 83),
  experimentRecording.map((row) => row.mass32 * 100),
];
const meta = {
  title: 'Components/GasSignals',
  component: GasSignals,
  tags: ['autodocs'],
  parameters: { previewWidth: 760 },
  args: {
    data,
    interval: [120, 180],
    onIntervalChange: fn(),
    onValidityChange: fn(),
    onCaptureReference: fn(),
  },
  argTypes: {
    data: { control: false },
    onIntervalChange: { control: false },
    onValidityChange: { control: false },
    onCaptureReference: { control: false },
  },
} satisfies Meta<typeof GasSignals>;
export default meta;
export const SelectedInterval: StoryObj<typeof meta> = {};

export const FeedbackMotion: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Capture reference interval' }),
    );
    await settleMotion();
    await expect(
      canvas.getByText('Reference interval captured for this local example.'),
    ).toBeVisible();
    await userEvent.clear(
      canvas.getByRole('textbox', { name: 'Selection start (s)' }),
    );
    await settleMotion();
    await expect(
      canvas.queryByText('Reference interval captured for this local example.'),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Enter an interval within the recording/),
    ).toBeVisible();
  },
};
