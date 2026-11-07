import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type uPlot from 'uplot';
import { GasSignals } from './GasSignals';
import { experimentRecording } from '../fixtures';
const data: uPlot.AlignedData = [experimentRecording.map(row => row.time),experimentRecording.map(row => (row.mass44 - .303) * 83),experimentRecording.map(row => row.mass32 * 100)];
const meta = { title: 'Components/GasSignals', component: GasSignals, tags: ['autodocs'], parameters: { previewWidth: 760 }, args: { data, interval: [120,180], onIntervalChange: fn(), onValidityChange: fn(), onCaptureReference: fn() }, argTypes: { data: { control: false }, onIntervalChange: { control: false }, onValidityChange: { control: false }, onCaptureReference: { control: false } } } satisfies Meta<typeof GasSignals>;
export default meta;
export const SelectedInterval: StoryObj<typeof meta> = {};
