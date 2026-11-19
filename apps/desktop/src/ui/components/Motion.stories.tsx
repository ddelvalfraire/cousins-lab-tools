import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { reduceMotion } from '../../../.storybook/settleMotion';
import { motion } from '../motion';
import { MotionList, Presence, Swap } from './Motion';
import { StatusBanner } from './Primitives';

function pauseAnimations(element: Element) {
  for (const animation of element.getAnimations()) animation.pause();
}

function finishAnimations(element: Element) {
  for (const animation of element.getAnimations()) animation.finish();
}

function MessageDemo({ variant }: { variant: 'collapse' | 'fade' | 'pop' }) {
  const [error, setError] = useState<string | null>(
    'Choose a reference recording.',
  );
  return (
    <div style={{ display: 'grid', gap: 12, fontSize: '.8125rem' }}>
      <button
        type="button"
        onClick={() =>
          setError((current) =>
            current ? null : 'Choose a reference recording.',
          )
        }
      >
        {error ? 'Fix the problem' : 'Break it again'}
      </button>
      <Presence show={!!error} variant={variant}>
        <StatusBanner severity="error">
          {error}
          <a href="#reference">Go to the field</a>
        </StatusBanner>
      </Presence>
      <p data-testid="below">Content under the message moves with it.</p>
    </div>
  );
}

function TabsDemo() {
  const [tab, setTab] = useState<'details' | 'signals'>('details');
  return (
    <div style={{ display: 'grid', gap: 12, fontSize: '.8125rem' }}>
      <div role="tablist" aria-label="Pane">
        {(['details', 'signals'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {id === 'details' ? 'Details' : 'Signals'}
          </button>
        ))}
      </div>
      <Swap swapKey={tab}>
        {tab === 'details' ? (
          <section aria-label="Details">
            <p>Sample 024 · recorded 14:05:12</p>
            <button type="button">Rename</button>
          </section>
        ) : (
          <section aria-label="Signals">
            <p>Mass 44 · Mass 45 · Mass 46</p>
          </section>
        )}
      </Swap>
    </div>
  );
}

const meta = {
  title: 'Foundations/Motion',
  component: MessageDemo,
  args: { variant: 'collapse' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['collapse', 'fade', 'pop'] },
  },
  parameters: { previewWidth: 480 },
} satisfies Meta<typeof MessageDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A message that leaves keeps its place only while it collapses: at once it is inert and out of the accessibility
 * tree, so it takes no tab stop and is not read twice, and once the collapse ends it is gone from the page.
 */
export const MessageLeaves: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      below = canvas.getByTestId('below'),
      top = below.getBoundingClientRect().top;
    const banner = canvas.getByRole('alert');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Fix the problem' }),
    );
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(
      canvas.queryByRole('link', { name: 'Go to the field' }),
    ).toBeNull();
    if (!reduced()) {
      await expect(banner).toBeInTheDocument();
      await expect(banner.closest('[inert]')).not.toBeNull();
    }
    await waitFor(() => expect(banner).not.toBeInTheDocument(), {
      timeout: motion.slow * 4,
    });
    await expect(
      canvas.queryByText('Choose a reference recording.'),
    ).toBeNull();
    await expect(below.getBoundingClientRect().top).toBeLessThan(top);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Break it again' }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Choose a reference recording.',
    );
    await waitFor(
      () => expect(below.getBoundingClientRect().top).toBeCloseTo(top, 0),
      { timeout: motion.slow * 4 },
    );
  },
};

/** The same exit as a fade, for things that sit over other content. */
export const MessageFades: Story = {
  ...MessageLeaves,
  args: { variant: 'fade' },
};

/**
 * A tab's new content is there at once; the old content fades out over it, out of the accessibility tree, and is
 * then removed.
 */
export const TabContentSwaps: Story = {
  render: () => <TabsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      details = canvas.getByRole('region', { name: 'Details' });
    await userEvent.click(canvas.getByRole('tab', { name: 'Signals' }));
    await expect(
      canvas.getByRole('region', { name: 'Signals' }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('region', { name: 'Details' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Rename' })).toBeNull();
    if (!reduced())
      await expect(details.closest('[data-motion=leave]')).toHaveAttribute(
        'inert',
      );
    await waitFor(() => expect(details).not.toBeInTheDocument(), {
      timeout: motion.slow * 4,
    });
    await waitFor(
      () => expect(canvasElement.querySelector('[data-motion]')).toBeNull(),
      { timeout: motion.slow * 4 },
    );
  },
};

function RowsDemo() {
  const [filtered, setFiltered] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setFiltered((value) => !value)}>
        Filter rows
      </button>
      <table>
        <tbody>
          <MotionList>
            {(filtered ? ['B'] : ['A', 'B', 'C']).map((name) => (
              <tr key={name}>
                <td>{name}</td>
              </tr>
            ))}
          </MotionList>
        </tbody>
      </table>
    </>
  );
}

export const RowsLeaveAndReturn: Story = {
  render: () => <RowsDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      button = canvas.getByRole('button', { name: 'Filter rows' });
    await expect(canvasElement.querySelector('[data-motion]')).toBeNull();
    await userEvent.click(button);
    await expect(canvas.getAllByRole('row')).toHaveLength(1);
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('tr')).toHaveLength(1),
    );
    await userEvent.click(button);
    await expect(canvas.getAllByRole('row')).toHaveLength(3);
    await userEvent.click(button);
    await userEvent.click(button);
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-motion]')).toBeNull(),
    );
    await expect(canvasElement.querySelectorAll('tr')).toHaveLength(3);
    await expect(button).toHaveFocus();
  },
};

export const RowsReducedMotion: Story = {
  ...RowsLeaveAndReturn,
  beforeEach: reduceMotion,
};

function SuccessiveRowsDemo() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Remove first row
      </button>
      <table>
        <tbody>
          <MotionList>
            {['A', 'B', 'C'].slice(count).map((name) => (
              <tr key={name}>
                <td>{name}</td>
              </tr>
            ))}
          </MotionList>
        </tbody>
      </table>
    </>
  );
}

export const SuccessiveRowsKeepOrder: Story = {
  render: () => <SuccessiveRowsDemo />,
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Remove first row',
    });
    button.click();
    await waitFor(() =>
      expect(within(canvasElement).getAllByRole('row')).toHaveLength(2),
    );
    canvasElement.querySelectorAll('tr').forEach(pauseAnimations);
    button.click();
    await waitFor(() =>
      expect(within(canvasElement).getAllByRole('row')).toHaveLength(1),
    );
    const rows = [...canvasElement.querySelectorAll('tr')];
    await expect(rows.map((row) => row.textContent)).toEqual(['A', 'B', 'C']);
    rows.forEach(finishAnimations);
    await waitFor(() =>
      expect(canvasElement.querySelectorAll('tr')).toHaveLength(1),
    );
  },
};
