import type { Meta, StoryObj } from '@storybook/react-vite';
import { presetLayouts } from './fixtures';
import { PresetLayoutPreview } from './PresetLayoutPreview';

const meta = {
  title: 'Components/PresetLayoutPreview',
  component: PresetLayoutPreview,
  tags: ['autodocs'],
  parameters: { previewWidth: 360 },
  args: { tiles: presetLayouts.gas.tiles, label: presetLayouts.gas.name },
} satisfies Meta<typeof PresetLayoutPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GasAnalysis: Story = {};
export const Kinetics: Story = {
  args: {
    tiles: presetLayouts.kinetics.tiles,
    label: presetLayouts.kinetics.name,
  },
};
export const Isotope: Story = {
  args: {
    tiles: presetLayouts.isotope.tiles,
    label: presetLayouts.isotope.name,
  },
};
export const Detailed: Story = {
  parameters: { previewWidth: 720 },
  args: { detailed: true },
};
