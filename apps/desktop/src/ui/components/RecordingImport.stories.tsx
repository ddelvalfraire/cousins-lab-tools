import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RecordingImportDialog, type RecordingFile } from './RecordingImport';
import { recordingFiles, recordingNames, recordingPresets, unreadableRecording, unreadableRecording2 } from './exchange-fixtures';
import { chooseOption } from './chooseOption';

/** The dialog renders in a portal, so queries run against the whole document. */
const dialog = (canvasElement: HTMLElement) => within(within(canvasElement.ownerDocument.body).getByRole('dialog'));
const withStatus = (files: readonly RecordingFile[], statuses: RecordingFile['status'][], problem?: string) => files.map((file, i) => ({ ...file, status: statuses[i], problem: statuses[i] === 'failed' ? problem : file.problem }));

const meta = {
  title: 'Components/RecordingImport',
  component: RecordingImportDialog,
  parameters: { layout: 'fullscreen', gallery: false },
  args: {
    opened: true, phase: 'select', files: recordingFiles, names: recordingNames, presets: recordingPresets, presetId: 'co2',
    onChooseFiles: fn(), onRemoveFile: fn(), onNameChange: fn(), onPresetChange: fn(), onReview: fn(), onBack: fn(), onImport: fn(), onStop: fn(), onRetry: fn(), onClose: fn(),
  },
} satisfies Meta<typeof RecordingImportDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No files yet: a drop area with one action. Review waits for files. */
export const ChooseFiles: Story = {
  args: { files: [] },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('heading', { name: 'Import recordings' })).toBeVisible();
    await expect(body.getByText('Drop recordings here')).toBeVisible();
    await expect(body.getByRole('button', { name: 'Review recordings' })).toBeDisabled();
    await expect(body.getByText('Files', { selector: '[aria-current="step"]' })).toBeVisible();
  },
};

/** Files read and ready: size, length and channel count, each with Ready as icon plus word. */
export const FilesSelected: Story = {
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('2 files selected')).toBeVisible();
    await expect(body.getAllByText('Ready')).toHaveLength(2);
    await userEvent.click(body.getByRole('button', { name: 'Remove leaf-respiration-026.csv' }));
    await expect(args.onRemoveFile).toHaveBeenCalledWith('sample26');
    await userEvent.click(body.getByRole('button', { name: 'Review 2 recordings' }));
    await expect(args.onReview).toHaveBeenCalledTimes(1);
  },
};

/** One file can't be read: the reason is a single sentence and review waits until it's removed. */
export const OneFileError: Story = {
  args: { files: [...recordingFiles, unreadableRecording] },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    const alert = body.getByRole('status');
    await expect(alert).toHaveTextContent('unrecognized-recording.csv: Time column is missing; no numeric signals were found.');
    await expect(alert.querySelectorAll('li')).toHaveLength(0);
    await expect(body.getByText('Needs attention')).toBeVisible();
    await expect(body.getByRole('button', { name: 'Review 2 recordings' })).toBeDisabled();
  },
};

/** Several files can't be read: one banner lists them. */
export const SeveralFileErrors: Story = {
  args: { files: [...recordingFiles, unreadableRecording, unreadableRecording2] },
  play: async ({ canvasElement }) => {
    const alert = dialog(canvasElement).getByRole('status');
    await expect(alert).toHaveTextContent('2 files need attention.');
    await expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
  },
};

/** Review: name each experiment and choose the preset they open with. */
export const Review: Story = {
  args: { phase: 'review' },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('Review', { selector: '[aria-current="step"]' })).toBeVisible();
    await expect(body.getByText('03:30 total')).toBeVisible();
    await userEvent.type(body.getByRole('textbox', { name: 'Experiment name for leaf-respiration-025.csv' }), 'A');
    await expect(args.onNameChange).toHaveBeenLastCalledWith('sample25', 'Leaf respiration · Sample 025A');
    await chooseOption(body.getByRole('combobox', { name: /Open with preset/ }), 'signals');
    await expect(args.onPresetChange).toHaveBeenCalledWith('signals');
    await userEvent.click(body.getByRole('button', { name: 'Back' }));
    await expect(args.onBack).toHaveBeenCalledTimes(1);
    await userEvent.click(body.getByRole('button', { name: 'Import 2 recordings' }));
    await expect(args.onImport).toHaveBeenCalledTimes(1);
  },
};

/** Importing one file at a time. The dialog can't be dismissed; Stop import keeps what's done. */
export const Importing: Story = {
  args: { phase: 'importing', files: withStatus(recordingFiles, ['imported', 'importing']) },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('progressbar', { name: 'Import progress' })).toHaveAttribute('aria-valuenow', '50');
    await expect(body.getByRole('button', { name: 'Close import dialog' })).toBeDisabled();
    await expect(body.queryByRole('button', { name: /^Remove/ })).toBeNull();
  },
};

export const Imported: Story = {
  args: { phase: 'done', files: withStatus(recordingFiles, ['imported', 'imported']) },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('heading', { name: 'Recordings imported' })).toBeVisible();
    await expect(body.getByText('2 recordings imported.')).toBeVisible();
    await expect(body.queryByRole('navigation', { name: 'Steps' })).toBeNull();
  },
};

/** One recording failed: the rest stay imported and only the failure is retried. */
export const ImportFailed: Story = {
  args: { phase: 'failed', files: withStatus(recordingFiles, ['imported', 'failed'], 'Couldn’t save this recording. Try again.') },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('1 recording couldn’t be imported.')).toBeVisible();
    await expect(body.getByText('1 already imported')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Retry failed recording' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const LongFileNames: Story = {
  args: {
    files: [
      { ...recordingFiles[0], id: 'long', name: 'carbon-dioxide-and-oxygen-response-after-temperature-change-sample-025.csv' },
      recordingFiles[1],
    ],
  },
};
