import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { EmptyState } from './Primitives';
const meta = { title: 'Components/EmptyState', component: EmptyState, tags: ['autodocs'], parameters: { layout: 'centered', previewWidth: 420 }, args: { title: 'No samples yet', message: 'The selected recording contains no samples.', loading: false } } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { args: { title: 'Loading recording', message: 'Requesting the selected interval.', loading: true } };
export const Retry: Story = { args: { title: 'Display request failed', message: 'The source did not answer the display request.', onRetry: fn() }, play: async ({ args, canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: 'Retry' })); await expect(args.onRetry).toHaveBeenCalledOnce(); } };
