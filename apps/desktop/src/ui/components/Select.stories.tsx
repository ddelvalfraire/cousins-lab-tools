import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal, Select, type ComboboxData } from '@mantine/core';
import { useId, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { chooseOption } from './chooseOption';
import { chosen, selectAria } from './select';

const separators = [{ value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }];
const recordings = Array.from({ length: 40 }, (_, i) => ({ value: `sample${String(i + 1).padStart(3, '0')}`, label: `Sample ${String(i + 1).padStart(3, '0')} · leaf respiration` }));
const sources: ComboboxData = [
  { value: '', label: 'Choose a source' },
  { group: 'Live', items: [{ value: 'sim', label: 'Simulator · 4 signals' }, { value: 'probe', label: 'Temperature probe · 1 signal', disabled: true }] },
  { group: 'Recorded', items: [{ value: 'sample024', label: 'Sample 024 · 4 signals' }, { value: 'sample026', label: 'Sample 026 · 4 signals' }] },
];

/** A field labelled the way the app labels its selects: its own `<label htmlFor>` and an error kept outside the field. */
function Field({ label, initial, error, onChange, data, disabled }: { label: string; initial: string; error?: string; onChange: (value: string) => void; data: ComboboxData; disabled?: boolean }) {
  const id = useId(), [value, setValue] = useState(initial);
  return <div style={{ display: 'grid', gap: 6, fontSize: '.8125rem' }}>
    <label htmlFor={id} style={{ fontWeight: 600 }}>{label}</label>
    <Select id={id} aria-label={label} data={data} value={value} disabled={disabled} {...selectAria({ invalid: !!error, describedBy: error ? `${id}-error` : undefined })}
      onChange={chosen(next => { setValue(next); onChange(next); })} />
    {error && <span id={`${id}-error`} style={{ color: 'var(--dv-error)' }}>{error}</span>}
  </div>;
}

const meta = {
  title: 'Components/Select',
  component: Field,
  args: { label: 'Column separator', initial: 'comma', data: separators, onChange: fn() },
  parameters: { previewWidth: 360, layout: 'centered' },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

const select = (canvasElement: HTMLElement, name = 'Column separator') => within(canvasElement).getByRole('combobox', { name });
const openList = (control: HTMLElement) => waitFor(() => {
  const element = document.getElementById(control.getAttribute('aria-controls') ?? '');
  if (!element?.checkVisibility()) throw new Error('closed');
  return element;
});
const highlighted = (control: HTMLElement) => document.getElementById(control.getAttribute('aria-activedescendant') ?? '')?.textContent;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement);
    await expect(control).toHaveValue('Comma');
    await expect(control).toHaveAttribute('readonly');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await chooseOption(control, 'semicolon');
    await expect(args.onChange).toHaveBeenCalledWith('semicolon');
    await expect(control).toHaveValue('Semicolon');
    await expect(control).toHaveFocus();
    // The list fades out, then leaves the accessibility tree.
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('listbox')).toBeNull());
    // Choosing the current option again keeps it; the theme turns off Mantine's deselect.
    await chooseOption(control, 'semicolon');
    await expect(control).toHaveValue('Semicolon');
  },
};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const control = select(canvasElement), before = canvasElement.getBoundingClientRect();
    await userEvent.click(control);
    const listbox = await openList(control);
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(within(listbox).getByRole('option', { name: 'Comma' })).toHaveAttribute('aria-selected', 'true');
    // The list is portalled, so opening it does not move or resize the field around it.
    await expect(canvasElement.contains(listbox)).toBe(false);
    const after = canvasElement.getBoundingClientRect();
    await expect([after.top, after.height]).toEqual([before.top, before.height]);
    await expect(listbox.closest('.dv-select-dropdown')!.getBoundingClientRect().width).toBeGreaterThanOrEqual(control.getBoundingClientRect().width - 0.5);
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
  args: { label: 'Recording', initial: 'sample030', data: recordings },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement, 'Recording');
    await userEvent.click(control);
    const listbox = await openList(control);
    // Taller lists scroll inside the popup's ScrollArea, which stays within the window, and the chosen option is scrolled into view.
    const viewport = listbox.closest('.dv-select-dropdown')!.querySelector<HTMLElement>('[data-scrollarea-viewport], .mantine-ScrollArea-viewport')!;
    await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    await waitFor(() => expect(listbox.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight));
    const sample = within(listbox).getByRole('option', { name: /Sample 030/ });
    await waitFor(() => expect(sample.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.getBoundingClientRect().bottom + 1));
    await expect(listbox.closest('.dv-select-dropdown')!.querySelector('.dv-scroll-bar')).not.toBeNull();
  },
};

export const GroupsAndDisabledOption: Story = {
  args: { label: 'Data source', initial: '', data: sources },
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement, 'Data source');
    await userEvent.click(control);
    const listbox = await openList(control);
    await expect(within(listbox).getByText('Live')).toHaveClass('dv-select-group');
    const probe = within(listbox).getByRole('option', { name: /Temperature probe/ });
    await expect(probe).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(probe);
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
  },
};

/** Mantine's keys: arrows move and wrap, skipping disabled options; Enter chooses; Space opens and closes; Escape and Tab close without choosing. */
export const Keyboard: Story = {
  args: { label: 'Data source', initial: 'sim', data: sources },
  play: async ({ canvasElement, args }) => {
    const control = select(canvasElement, 'Data source');
    control.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await expect(highlighted(control)).toBe('Simulator · 4 signals');
    await userEvent.keyboard('{ArrowDown}');
    await expect(highlighted(control)).toBe('Sample 024 · 4 signals');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(highlighted(control)).toBe('Choose a source');
    await userEvent.keyboard('{ArrowUp}');
    await expect(highlighted(control)).toBe('Sample 026 · 4 signals');
    // Home, End and letters do nothing in Mantine's list.
    await userEvent.keyboard('{Home}s');
    await expect(highlighted(control)).toBe('Sample 026 · 4 signals');
    await userEvent.keyboard('{Escape}');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onChange).not.toHaveBeenCalled();

    await userEvent.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    await expect(args.onChange).toHaveBeenLastCalledWith('');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(control).toHaveFocus();

    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard(' ');
    await expect(control).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('{Enter}{ArrowDown}');
    await expect(control).toHaveAttribute('aria-expanded', 'true');
    await userEvent.tab();
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

function InDialog() {
  const label = 'Column separator';
  const [value, setValue] = useState<string | null>('comma');
  return <Modal opened onClose={() => {}} title="Export recording" closeButtonProps={{ 'aria-label': 'Close' }} classNames={{ root: 'dvdash' }}>
    <div style={{ height: 70, overflow: 'hidden' }}>
      <label htmlFor="export-separator" style={{ display: 'block', fontSize: '.8125rem' }}>{label}</label>
      <Select id="export-separator" aria-label={label} data={separators} value={value} onChange={setValue} />
    </div>
  </Modal>;
}

/** Inside a dialog and a clipping box, the list opens over both, the keys work, and Escape closes the list but not the dialog. */
export const InsideDialog: Story = {
  render: () => <InDialog />,
  play: async () => {
    const body = within(document.body);
    const control = await body.findByRole('combobox', { name: 'Column separator' }), dialog = body.getByRole('dialog');
    await userEvent.click(control);
    const listbox = await openList(control);
    const options = within(listbox).getAllByRole('option'), last = options[options.length - 1].getBoundingClientRect();
    await expect(document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)?.closest('[role=option]')).toBe(options[options.length - 1]);
    await expect(last.bottom).toBeGreaterThan(control.closest('div[style]')!.getBoundingClientRect().bottom);
    await userEvent.keyboard('{Escape}');
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(control).toHaveValue('Semicolon');
    await expect(dialog).toBeInTheDocument();
  },
};

function InScroller() {
  const label = 'Recording';
  const [value, setValue] = useState<string | null>('sample001');
  return <div data-testid="scroller" style={{ height: 160, overflow: 'auto', border: '1px solid var(--dv-line)', padding: 12 }}>
    <div style={{ height: 120 }} />
    <label htmlFor="scroll-recording" style={{ display: 'block', fontSize: '.8125rem' }}>{label}</label>
    <Select id="scroll-recording" aria-label={label} data={recordings} value={value} onChange={setValue} />
    <div style={{ height: 200 }} />
  </div>;
}

/** In a scrolling box the list opens over the box's edge, and opening it scrolls nothing. */
export const InsideScrollingContainer: Story = {
  render: () => <InScroller />,
  play: async ({ canvasElement }) => {
    const scroller = within(canvasElement).getByTestId('scroller');
    scroller.scrollTop = 60;
    const control = select(canvasElement, 'Recording'), before = control.getBoundingClientRect().top;
    await userEvent.click(control);
    const listbox = await openList(control);
    await expect(scroller.scrollTop).toBe(60);
    await expect(control.getBoundingClientRect().top).toBe(before);
    await expect(listbox.getBoundingClientRect().bottom).toBeGreaterThan(scroller.getBoundingClientRect().bottom);
  },
};

export const Narrow: Story = {
  args: { label: 'Recording', initial: 'sample001', data: recordings },
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const control = select(canvasElement, 'Recording');
    await userEvent.click(control);
    const listbox = await openList(control);
    const box = listbox.closest('.dv-select-dropdown')!.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  },
};

function LabelledBy() {
  const labelId = useId(), label = 'Export format';
  const [value, setValue] = useState<string | null>('csv');
  return <label style={{ display: 'grid', gap: 6, fontSize: '.8125rem' }}><span id={labelId}>{label}</span>
    <Select aria-labelledby={labelId} aria-label={label} data={[{ value: 'csv', label: 'CSV' }, { value: 'json', label: 'JSON' }]} value={value} onChange={setValue} />
  </label>;
}

/** An open list is named after its field, whether a `<label htmlFor>` or `aria-labelledby` names the field. */
export const ListNames: Story = {
  render: args => <div style={{ display: 'grid', gap: 16 }}><Field {...args} /><LabelledBy /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(document.body);
    const byLabel = select(canvasElement), byLabelledBy = select(canvasElement, 'Export format');
    await expect(canvas.getByText('Column separator', { selector: 'label' })).toHaveAttribute('for', byLabel.id);
    await expect(byLabelledBy).toHaveAttribute('aria-labelledby', canvas.getByText('Export format').id);
    for (const [control, name] of [[byLabel, 'Column separator'], [byLabelledBy, 'Export format']] as const) {
      await userEvent.click(control);
      const listbox = await openList(control);
      await expect(body.getByRole('listbox', { name })).toBe(listbox);
      await userEvent.keyboard('{Escape}');
      await expect(control).toHaveAttribute('aria-expanded', 'false');
    }
  },
};
