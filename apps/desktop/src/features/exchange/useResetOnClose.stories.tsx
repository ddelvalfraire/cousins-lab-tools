import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { useResetOnClose } from './useResetOnClose';

/** Stands in for a dialog that stays mounted while closed and keeps a draft. */
function DraftPanel({ opened }: { opened: boolean }) {
  const [draft, setDraft] = useState('');
  useResetOnClose(opened, () => setDraft(''));
  return (
    <label>
      Draft
      <input
        value={draft}
        disabled={!opened}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
    </label>
  );
}

function ResetOnCloseDemo({ initiallyOpened }: { initiallyOpened: boolean }) {
  const [opened, setOpened] = useState(initiallyOpened);
  return (
    <div>
      <DraftPanel opened={opened} />
      <button type="button" onClick={() => setOpened(!opened)}>
        {opened ? 'Close' : 'Open'}
      </button>
    </div>
  );
}

const meta = {
  title: 'Hooks/useResetOnClose',
  component: ResetOnCloseDemo,
  args: { initiallyOpened: true },
  parameters: { gallery: false },
} satisfies Meta<typeof ResetOnCloseDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The draft stays while open and is gone after closing, so the next opening starts empty. */
export const ClearsDraftOnClose: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Draft' });
    await step('Typing while open keeps the draft', async () => {
      await userEvent.type(input, 'Notes');
      await expect(input).toHaveValue('Notes');
    });
    await step('Closing clears it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Close' }));
      await expect(input).toHaveValue('');
    });
    await step('Reopening starts empty and edits again', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Open' }));
      await expect(input).toHaveValue('');
      await userEvent.type(input, 'More');
      await expect(input).toHaveValue('More');
    });
  },
};
