import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  type UnsavedChange,
  UnsavedChangesDialog,
  type UnsavedChangesPhase,
} from './UnsavedChangesDialog';

const interval: UnsavedChange = {
  short: 'Sample interval: 0.5 s → 0.25 s',
  sentence: 'Sample interval changed from 0.5 s to 0.25 s.',
};
const signals: UnsavedChange = {
  short: 'Required signals: added Mass 49',
  sentence: 'Required signals changed: added Mass 49.',
};
const layout: UnsavedChange = {
  short: 'Chart layout: Stacked → Overlaid',
  sentence: 'Chart layout changed from Stacked to Overlaid.',
};
const cleared: UnsavedChange = {
  short: 'Sample interval: 0.5 s → empty',
  sentence: 'The sample interval was cleared.',
};

/** The Modal renders in a portal, so queries run against the whole document. */
const page = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body);
const dialogParts = (canvasElement: HTMLElement) => {
  const dialog = page(canvasElement).getByRole('dialog');
  const body = within(dialog);
  return {
    dialog,
    body,
    summary: body.getByTestId('guard-summary'),
    keep: body.getByRole('button', { name: 'Keep editing' }),
    discard: body.getByRole('button', { name: 'Discard changes' }),
  };
};

const meta = {
  title: 'Components/UnsavedChangesDialog',
  component: UnsavedChangesDialog,
  args: {
    opened: true,
    intent: 'leave',
    changes: [interval],
    problems: [],
    revision: 3,
    phase: 'idle',
    onKeepEditing: fn(),
    onDiscard: fn(),
    onSave: fn(),
    onCheckStatus: fn(),
  },
  parameters: { previewWidth: 480, gallery: false },
} satisfies Meta<typeof UnsavedChangesDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One change reads as a sentence. Keep editing has focus; Escape does the same. */
export const OneChange: Story = {
  play: async ({ canvasElement, args }) => {
    const { body, summary, keep, discard } = dialogParts(canvasElement);
    await expect(
      body.getByRole('heading', { name: 'Save changes before leaving?' }),
    ).toBeVisible();
    await expect(summary).toHaveTextContent(
      /^Sample interval changed from 0\.5 s to 0\.25 s\.$/,
    );
    await expect(summary.querySelectorAll('li')).toHaveLength(0);
    await expect(
      body.getByText('Saving creates R4. Discarding keeps R3 as it is.'),
    ).toBeVisible();
    await waitFor(() => expect(keep).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await expect(args.onKeepEditing).toHaveBeenCalledTimes(1);
    await userEvent.click(discard);
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
    await userEvent.click(body.getByRole('button', { name: 'Save and leave' }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    await expect(args.onCheckStatus).not.toHaveBeenCalled();
  },
};

/** Two or more changes read as a list. */
export const SeveralChanges: Story = {
  args: { changes: [signals, interval, layout] },
  play: async ({ canvasElement }) => {
    const { summary } = dialogParts(canvasElement);
    await expect(summary).toHaveTextContent('3 changes since R3:');
    await expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([signals.short, interval.short, layout.short]);
  },
};

/** A clean editor leaves without asking. */
export const NoChanges: Story = {
  args: { changes: [] },
  play: async ({ canvasElement }) => {
    await expect(
      page(canvasElement).queryByRole('dialog'),
    ).not.toBeInTheDocument();
  },
};

/** An unsaveable draft can only be kept or discarded. One problem reads as a sentence. */
export const DraftCantBeSaved: Story = {
  args: {
    changes: [cleared],
    problems: ['Enter a sample interval greater than 0 s.'],
  },
  play: async ({ canvasElement, args }) => {
    const { body, summary, discard } = dialogParts(canvasElement);
    await expect(summary).toHaveTextContent(
      /^The sample interval was cleared\.$/,
    );
    const messages = body.getByTestId('guard-messages');
    await expect(messages).toHaveTextContent(
      /^Enter a sample interval greater than 0 s\.$/,
    );
    await expect(messages.querySelectorAll('li')).toHaveLength(0);
    await expect(
      body.getByText(
        'This draft can’t be saved yet. Keep editing to fix it, or discard your changes.',
      ),
    ).toBeVisible();
    await expect(
      body.getByRole('button', { name: 'Save and leave' }),
    ).toBeDisabled();
    await userEvent.click(discard);
    await expect(args.onDiscard).toHaveBeenCalledTimes(1);
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** Saving locks every action and Escape. */
export const Saving: Story = {
  args: { phase: 'saving' },
  play: async ({ canvasElement, args }) => {
    const { dialog, body, keep, discard } = dialogParts(canvasElement);
    const confirm = body.getByRole('button', { name: 'Saving…' });
    for (const button of [keep, discard, confirm])
      await expect(button).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(dialog).toBeVisible();
    await expect(args.onKeepEditing).not.toHaveBeenCalled();
  },
};

/** A failed save keeps the draft; one sentence, and the button becomes Retry save. */
export const SaveFails: Story = {
  args: { phase: 'failed' },
  play: async ({ canvasElement, args }) => {
    const { body } = dialogParts(canvasElement);
    const messages = body.getByTestId('guard-messages');
    await expect(messages).toHaveTextContent(
      /^Couldn’t save R4\. Your changes are still here\.$/,
    );
    await expect(messages.querySelectorAll('li')).toHaveLength(0);
    await userEvent.click(body.getByRole('button', { name: 'Retry save' }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
  },
};

/** The earlier save's outcome is unknown: Check status never saves a second time. */
export const SaveOutcomeUnknown: Story = {
  args: { phase: 'unknown' },
  play: async ({ canvasElement, args }) => {
    const { body } = dialogParts(canvasElement);
    await expect(
      body.getByRole('heading', { name: 'Save changes before leaving?' }),
    ).toBeVisible();
    await expect(body.getByTestId('guard-messages')).toHaveTextContent(
      'Couldn’t confirm whether R4 was saved',
    );
    await expect(
      body.getByTestId('guard-messages').querySelector('[role=status]'),
    ).not.toBeNull();
    await expect(args.onCheckStatus).not.toHaveBeenCalled();
  },
};

/** Closing the window uses the same dialog with close wording. */
export const ClosingWindow: Story = {
  args: { intent: 'close', phase: 'unknown' },
  play: async ({ canvasElement, args }) => {
    const { body } = dialogParts(canvasElement);
    await expect(
      body.getByRole('heading', { name: 'Save changes before closing?' }),
    ).toBeVisible();
    await expect(body.getByTestId('guard-messages')).toHaveTextContent(
      'Couldn’t confirm whether R4 was saved',
    );
    await userEvent.click(body.getByRole('button', { name: 'Check status' }));
    await expect(args.onCheckStatus).toHaveBeenCalledTimes(1);
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** Stateful harness: the first save fails, focus moves to Retry save, and the retry succeeds. */
export const RetryAfterFailure: Story = {
  render: function RetryHarness(args) {
    const [phase, setPhase] = useState<UnsavedChangesPhase>('idle');
    const [attempts, setAttempts] = useState(0);
    const [opened, setOpened] = useState(true);
    const save = () => {
      args.onSave();
      setPhase('saving');
      setAttempts(attempts + 1);
      setTimeout(
        () => (attempts === 0 ? setPhase('failed') : setOpened(false)),
        300,
      );
    };
    return (
      <UnsavedChangesDialog
        {...args}
        opened={opened}
        phase={phase}
        onSave={save}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const { body } = dialogParts(canvasElement);
    await userEvent.click(body.getByRole('button', { name: 'Save and leave' }));
    await expect(body.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    const retry = await body.findByRole('button', { name: 'Retry save' });
    await waitFor(() => expect(retry).toHaveFocus());
    await userEvent.click(retry);
    await waitFor(() =>
      expect(page(canvasElement).queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await expect(args.onSave).toHaveBeenCalledTimes(2);
  },
};
