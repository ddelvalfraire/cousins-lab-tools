import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StatusBanner } from './Primitives';

const meta = {
  title: 'Components/StatusBanner',
  component: StatusBanner,
  tags: ['autodocs'],
  parameters: { previewWidth: 560 },
  args: {
    severity: 'info',
    children: 'Recorded interval · c2',
    announce: false,
  },
  argTypes: {
    severity: {
      control: 'select',
      options: ['info', 'warning', 'error', 'success'],
    },
  },
} satisfies Meta<typeof StatusBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Information: Story = {};
export const Warning: Story = {
  args: { severity: 'warning', children: 'Stale · last received 12 s ago' },
};
const ErrorStory: Story = {
  args: { severity: 'error', children: 'Unavailable · Mass 44 is missing' },
};

export { ErrorStory as Error };
export const Success: Story = {
  args: { severity: 'success', children: 'Revision 3 saved.', announce: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Revision 3 saved.',
    );
  },
};
