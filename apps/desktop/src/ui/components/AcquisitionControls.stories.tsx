import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  AcquisitionControls,
  type AcquisitionControlsProps,
  type AcquisitionState,
} from './AcquisitionControls';
import { reduceMotion, settleMotion } from './settleMotion';

/** Dialogs render in a portal, so dialog queries run against the whole document. */
const page = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body);
const stopDialog = async (canvasElement: HTMLElement) => {
  const dialog = await page(canvasElement).findByRole('dialog');
  await waitFor(() => expect(dialog).toBeVisible()); // Mantine fades the dialog in.
  return within(dialog);
};
const meta_ = (canvasElement: HTMLElement) =>
  within(canvasElement).getByTestId('acquisition-meta');

const meta = {
  title: 'Components/AcquisitionControls',
  component: AcquisitionControls,
  args: {
    state: 'ready',
    experimentName: 'Sample 025',
    instrument: 'MS-01',
    samples: 87,
    elapsedSeconds: 43,
    routine: null,
    startFailed: false,
    stopFailed: false,
    defaultStopDialogOpen: false,
    onStart: fn(),
    onStop: fn(),
    onConnect: fn(),
  },
  // Example context: the experiment header the action bar sits in, as in the mockups.
  decorators: [
    (Story, { args }) => (
      <div
        style={{
          background: 'var(--dv-bg)',
          border: '1px solid var(--dv-line)',
          borderRadius: 12,
          padding: '20px 24px 24px',
          color: 'var(--dv-ink)',
        }}
      >
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '1.5625rem',
            lineHeight: '1.875rem',
            fontWeight: 650,
            letterSpacing: '-.035em',
          }}
        >
          Leaf respiration · {args.experimentName}
        </h2>
        <Story />
        <div
          style={{
            height: 300,
            marginTop: 12,
            border: '1px dashed var(--dv-line)',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--dv-ink-muted)',
            fontSize: '.75rem',
            background: 'var(--dv-paper)',
          }}
        >
          Experiment workspace
        </div>
      </div>
    ),
  ],
  parameters: { previewWidth: 960 },
} satisfies Meta<typeof AcquisitionControls>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Start needs no confirmation. */
export const ReadyToStart: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(meta_(canvasElement)).toHaveTextContent('Ready');
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Start acquisition' }),
    );
    await expect(args.onStart).toHaveBeenCalledTimes(1);
    await expect(
      page(canvasElement).queryByRole('dialog'),
    ).not.toBeInTheDocument();
  },
};

/** Starting… locks the button. */
export const Starting: Story = {
  args: { state: 'starting' },
  play: async ({ canvasElement }) => {
    await expect(meta_(canvasElement)).toHaveTextContent('Starting');
    await expect(
      within(canvasElement).getByRole('button', { name: 'Starting…' }),
    ).toBeDisabled();
  },
};

/** The instrument rejected the start: one sentence, still Ready, and Try again. */
export const InstrumentDidntStart: Story = {
  args: { startFailed: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const banner = canvasElement.querySelector('.dv-acq-status')!;
    await expect(banner).toHaveTextContent(
      'MS-01 didn’t start, so nothing was recorded.',
    );
    await expect(banner.querySelectorAll('li')).toHaveLength(0);
    await expect(meta_(canvasElement)).toHaveTextContent('Ready');
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.onStart).toHaveBeenCalledTimes(1);
  },
};

/** Start is unavailable and says why; Connect is offered. */
export const InstrumentDisconnected: Story = {
  args: { state: 'disconnected' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const start = canvas.getByRole('button', { name: 'Start acquisition' });
    await expect(start).toBeDisabled();
    await expect(start).toHaveAccessibleDescription(/MS-01 is disconnected/);
    await expect(meta_(canvasElement)).toHaveTextContent('Not ready');
    await expect(meta_(canvasElement)).toHaveTextContent(
      'MS-01 · Disconnected',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect MS-01' }),
    );
    await expect(args.onConnect).toHaveBeenCalledTimes(1);
  },
};

/** Acquiring with Stop. Asking doesn't stop; Keep acquiring is the default and Escape keeps going. */
export const Acquiring: Story = {
  args: { state: 'acquiring' },
  play: async ({ canvasElement, args }) => {
    const stop = within(canvasElement).getByRole('button', {
      name: 'Stop acquisition',
    });
    await expect(meta_(canvasElement)).toHaveTextContent('Acquiring');
    await expect(meta_(canvasElement)).toHaveTextContent('87 samples');
    await userEvent.click(stop);
    const dialog = await stopDialog(canvasElement);
    await expect(
      dialog.getByRole('heading', { name: 'Stop acquisition for Sample 025?' }),
    ).toBeVisible();
    await expect(dialog.getByTestId('guard-live')).toHaveTextContent(
      '87 samples so far',
    );
    await waitFor(() =>
      expect(
        dialog.getByRole('button', { name: 'Keep acquiring' }),
      ).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(page(canvasElement).queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(stop).toHaveFocus());
    await expect(args.onStop).not.toHaveBeenCalled();
    await userEvent.click(stop);
    await userEvent.click(
      (await stopDialog(canvasElement)).getByRole('button', {
        name: 'Stop acquisition',
      }),
    );
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};

/** A running routine adds one sentence. */
export const RoutineInProgress: Story = {
  parameters: { gallery: false },
  args: {
    state: 'acquiring',
    defaultStopDialogOpen: true,
    routine: { name: 'Timed measurements', remaining: 13, total: 100 },
  },
  play: async ({ canvasElement }) => {
    const summary = (await stopDialog(canvasElement)).getByTestId(
      'guard-summary',
    );
    await expect(summary.querySelectorAll('p')).toHaveLength(2);
    await expect(summary).toHaveTextContent(
      'The Timed measurements routine still has 13 of 100 measurements to take. They won’t run.',
    );
  },
};

/** Stopping… locks the dialog, including Escape. */
export const Stopping: Story = {
  parameters: { gallery: false },
  args: { state: 'stopping' },
  play: async ({ canvasElement }) => {
    const dialog = await stopDialog(canvasElement);
    await expect(
      dialog.getByRole('button', { name: 'Stopping…' }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Keep acquiring' }),
    ).toBeDisabled();
    await expect(
      dialog.getByText('Waiting for MS-01 to confirm…'),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(page(canvasElement).getByRole('dialog')).toBeVisible();
  },
};

/** The instrument didn't confirm: one sentence, still Acquiring, and Try again. */
export const InstrumentDidntConfirm: Story = {
  parameters: { gallery: false },
  args: { state: 'acquiring', stopFailed: true, defaultStopDialogOpen: true },
  play: async ({ canvasElement, args }) => {
    const dialog = await stopDialog(canvasElement);
    const messages = dialog.getByTestId('guard-messages');
    await expect(messages).toHaveTextContent('may still be recording');
    await expect(messages.querySelectorAll('li')).toHaveLength(0);
    await expect(meta_(canvasElement)).toHaveTextContent('Acquiring');
    await userEvent.click(dialog.getByRole('button', { name: 'Try again' }));
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};

/** After stopping: Recorded, no Stop, and the saved count. */
export const Recorded: Story = {
  args: { state: 'recorded', samples: 112, elapsedSeconds: 56 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(meta_(canvasElement)).toHaveTextContent('Recorded');
    await expect(
      canvas.queryByRole('button', {
        name: /Stop acquisition|Start acquisition/,
      }),
    ).not.toBeInTheDocument();
    await expect(
      canvasElement.querySelector('.dv-acq-status'),
    ).toHaveTextContent(
      'Acquisition stopped. 112 samples saved as a recording.',
    );
  },
};

type SessionArgs = AcquisitionControlsProps & {
  startFailsOnce?: boolean;
  stopFailsOnce?: boolean;
};
/** Stateful harness standing in for the instrument: outcomes after 300 ms, two samples per tick while acquiring. */
function Session({ startFailsOnce, stopFailsOnce, ...args }: SessionArgs) {
  const [state, setState] = useState<AcquisitionState>(args.state);
  const [samples, setSamples] = useState(0),
    [seconds, setSeconds] = useState(0);
  const [startFailed, setStartFailed] = useState(false),
    [stopFailed, setStopFailed] = useState(false);
  const [starts, setStarts] = useState(0),
    [stops, setStops] = useState(0);
  useEffect(() => {
    if (state !== 'acquiring' && state !== 'stopping') return;
    const tick = setInterval(() => {
      setSamples((count) => count + 2);
      setSeconds((count) => count + 1);
    }, 250);
    return () => clearInterval(tick);
  }, [state]);
  return (
    <AcquisitionControls
      {...args}
      state={state}
      samples={samples}
      elapsedSeconds={seconds}
      startFailed={startFailed}
      stopFailed={stopFailed}
      onConnect={() => {
        args.onConnect();
        setState('ready');
      }}
      onStart={() => {
        args.onStart();
        setStarts(starts + 1);
        setStartFailed(false);
        setState('starting');
        setTimeout(() => {
          if (startFailsOnce && starts === 0) {
            setStartFailed(true);
            setState('ready');
          } else setState('acquiring');
        }, 300);
      }}
      onStop={() => {
        args.onStop();
        setStops(stops + 1);
        setStopFailed(false);
        setState('stopping');
        setTimeout(() => {
          if (stopFailsOnce && stops === 0) {
            setStopFailed(true);
            setState('acquiring');
          } else setState('recorded');
        }, 300);
      }}
    />
  );
}

/** Start locks while starting, then Acquiring with Stop focused. Counts keep moving while the stop dialog is open. */
export const StartAndStopSession: Story = {
  render: (args) => <Session {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Start acquisition' }),
    );
    await expect(
      canvas.getByRole('button', { name: 'Starting…' }),
    ).toBeDisabled();
    const stop = await canvas.findByRole('button', {
      name: 'Stop acquisition',
    });
    await waitFor(() => expect(stop).toHaveFocus());
    await userEvent.click(stop);
    const live = (await stopDialog(canvasElement)).getByTestId('guard-live');
    const before = parseInt(live.textContent ?? '0', 10);
    await waitFor(() =>
      expect(parseInt(live.textContent ?? '0', 10)).toBeGreaterThan(before),
    );
    await userEvent.click(
      (await stopDialog(canvasElement)).getByRole('button', {
        name: 'Stop acquisition',
      }),
    );
    await expect(
      (await stopDialog(canvasElement)).getByRole('button', {
        name: 'Stopping…',
      }),
    ).toBeDisabled();
    await waitFor(
      () =>
        expect(
          page(canvasElement).queryByRole('dialog'),
        ).not.toBeInTheDocument(),
      { timeout: 10000 },
    );
    await expect(meta_(canvasElement)).toHaveTextContent('Recorded');
    const status = canvasElement.querySelector<HTMLElement>('.dv-acq-status')!;
    await expect(status).toHaveTextContent('samples saved as a recording');
    await waitFor(() => expect(status).toHaveFocus());
    await expect(args.onStart).toHaveBeenCalledTimes(1);
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};

/** Connect re-enables Start; a rejected start and an unconfirmed stop each move focus to Try again. */
export const RecoverySession: Story = {
  args: { state: 'disconnected' },
  render: (args) => <Session {...args} startFailsOnce stopFailsOnce />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect MS-01' }),
    );
    const start = canvas.getByRole('button', { name: 'Start acquisition' });
    await expect(start).toBeEnabled();
    await waitFor(() => expect(start).toHaveFocus());
    await userEvent.click(start);
    const retry = await canvas.findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toHaveFocus());
    await expect(meta_(canvasElement)).toHaveTextContent('Ready');
    await userEvent.click(retry);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Stop acquisition' }),
    );
    await userEvent.click(
      (await stopDialog(canvasElement)).getByRole('button', {
        name: 'Stop acquisition',
      }),
    );
    const stopRetry = await (await stopDialog(canvasElement)).findByRole(
      'button',
      { name: 'Try again' },
    );
    await waitFor(() => expect(stopRetry).toHaveFocus());
    await expect(meta_(canvasElement)).toHaveTextContent('Acquiring');
    await userEvent.click(stopRetry);
    await waitFor(() =>
      expect(meta_(canvasElement)).toHaveTextContent('Recorded'),
    );
    await expect(args.onStart).toHaveBeenCalledTimes(2);
    await expect(args.onStop).toHaveBeenCalledTimes(2);
  },
};

/** Connecting collapses the disconnected warning away (inert while it goes) and Start takes focus at once. */
export const ConnectCollapsesWarning: Story = {
  args: { state: 'disconnected' },
  render: (args) => <Session {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect MS-01' }),
    );
    const warning = canvasElement.querySelector('.dv-acq-status')!;
    await expect(warning.closest('[data-motion=leave]')).toHaveAttribute(
      'inert',
    );
    await expect(
      canvas.getByRole('button', { name: 'Start acquisition' }),
    ).toHaveFocus();
    await settleMotion();
    await waitFor(() =>
      expect(canvasElement.querySelector('.dv-acq-status')).toBeNull(),
    );
  },
};

/** Under reduced motion the warning goes in the same frame, with nothing animating. */
export const ConnectCollapsesWarningReducedMotion: Story = {
  ...ConnectCollapsesWarning,
  beforeEach: reduceMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Connect MS-01' }),
    );
    await expect(canvasElement.querySelector('.dv-acq-status')).toBeNull();
    await expect(canvasElement.querySelector('[data-motion]')).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'Start acquisition' }),
    ).toHaveFocus();
  },
};
