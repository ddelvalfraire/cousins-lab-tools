import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StatusMessages } from './Primitives';

const meta = {
  title: 'Components/StatusMessages',
  component: StatusMessages,
  tags: ['autodocs'],
  parameters: { previewWidth: 560 },
  args: {
    messages: [
      { severity: 'error', text: 'Maximum Y must be greater than minimum Y.' },
      {
        severity: 'error',
        text: 'Logarithmic scaling requires a minimum greater than zero.',
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.dv-banner')).toHaveLength(1);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(
      args.messages.length,
    );
  },
} satisfies Meta<typeof StatusMessages>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Errors: Story = {};
export const Warnings: Story = {
  args: {
    messages: [
      {
        severity: 'warning',
        text: 'The signal is stale. Last received 12 s ago.',
      },
      {
        severity: 'warning',
        text: 'This recording has no associated calibration.',
      },
    ],
  },
};
export const Mixed: Story = {
  args: {
    messages: [
      { severity: 'error', text: 'Mass 44 is missing.' },
      {
        severity: 'warning',
        text: 'Calibration preview has not been applied.',
      },
    ],
  },
};
