import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceHeader } from './Primitives';

const meta = {
  title: 'Components/WorkspaceHeader',
  component: WorkspaceHeader,
  tags: ['autodocs'],
  parameters: { previewWidth: 1200 },
  args: { title: 'Gas exchange', revision: 3 },
} satisfies Meta<typeof WorkspaceHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recorded: Story = {};
