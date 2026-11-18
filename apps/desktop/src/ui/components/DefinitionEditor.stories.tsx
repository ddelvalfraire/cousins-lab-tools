import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DefinitionEditor } from './Catalog';

const meta = {
  title: 'Components/DefinitionEditor',
  component: DefinitionEditor,
  tags: ['autodocs'],
  parameters: { previewWidth: 480 },
  args: { state: 'editing', onSave: fn() },
  argTypes: {
    state: {
      control: 'select',
      options: ['editing', 'pending', 'conflict', 'failed', 'unknown'],
    },
    onSave: { control: false },
  },
} satisfies Meta<typeof DefinitionEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editing: Story = {};
export const Pending: Story = { args: { state: 'pending' } };
export const Conflict: Story = { args: { state: 'conflict' } };
export const Failed: Story = { args: { state: 'failed' } };
export const UnknownOutcome: Story = { args: { state: 'unknown' } };
