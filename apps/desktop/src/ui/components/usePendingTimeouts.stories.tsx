import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { usePendingTimeouts } from './usePendingTimeouts';

const DELAY = 100;

function TimerOwner({ onFire }: { onFire: () => void }) {
  const timeouts = usePendingTimeouts();
  return (
    <div ref={timeouts.ref}>
      <button type="button" onClick={() => timeouts.schedule(onFire, DELAY)}>
        Start timer
      </button>
    </div>
  );
}

/** A component that starts timeouts, and a button that removes it while one is pending. */
function PendingTimeoutsDemo({ onFire }: { onFire: () => void }) {
  const [owner, setOwner] = useState(true);
  return (
    <div>
      {owner && <TimerOwner onFire={onFire} />}
      <button type="button" onClick={() => setOwner(false)}>
        Remove timer owner
      </button>
    </div>
  );
}

const meta = {
  title: 'Hooks/usePendingTimeouts',
  component: PendingTimeoutsDemo,
  args: { onFire: fn() },
  parameters: { gallery: false },
} satisfies Meta<typeof PendingTimeoutsDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

const pause = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/** A timeout runs while its owner is mounted and is cleared when the owner unmounts. */
export const ClearedOnUnmount: Story = {
  play: async ({ canvasElement, args, step }) => {
    const canvas = within(canvasElement);
    await step('Runs after the delay', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Start timer' }),
      );
      await waitFor(() => expect(args.onFire).toHaveBeenCalledOnce());
    });
    await step('Never runs once the owner is gone', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Start timer' }),
      );
      await userEvent.click(
        canvas.getByRole('button', { name: 'Remove timer owner' }),
      );
      await pause(DELAY * 3);
      await expect(args.onFire).toHaveBeenCalledOnce();
    });
  },
};
