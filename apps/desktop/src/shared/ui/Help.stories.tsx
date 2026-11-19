import type { Meta, StoryObj } from '@storybook/react-vite';
import { Help } from './Primitives';

const meta = {
  title: 'Components/Help',
  component: Help,
  tags: ['autodocs'],
  args: {
    label: 'About concentration units',
    children: 'Nanomoles per millilitre. Hover or focus to inspect.',
  },
} satisfies Meta<typeof Help>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnitTooltip: Story = {};
