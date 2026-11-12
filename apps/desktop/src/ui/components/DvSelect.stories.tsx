import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from '@mantine/core';
import { useId, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DvSelect, type DvSelectOption } from './DvSelect';
import { chooseOption } from './chooseOption';

const separators: DvSelectOption[] = [{ value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }];
const recordings: DvSelectOption[] = Array.from({ length: 40 }, (_, i) => ({ value: `sample${String(i + 1).padStart(3, '0')}`, label: `Sample ${String(i + 1).padStart(3, '0')} · leaf respiration` }));
const sources: DvSelectOption[] = [
  { value: '', label: 'Choose a source' },
  { value: 'sim', label: 'Simulator · 4 signals', group: 'Live' },
  { value: 'probe', label: 'Temperature probe · 1 signal', group: 'Live', disabled: true },
  { value: 'sample024', label: 'Sample 024 · 4 signals', group: 'Recorded' },
  { value: 'sample026', label: 'Sample 026 · 4 signals', group: 'Recorded' },
];

function Field({ label, initial, error, onChange, ...props }: { label: string; initial: string; error?: string; onChange: (value: string) => void; options: readonly DvSelectOption[]; disabled?: boolean }) {
  const id = useId(), [value, setValue] = useState(initial);
  return <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
    <label htmlFor={id} style={{ fontWeight: 600 }}>{label}</label>
    <DvSelect {...props} id={id} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
      onChange={next => { setValue(next); onChange(next); }} style={{ width: '100%' }} />
    {error && <span id={`${id}-error`} style={{ color: 'var(--dv-error)' }}>{error}</span>}
  </div>;
}

const meta = {
  title: 'Components/Select',
  component: Field,
  args: { label: 'Column separator', initial: 'comma', options: separators, onChange: fn() },
  parameters: { previewWidth: 360, layout: 'centered' },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

const select = (canvasElement: HTMLElement, name = 'Column separator') => within(canvasElement).getByRole('combobox', { name });
const list = (control: HTMLElement) => document.getElementById(control.getAttribute('aria-controls') ?? '');
const highlighted = (control: HTMLElement) => document.getElementById(control.getAttribute('aria-activedescendant') ?? '')?.textContent;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement);
    await expect(control).toHaveValue('comma');
    await expect(control).toHaveTextContent('Comma');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await chooseOption(control, 'Semicolon');
    await expect(args.onChange).toHaveBeenCalledWith('semicolon');
    await expect(control).toHaveValue('semicolon');
    await expect(control).toHaveFocus();
  },
};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const control = select(canvasElement), before = canvasElement.getBoundingClientRect();
    await userEvent.click(control);
    const listbox = await waitFor(() => { const element = list(control); if (!element) throw new Error('closed'); return element; });
    await expect(listbox).toHaveAttribute('role', 'listbox');
    await expect(listbox).toHaveAccessibleName('Column separator');
    await expect(within(listbox).getByRole('option', { name: 'Comma' })).toHaveAttribute('aria-selected', 'true');
    // The list is portalled, so opening it does not move or resize the field around it.
    await expect(canvasElement.contains(listbox)).toBe(false);
    await expect(canvasElement.getBoundingClientRect().height).toBe(before.height);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement);
    await expect(control).toBeDisabled();
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-expanded', 'false');
  },
};

export const Invalid: Story = {
  args: { error: 'Comma is also the decimal separator. Choose semicolon or tab.' },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement);
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(control).toHaveAccessibleDescription('Comma is also the decimal separator. Choose semicolon or tab.');
  },
};

export const LongList: Story = {
  args: { label: 'Recording', initial: 'sample030', options: recordings },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement, 'Recording');
    await userEvent.click(control);
    const listbox = await waitFor(() => { const element = list(control); if (!element) throw new Error('closed'); return element; });
    // Taller lists scroll inside the popup, which stays within the window, and the chosen option is scrolled into view.
    await waitFor(() => expect(listbox.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight));
    const chosen = within(listbox).getByRole('option', { name: /Sample 030/ }), viewport = listbox.closest('[data-scrollarea-viewport]')!;
    await waitFor(() => expect(chosen.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.getBoundingClientRect().bottom + 1));
  },
};

export const GroupsAndDisabledOption: Story = {
  args: { label: 'Data source', initial: '', options: sources },
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement, 'Data source');
    await userEvent.click(control);
    const listbox = await waitFor(() => { const element = list(control); if (!element) throw new Error('closed'); return element; });
    await expect(within(listbox).getByRole('group', { name: 'Live' })).toBeInTheDocument();
    const probe = within(listbox).getByRole('option', { name: /Temperature probe/ });
    await expect(probe).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(probe);
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
  },
};

/** APG select-only combobox keys: arrows, Home and End, type-ahead, Enter, Space, Escape and Tab. */
export const Keyboard: Story = {
  args: { label: 'Data source', initial: 'sim', options: sources },
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement, 'Data source');
    control.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(highlighted(control)).toBe('Simulator · 4 signals');
    // Arrow keys skip the disabled probe and stop at the ends instead of wrapping.
    await userEvent.keyboard('{ArrowDown}');
    await expect(highlighted(control)).toBe('Sample 024 · 4 signals');
    await userEvent.keyboard('{End}{ArrowDown}');
    await expect(highlighted(control)).toBe('Sample 026 · 4 signals');
    await userEvent.keyboard('{Home}');
    await expect(highlighted(control)).toBe('Choose a source');
    await userEvent.keyboard('{Escape}');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onChange).not.toHaveBeenCalled();

    // Typing opens the list on the first match; the same letter again moves to the next match.
    await userEvent.keyboard('s');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(highlighted(control)).toBe('Sample 024 · 4 signals');
    await userEvent.keyboard('s');
    await expect(highlighted(control)).toBe('Sample 026 · 4 signals');
    await userEvent.keyboard('{Enter}');
    await expect(args.onChange).toHaveBeenLastCalledWith('sample026');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(control).toHaveFocus();

    await userEvent.keyboard('{End}');
    await expect(highlighted(control)).toBe('Sample 026 · 4 signals');
    await userEvent.keyboard('{ArrowUp} ');
    await expect(args.onChange).toHaveBeenLastCalledWith('sample024');

    await userEvent.keyboard('{Home}');
    await userEvent.tab();
    await expect(args.onChange).toHaveBeenLastCalledWith('');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
  },
};

function InDialog() {
  const [value, setValue] = useState('comma');
  return <Modal opened onClose={() => {}} title="Export recording" closeButtonProps={{ 'aria-label': 'Close' }} classNames={{ root: 'dvdash' }}>
    <div style={{ height: 70, overflow: 'hidden' }}>
      <label htmlFor="export-separator" style={{ display: 'block', fontSize: 13 }}>Column separator</label>
      <DvSelect id="export-separator" value={value} options={separators} onChange={setValue} />
    </div>
  </Modal>;
}

/** Inside a dialog and a clipping box, the list opens over both, and Escape closes the list but not the dialog. */
export const InsideDialog: Story = {
  render: () => <InDialog />,
  play: async () => {
    const body = within(document.body);
    const control = await body.findByRole('combobox', { name: 'Column separator' }), dialog = body.getByRole('dialog');
    await userEvent.click(control);
    const listbox = await waitFor(() => { const element = list(control); if (!element) throw new Error('closed'); return element; });
    const options = within(listbox).getAllByRole('option'), last = options[options.length - 1].getBoundingClientRect();
    await expect(document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)?.closest('[role=option]')).toBe(options[options.length - 1]);
    await expect(last.bottom).toBeGreaterThan(control.parentElement!.getBoundingClientRect().bottom);
    await userEvent.keyboard('{Escape}');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog).toBeInTheDocument();
  },
};

export const Narrow: Story = {
  args: { label: 'Recording', initial: 'sample001', options: recordings },
  parameters: { previewWidth: 200 },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement, 'Recording');
    await userEvent.click(control);
    const listbox = await waitFor(() => { const element = list(control); if (!element) throw new Error('closed'); return element; });
    const box = listbox.closest('.dv-select-dropdown')!.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  },
};
