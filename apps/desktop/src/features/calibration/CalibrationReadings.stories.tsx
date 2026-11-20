import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { settleMotion } from '../../../.storybook/settleMotion';
import {
  CalibrationChecklist,
  type ChecklistReadings,
  type ChecklistStep,
  type IntervalSummary,
} from './CalibrationChecklist';

/** Steps and synthetic samples. */
const steps: ChecklistStep[] = [
  { id: 'zero', label: 'Zero offset', known: 0 },
  { id: 'std100', label: 'Standard 100', known: 100 },
  { id: 'std200', label: 'Standard 200', known: 200 },
  { id: 'sample', label: 'Sample reading', known: null },
];
const samples = Array.from({ length: 601 }, (_, i) => ({
  t: i / 2,
  v: i / 2 < 60 ? 0.303 : i / 2 < 200 ? 1.508 : i / 2 < 250 ? 2.713 : 1.92,
}));
const summarize = (start: number, end: number): IntervalSummary => {
  const values = samples.filter((s) => s.t >= start && s.t <= end);
  return values.length
    ? {
        mean: values.reduce((sum, s) => sum + s.v, 0) / values.length,
        count: values.length,
      }
    : {
        problem: 'No samples in this interval. Widen the selection.',
        severity: 'warning',
      };
};
const zeroOnly: ChecklistReadings = {
  zero: { start: 20, end: 30, mean: 0.303 },
};
const complete: ChecklistReadings = {
  ...zeroOnly,
  std100: { start: 120, end: 140, mean: 1.508 },
  std200: { start: 220, end: 240, mean: 2.713 },
  sample: { start: 260, end: 280, mean: 1.92 },
};
const stored = () => new Promise<void>((resolve) => setTimeout(resolve, 650));
/** Fails the first time, then stores: the Retry path. */
const failsOnce = () => {
  let failed = false;
  return () => {
    if (failed) return stored();
    failed = true;
    return Promise.reject(new Error('Not stored'));
  };
};

const meta = {
  title: 'Components/CalibrationReadings',
  component: CalibrationChecklist,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen', previewWidth: 850 },
  args: {
    steps,
    signal: 'Mass 44',
    file: 'leaf-respiration-025.csv',
    recording: [0, 300],
    defaultInterval: [120, 140],
    summarize,
    defaultReadings: zeroOnly,
    onCapture: fn(stored),
    onReadingsChange: fn(),
  },
  argTypes: { summarize: { control: false }, onCapture: { control: false } },
} satisfies Meta<typeof CalibrationChecklist>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Skip the screen-reader announcement copy of a message. */
const visibleOnly = 'script, style, .dv-insp-sr';

const capture = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).getByRole('button', { name: `Capture ${name}` });
const captureButtons = (canvasElement: HTMLElement) =>
  within(canvasElement).getAllByRole('button', { name: /^(Capture|Replace) / });

/** One of four captured; the selected interval is ready to capture. */
export const InProgress: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('1 of 4')).toBeVisible();
    await expect(
      canvas.getByRole('status', { name: 'Selected interval mean 1.508 mV' }),
    ).toBeVisible();
    await expect(canvas.getByText('41 samples selected')).toBeVisible();
    await expect(canvas.getByText('Known: 100 nmol/mL')).toBeVisible();
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeEnabled();
  },
};
export const NoReadings: Story = {
  args: { defaultReadings: {} },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('0 of 4')).toBeVisible();
  },
};
export const AllCaptured: Story = {
  args: { defaultReadings: complete },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 of 4')).toBeVisible();
    await expect(
      canvas.getByText('All readings captured. Review the calibration fit.'),
    ).toBeVisible();
  },
};
/** Capture waits for an interval: editing either time clears the message. */
export const NoIntervalSelected: Story = {
  args: { intervalChosen: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Choose a start and end time to capture a reading.',
      ),
    ).toBeVisible();
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeDisabled();
  },
};
export const SignalUnavailable: Story = {
  args: {
    signalProblem: {
      text: 'Mass 44 is unavailable. Saved readings are retained.',
      severity: 'error',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Mass 44 is unavailable. Saved readings are retained.'),
    ).toBeVisible();
    await expect(
      canvas.getByRole('status', {
        name: 'Selected interval mean unavailable',
      }),
    ).toBeVisible();
    // The interval itself is valid, so the fields are not marked invalid.
    await expect(canvas.getByLabelText('Start')).not.toHaveAttribute(
      'aria-invalid',
    );
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeDisabled();
  },
};
export const SamplesMissing: Story = {
  args: {
    signalProblem: {
      text: 'Samples are missing from this interval. Choose a complete interval.',
      severity: 'warning',
    },
  },
};
export const Capturing: Story = {
  args: { pendingStep: 'std100' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Capturing… standard 100' }),
    ).toBeDisabled();
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeDisabled();
    await expect(canvas.getByLabelText('Start')).toBeDisabled();
  },
};
export const CaptureFailed: Story = {
  args: { failedStep: 'std100', onCapture: fn(failsOnce()) },
};
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'Read-only recording. Existing readings can be reviewed.',
      ),
    ).toBeVisible();
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Remove zero offset' }),
    ).toBeDisabled();
    await expect(canvas.getByLabelText('End')).toBeDisabled();
  },
};

/** Capture locks the checklist until stored, keeps the interval with the value, and can be undone. */
export const CaptureAndUndo: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(capture(canvasElement, 'standard 100'));
    await expect(
      canvas.getByRole('button', { name: 'Capturing… standard 100' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Capture standard 200' }),
    ).toBeDisabled();
    await expect(canvas.getByLabelText('Start')).toBeDisabled();
    await waitFor(
      () =>
        expect(
          canvas.getByText('Standard 100 captured.', { ignore: visibleOnly }),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(args.onCapture).toHaveBeenLastCalledWith('std100', {
      start: 120,
      end: 140,
      mean: expect.closeTo(1.508, 6),
    });
    await expect(canvas.getByText('2 of 4')).toBeVisible();
    const row = within(
      canvasElement.querySelector<HTMLElement>('[data-row="std100"]')!,
    );
    await expect(row.getByText('120–140 s')).toBeVisible();
    await expect(row.getByText('1.508')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Replace standard 100' }),
    ).toHaveFocus();
    // Moving the interval afterwards leaves the captured value alone.
    await userEvent.clear(canvas.getByLabelText('Start'));
    await userEvent.type(canvas.getByLabelText('Start'), '220');
    await userEvent.clear(canvas.getByLabelText('End'));
    await userEvent.type(canvas.getByLabelText('End'), '240');
    await expect(
      canvas.getByRole('status', { name: 'Selected interval mean 2.713 mV' }),
    ).toBeVisible();
    await expect(row.getByText('1.508')).toBeVisible();
    await userEvent.click(capture(canvasElement, 'standard 200'));
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Undo' }, { timeout: 2000 }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('Previous readings restored.', {
          ignore: visibleOnly,
        }),
      ).toBeVisible(),
    );
    await expect(canvas.getByText('2 of 4')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Capture standard 200' }),
    ).toBeVisible();
    await settleMotion();
  },
};

/** Replacing a reading asks first; Cancel returns focus. Removing can be undone. */
export const ReplaceAndRemove: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Replace zero offset' }),
    );
    await waitFor(() =>
      expect(canvas.getByText('Replace 0.303 mV with 1.508 mV?')).toBeVisible(),
    );
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await expect(args.onCapture).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(canvas.queryByText('Replace 0.303 mV with 1.508 mV?')).toBeNull(),
    );
    await expect(
      canvas.getByRole('button', { name: 'Replace zero offset' }),
    ).toHaveFocus();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove zero offset' }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('Zero offset removed.', { ignore: visibleOnly }),
      ).toBeVisible(),
    );
    await expect(canvas.getByText('0 of 4')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Capture zero offset' }),
    ).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.getByText('1 of 4')).toBeVisible();
    await expect(args.onReadingsChange).toHaveBeenLastCalledWith(zeroOnly);
  },
};

/** An interval outside the recording, or reversed, blocks capture until fixed. */
export const InvalidInterval: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('End'));
    await userEvent.type(canvas.getByLabelText('End'), '400');
    await waitFor(() =>
      expect(
        canvas.getByText('Use a start before the end, between 0 and 300 s.'),
      ).toBeVisible(),
    );
    await expect(canvas.getByLabelText('Start')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(canvas.getByText('No complete selection')).toBeVisible();
    for (const button of captureButtons(canvasElement))
      await expect(button).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Reset' }));
    await expect(canvas.getByLabelText('End')).toHaveValue('140');
    await expect(capture(canvasElement, 'standard 100')).toBeEnabled();
  },
};

/** Choosing an interval enables capture. */
export const ChooseInterval: Story = {
  args: { intervalChosen: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Start'), '{Backspace}5');
    await waitFor(() =>
      expect(
        canvas.queryByText('Choose a start and end time to capture a reading.'),
      ).toBeNull(),
    );
    await expect(capture(canvasElement, 'standard 100')).toBeEnabled();
  },
};

/** A failed capture keeps saved readings; Retry stores the reading. */
export const RetryAfterFailure: Story = {
  args: { defaultReadings: zeroOnly, onCapture: fn(failsOnce()) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(capture(canvasElement, 'standard 100'));
    const retry = await canvas.findByRole('button', { name: 'Retry' });
    await waitFor(() =>
      expect(
        canvas.getByText(
          'Could not capture standard 100. Saved readings are retained.',
        ),
      ).toBeVisible(),
    );
    await waitFor(() => expect(retry).toHaveFocus());
    await expect(canvas.getByText('1 of 4')).toBeVisible();
    await userEvent.click(retry);
    await waitFor(
      () =>
        expect(
          canvas.getByText('Standard 100 captured.', { ignore: visibleOnly }),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(args.onCapture).toHaveBeenCalledTimes(2);
    await expect(canvas.getByText('2 of 4')).toBeVisible();
  },
};
