import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { useResettingCopy } from './useResettingCopy';

function EditableCopy({ source }: { source: string }) {
  const [value, setValue] = useResettingCopy(source);
  return (
    <label>
      Copy
      <input
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
    </label>
  );
}

/** An owner that can rerender without changing the source, or replace it. */
function ResettingCopyDemo({ initial }: { initial: string }) {
  const [source, setSource] = useState(initial);
  const [renders, setRenders] = useState(0);
  return (
    <div>
      <EditableCopy source={source} />
      <p>Owner renders: {renders}</p>
      <button type="button" onClick={() => setRenders((n) => n + 1)}>
        Rerender owner
      </button>
      <button type="button" onClick={() => setSource('Replaced')}>
        Replace source
      </button>
    </div>
  );
}

const meta = {
  title: 'Hooks/useResettingCopy',
  component: ResettingCopyDemo,
  args: { initial: 'First' },
  parameters: { gallery: false },
} satisfies Meta<typeof ResettingCopyDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Local edits stay until the owner hands over a different source, which replaces them. */
export const KeepsEditsUntilSourceChanges: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Copy' });
    await expect(input).toHaveValue('First');
    await step('Edits survive an owner render', async () => {
      await userEvent.type(input, ' edited');
      await userEvent.click(
        canvas.getByRole('button', { name: 'Rerender owner' }),
      );
      await expect(canvas.getByText('Owner renders: 1')).toBeVisible();
      await expect(input).toHaveValue('First edited');
    });
    await step('A new source replaces the edits', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Replace source' }),
      );
      await expect(input).toHaveValue('Replaced');
    });
  },
};
