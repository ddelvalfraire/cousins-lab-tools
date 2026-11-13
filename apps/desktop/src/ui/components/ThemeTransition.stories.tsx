import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useAppearance, type AppearancePreference } from '../appearance';

const choices: { value: AppearancePreference; label: string }[] = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match system' }];

/** Changing the scheme reveals the new one as a circle from the button that was pressed. */
function ThemeTransitionDemo() {
  const appearance = useAppearance();
  return <Stack gap="md">
    <Group gap="xs" role="group" aria-label="Appearance">
      {choices.map(choice => <Button key={choice.value} variant={appearance.preference === choice.value ? 'filled' : 'default'} aria-pressed={appearance.preference === choice.value}
        onClick={event => appearance.setPreference(choice.value, event.currentTarget)}>{choice.label}</Button>)}
    </Group>
    <Text size="sm" data-testid="showing">Showing the {appearance.scheme} scheme.</Text>
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Text fw={600}>Sample 024</Text>
        <Text size="sm" c="dimmed">Recorded 14:05:12 · Mass 44, 45 and 46</Text>
        <TextInput label="Name" defaultValue="Sample 024" />
        <Group gap="xs"><Button size="xs">Open</Button><Button size="xs" variant="default">Rename</Button></Group>
      </Stack>
    </Paper>
  </Stack>;
}

const meta = { title: 'Foundations/Theme transition', component: ThemeTransitionDemo, parameters: { previewWidth: 480 } } satisfies Meta<typeof ThemeTransitionDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

const html = () => document.documentElement;
/** The reveal has ended and its marker is gone, so the accessibility scan reads settled colours. */
const settled = () => waitFor(() => expect(html()).not.toHaveAttribute('data-dv-theme-reveal'));

/** Dark and Light switch the whole document; the view transition is asynchronous, so the checks wait for it. */
export const SwitchesScheme: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(html()).toHaveAttribute('data-mantine-color-scheme', 'dark'));
    await expect(canvas.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    await settled();
    await userEvent.click(canvas.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(html()).toHaveAttribute('data-mantine-color-scheme', 'light'));
    await expect(canvas.getByTestId('showing')).toHaveTextContent('Showing the light scheme.');
    await settled();
  },
};

/** Quick changes skip the running reveal instead of queueing behind it, and the last one wins. */
export const RapidChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Dark', 'Light', 'Dark']) await userEvent.click(canvas.getByRole('button', { name }));
    await waitFor(() => expect(html()).toHaveAttribute('data-mantine-color-scheme', 'dark'));
    await expect(canvas.getByTestId('showing')).toHaveTextContent('Showing the dark scheme.');
    await settled();
  },
};
