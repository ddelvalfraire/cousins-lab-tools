import { Button, Group, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { useArgCopy } from './useArgCopy';

function StoryHost({ arg }: { arg: string }) {
  const [value, setValue] = useArgCopy(arg);
  return (
    <Group>
      <Text data-testid="copy">{value}</Text>
      <Button onClick={() => setValue('changed by the story')}>
        Change the copy
      </Button>
    </Group>
  );
}

/** Stands in for the Controls panel, which hands the host a new arg. */
function ArgCopyDemo() {
  const [arg, setArg] = useState('first arg');
  return (
    <Group>
      <StoryHost arg={arg} />
      <Button variant="default" onClick={() => setArg('second arg')}>
        New arg
      </Button>
    </Group>
  );
}

const meta = {
  title: 'Foundations/Story arg copy',
  component: ArgCopyDemo,
  parameters: { previewWidth: 640 },
} satisfies Meta<typeof ArgCopyDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The host's copy changes from the story, and a new arg replaces it. */
export const FollowsNewArgs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      copy = canvas.getByTestId('copy');
    await expect(copy).toHaveTextContent('first arg');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Change the copy' }),
    );
    await expect(copy).toHaveTextContent('changed by the story');
    await userEvent.click(canvas.getByRole('button', { name: 'New arg' }));
    await expect(copy).toHaveTextContent('second arg');
  },
};
