import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { IconCheck, IconActivity, IconHistory, IconAlertTriangle } from '@tabler/icons-react';
import { Chip, StatusWord } from './Chip';

const meta = {
  title: 'Components/Chip',
  component: Chip,
  args: { icon: <IconHistory aria-hidden />, children: 'R3' },
  parameters: { previewWidth: 360, layout: 'centered' },
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Revision: Story = {};
export const BoundToParameter: Story = { args: { tone: 'accent', icon: <IconActivity aria-hidden />, children: '30 s · Sample' } };
export const Missing: Story = { args: { tone: 'warning', icon: <IconAlertTriangle aria-hidden />, children: 'Mass 44' } };
export const LongText: Story = {
  args: { children: 'leaf-respiration-sample-025-with-a-very-long-recording-file-name.csv' },
  parameters: { previewWidth: 200 },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('.dv-chip') as HTMLElement;
    await expect(chip.getBoundingClientRect().width).toBeLessThanOrEqual(canvasElement.getBoundingClientRect().width + 1);
    // Cut text keeps the full label as a tooltip.
    await expect(chip).toHaveAttribute('title', 'leaf-respiration-sample-025-with-a-very-long-recording-file-name.csv');
  },
};
export const Status: Story = {
  render: () => <div style={{ display: 'flex', gap: 16 }}>
    <StatusWord tone="accent" icon={<IconActivity aria-hidden />}>Running</StatusWord>
    <StatusWord icon={<IconCheck aria-hidden />}>Recorded</StatusWord>
    <StatusWord tone="warning" icon={<IconAlertTriangle aria-hidden />}>Interrupted</StatusWord>
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const word of ['Running', 'Recorded', 'Interrupted']) await expect(canvas.getByText(word)).toBeVisible();
  },
};
