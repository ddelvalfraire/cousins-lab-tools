import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { KeyboardShortcuts } from './KeyboardShortcuts';

const meta = {
  title: 'Components/KeyboardShortcuts',
  component: KeyboardShortcuts,
  args: { opened: true, onClose: fn(), mac: true },
  parameters: { previewWidth: 720 },
} satisfies Meta<typeof KeyboardShortcuts>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialog = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Keyboard shortcuts' });

export const MacOS: Story = {
  play: async ({ canvasElement, args }) => {
    const shortcuts = within(await dialog(canvasElement));
    await expect(shortcuts.getByText('Shortcuts for macOS.')).toBeVisible();
    const command = shortcuts.getByText('Open command center').parentElement!;
    await expect([...command.querySelectorAll('kbd')].map(key => key.textContent)).toEqual(['⌘', 'K']);
    const presets = shortcuts.getByText('Go to Presets', { selector: 'dt' }).parentElement!;
    await expect(presets).toHaveTextContent('GthenP');
    await waitFor(() => expect(shortcuts.getByRole('button', { name: 'Close dialog' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const WindowsAndLinux: Story = {
  args: { mac: false },
  play: async ({ canvasElement }) => {
    const shortcuts = within(await dialog(canvasElement));
    await expect(shortcuts.getByText('Shortcuts for Windows and Linux.')).toBeVisible();
    const settings = shortcuts.getByText('Go to Settings').parentElement!;
    await expect([...settings.querySelectorAll('kbd')].map(key => key.textContent)).toEqual(['Ctrl', ',']);
  },
};
