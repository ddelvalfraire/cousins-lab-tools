import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { RecordingExportDialog, type RecordingExportDialogProps } from './RecordingExport';
import { exportDefaults, exportRecording, exportRows, exportSignals } from './exchange-fixtures';
import { chooseOption } from './chooseOption';
import { settleMotion } from './settleMotion';

/** The dialog renders in a portal, so queries run against the whole document. */
const dialog = (canvasElement: HTMLElement) => within(within(canvasElement.ownerDocument.body).getByRole('dialog'));

/** Keeps the settings in state so the time range, signals and format can be changed. */
function ExportExample(props: RecordingExportDialogProps) {
  const [value, setValue] = useState(props.value);
  return <RecordingExportDialog {...props} value={value} rows={props.empty ? 0 : exportRows(value)} onChange={next => { setValue(next); props.onChange(next); }} />;
}

const meta = {
  title: 'Components/RecordingExport',
  component: RecordingExportDialog,
  parameters: { layout: 'fullscreen', gallery: false },
  render: args => <ExportExample {...args} />,
  args: {
    opened: true, phase: 'ready', recording: exportRecording, signals: exportSignals, value: { ...exportDefaults, range: 'interval' }, rows: 121,
    onChange: fn(), onExport: fn(), onCancelExport: fn(), onDownloadAgain: fn(), onClose: fn(),
  },
} satisfies Meta<typeof RecordingExportDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The chart selection fills the interval. */
export const SelectedInterval: Story = {
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('radio', { name: /Selected interval/ })).toBeChecked();
    await expect(body.getByText('121 rows · 4 signals')).toBeVisible();
    await expect(body.getByRole('textbox', { name: 'End time in seconds' })).toHaveValue('180');
  },
};

/** Start and end can be changed; the caption, length and counts follow. */
export const ChangeInterval: Story = {
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    const end = body.getByRole('textbox', { name: 'End time in seconds' });
    await userEvent.clear(end);
    const problem = await body.findByRole('status');
    await userEvent.type(end, '240');
    await expect(body.queryByRole('status')).toBeNull();
    await waitFor(() => expect(problem).not.toBeInTheDocument());
    await expect(body.getByText('02:00–04:00')).toBeVisible();
    await expect(body.getByText('241 rows · 4 signals')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Export CSV' }));
    await expect(args.onExport).toHaveBeenCalledTimes(1);
  },
};

/** An end before the start is named as a sentence and blocks the export. */
export const IntervalProblem: Story = {
  args: { value: { ...exportDefaults, range: 'interval', start: '200', end: '180' } },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await userEvent.click(body.getByRole('button', { name: 'Export CSV' }));
    await expect(body.getByRole('status')).toHaveTextContent('End must be after start.');
    await expect(body.getByRole('textbox', { name: 'End time in seconds' })).toHaveAttribute('aria-invalid', 'true');
    await expect(args.onExport).not.toHaveBeenCalled();
    // The error banner fades in; the accessibility scan after play reads its colours, so wait for the fade to end.
    await settleMotion();
  },
};

export const FullRecording: Story = {
  args: { value: exportDefaults },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('601 rows · 4 signals')).toBeVisible();
    await expect(body.getByRole('textbox', { name: 'Start time in seconds' })).toBeDisabled();
  },
};

/** Without a chart selection the interval is custom and starts as the whole recording. */
export const NoChartSelection: Story = {
  args: { hasSelection: false, value: { ...exportDefaults, start: '0', end: '300' } },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('radio', { name: /Custom interval/ })).not.toBeChecked();
    await expect(body.getByText('00:00–05:00')).toBeVisible();
  },
};

/** Choosing the custom interval enables its fields. */
export const UseCustomInterval: Story = {
  args: { hasSelection: false, value: { ...exportDefaults, start: '0', end: '300' } },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await userEvent.click(body.getByRole('radio', { name: /Custom interval/ }));
    await expect(body.getByRole('textbox', { name: 'Start time in seconds' })).toBeEnabled();
  },
};

/** Gaps are reported without blocking the export. */
export const DataGaps: Story = {
  args: { gaps: true },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('Selected signals contain gaps. Missing samples will be blank.')).toBeVisible();
    await expect(body.getByRole('checkbox', { name: 'Include preset reference' })).toBeDisabled();
    await expect(body.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  },
};

/** JSON enables the preset reference; missing samples become null. */
export const JsonFormat: Story = {
  args: { gaps: true },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await chooseOption(body.getByRole('combobox', { name: 'Format' }), 'json');
    await expect(body.getByText('Selected signals contain gaps. Missing samples will be null.')).toBeVisible();
    await expect(body.getByRole('checkbox', { name: 'Include preset reference' })).toBeEnabled();
    await expect(body.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  },
};

export const NoRecordedSamples: Story = {
  args: { empty: true, value: exportDefaults },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('No recorded samples are available to export.')).toBeVisible();
    await expect(body.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  },
};

export const Preparing: Story = {
  args: { phase: 'preparing', value: exportDefaults },
  play: async ({ canvasElement }) => {
    await expect(dialog(canvasElement).getByRole('status')).toHaveTextContent('Preparing export…601 rows · 4 signals');
  },
};

export const Prepared: Story = {
  args: { phase: 'done', value: exportDefaults, result: { fileName: 'leaf-respiration-025.csv', rows: 601, signals: 4, duration: 300 } },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('heading', { name: 'Export prepared' })).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Download again' }));
    await expect(args.onDownloadAgain).toHaveBeenCalledTimes(1);
  },
};

export const ExportFailed: Story = {
  args: { phase: 'failed', value: exportDefaults },
  play: async ({ canvasElement }) => {
    await expect(dialog(canvasElement).getByText('The export couldn’t be prepared. Try again.')).toBeVisible();
  },
};

export const LongFileName: Story = {
  args: { value: { ...exportDefaults, fileName: 'carbon-dioxide-and-oxygen-response-during-temperature-and-concentration-changes-sample-025' } },
  play: async ({ canvasElement, args }) => {
    // The field cuts the name, so hovering shows it in full.
    await expect(dialog(canvasElement).getByRole('textbox', { name: /File name/ })).toHaveAttribute('title', args.value.fileName);
  },
};
