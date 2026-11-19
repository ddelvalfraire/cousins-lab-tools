import type { Meta, StoryObj } from '@storybook/react-vite';
import { Readout } from './Primitives';

const meta = {
  title: 'Components/Readout',
  component: Readout,
  tags: ['autodocs'],
  parameters: { layout: 'centered', previewWidth: 360 },
  args: { label: 'Mass 44', value: 12.48, unit: 'mV', state: 'recorded' },
  argTypes: {
    state: {
      control: 'select',
      options: ['recorded', 'live', 'stale', 'missing', 'pending'],
    },
  },
} satisfies Meta<typeof Readout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recorded: Story = {};
export const Live: Story = { args: { state: 'live' } };
export const Stale: Story = { args: { state: 'stale' } };
export const Missing: Story = { args: { state: 'missing', value: null } };
export const WaitingForSample: Story = {
  args: { state: 'pending', value: null },
};
export const Concentration: Story = {
  args: {
    label: 'Concentration',
    value: 0.382,
    unit: 'nmol/mL',
    unitDescription: 'Nanomoles per millilitre. Illustrative saved result.',
  },
};
export const SmallSignal: Story = {
  args: { label: 'Raw signal', value: 3.2e-6, unit: 'mV' },
};
export const IntervalRate: Story = {
  args: {
    label: 'CO₂ rate',
    value: -0.42,
    unit: 'nmol/(mL · s)',
    contextLabel: 'Recorded interval · c2',
    unitDescription: 'Nanomoles per millilitre per second.',
  },
};
