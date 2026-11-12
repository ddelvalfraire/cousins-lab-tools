import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { PresetEditor } from './PresetEditor';
import type { EditablePreset, PresetPanel } from './PresetEditor';
import { chooseOption } from './chooseOption';

const savedPanels = (): PresetPanel[] => [
  { id: 'p1', title: 'CO₂ and O₂ signals', kind: 'line', span: 12, signals: ['Mass 32', 'Mass 44'], x: null },
  { id: 'p2', title: 'Current readings', kind: 'readout', span: 4, signals: ['Mass 32', 'Mass 44'], x: null },
  { id: 'p3', title: 'Mass 44 vs Mass 32', kind: 'scatter', span: 8, signals: ['Mass 44'], x: 'Mass 32' },
  { id: 'p4', title: 'Recent samples', kind: 'table', span: 6, signals: ['Mass 32', 'Mass 44'], x: null },
  { id: 'p5', title: 'Isotope Mass 45', kind: 'line', span: 6, signals: ['Mass 45'], x: null },
];
const saved: EditablePreset = { name: 'CO₂ & O₂ analysis', revision: 3, panels: savedPanels() };
/** Every panel kind, including settings (inputs) and recording controls. */
const allKindsPanels = (): PresetPanel[] => [
  { id: 'k1', title: 'CO₂ calibration settings', kind: 'inputs', span: 4, signals: [], x: null, fields: ['zero', 'span', 'standard'] },
  { id: 'k2', title: 'Concentration', kind: 'line', span: 8, signals: ['Mass 32', 'Mass 44'], x: null },
  { id: 'k3', title: 'Recording controls', kind: 'controls', span: 12, signals: [], x: null, controls: ['start', 'instrument', 'samples', 'elapsed'] },
  { id: 'k4', title: 'CO₂ readings', kind: 'readout', span: 3, signals: ['Mass 44'], x: null },
  { id: 'k5', title: 'O₂ settings', kind: 'inputs', span: 3, signals: [], x: null, fields: ['zero', 'temperature'] },
  { id: 'k6', title: 'Mass 44 vs Mass 32', kind: 'scatter', span: 6, signals: ['Mass 44'], x: 'Mass 32' },
  { id: 'k7', title: 'Sample results', kind: 'table', span: 6, signals: ['Mass 32', 'Mass 44'], x: null },
  { id: 'k8', title: 'Raw signals', kind: 'line', span: 6, signals: ['Mass 28', 'Mass 32', 'Mass 44'], x: null },
];
const allKinds: EditablePreset = { name: 'CO₂ & O₂ analysis', revision: 3, panels: allKindsPanels() };
const rearranged = (() => { const p = savedPanels(); const [table] = p.splice(3, 1); p.splice(1, 0, table); p.find(x => x.id === 'p5')!.span = 12; return p; })();

const meta = {
  title: 'Components/PresetEditor',
  component: PresetEditor,
  args: { preset: saved, onSave: fn(), onDiscard: fn(), onChange: fn() },
  parameters: { previewWidth: 1240 },
} satisfies Meta<typeof PresetEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

const order = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.pe-canvas > .pe-panel')].map(el => el.dataset.id);
const panel = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.pe-canvas > .pe-panel[data-id="${id}"]`)!;
const center = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
const columnWidth = (root: HTMLElement) => { const c = root.querySelector<HTMLElement>('.pe-canvas')!; return (c.clientWidth - 28 - 132) / 12 + 12; };
const announcer = (root: HTMLElement) => root.querySelector<HTMLElement>('.dv-preset-editor > [role="status"]')!;
const pointer = (target: Element | Document, type: 'down' | 'move' | 'up', x: number, y: number) => {
  const init = { clientX: x, clientY: y, button: 0, buttons: type === 'up' ? 0 : 1, pointerId: 1, isPrimary: true, bubbles: true };
  if (type === 'down') fireEvent.pointerDown(target, init); else if (type === 'move') fireEvent.pointerMove(target, init); else fireEvent.pointerUp(target, init);
};
async function resizeBy(root: HTMLElement, id: string, columns: number) {
  const handle = root.querySelector(`[data-resize="${id}"]`)!, { x, y } = center(handle), col = columnWidth(root);
  pointer(handle, 'down', x, y);
  for (let step = 1; step <= 8; step++) pointer(document, 'move', x + col * columns * step / 8, y);
  return { release: () => pointer(document, 'up', x + col * columns, y) };
}

/** Layout · Saved preset. Previews, arrow-button moves and sidebar settings. */
export const Saved: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    await expect(panel(canvasElement, 'p1').querySelectorAll('polyline')).toHaveLength(2);
    await expect(panel(canvasElement, 'p2').querySelectorAll('.pe-readout strong')).toHaveLength(2);
    await expect(panel(canvasElement, 'p3').querySelectorAll('.pe-point').length).toBeGreaterThan(10);
    await expect(panel(canvasElement, 'p3').querySelector('.pe-fit')).toHaveAttribute('stroke-dasharray', '5 4');
    await expect(panel(canvasElement, 'p4').querySelectorAll('tbody tr')).toHaveLength(5);
    await expect(canvas.getByText('No unsaved changes')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save as R4' })).toBeDisabled();
    await expect(canvasElement.querySelector('.pe-requires')).toHaveTextContent('Requires Mass 32Mass 44Mass 45· worked out from the panels');

    // Arrow buttons move panels without dragging; focus stays on the control, ends are disabled.
    await userEvent.click(canvas.getByRole('button', { name: 'Move Mass 44 vs Mass 32 earlier' }));
    await expect(order(canvasElement)).toEqual(['p1', 'p3', 'p2', 'p4', 'p5']);
    await expect(canvas.getByRole('button', { name: 'Move Mass 44 vs Mass 32 earlier' })).toHaveFocus();
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Move Mass 44 vs Mass 32 later' }));
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    await expect(canvas.getByRole('button', { name: 'Move CO₂ and O₂ signals earlier' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Move Isotope Mass 45 later' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Move Recent samples later' }));
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p5', 'p4']);
    await expect(canvas.getByRole('button', { name: 'Move Recent samples earlier' })).toHaveFocus();
    await expect(args.onChange).toHaveBeenCalled();

    // The preview follows the sidebar settings.
    await userEvent.click(panel(canvasElement, 'p5').querySelector('h3')!);
    await expect(panel(canvasElement, 'p5')).toHaveAttribute('data-selected', 'true');
    await chooseOption(canvas.getByLabelText('Width'), 'Full');
    await expect(panel(canvasElement, 'p5')).toHaveAttribute('data-span', '12');
    await expect(canvas.getByText('Or drag the panel’s right edge.')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Signals' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /Mass 47/ }));
    await expect(panel(canvasElement, 'p5').querySelectorAll('polyline')).toHaveLength(2);
    await expect(panel(canvasElement, 'p5').querySelector('.pe-legend')).toHaveTextContent('Mass 45Mass 47');
  },
};

/** Layout · Rearranged panels. Discard returns to the saved layout. */
export const Rearranged: Story = {
  args: { draft: rearranged, initialSelected: 'p4' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(order(canvasElement)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save as R4' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Discard changes' }));
    await expect(args.onDiscard).toHaveBeenCalledOnce();
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    await expect(panel(canvasElement, 'p5')).toHaveAttribute('data-span', '6');
    await expect(canvas.getByText('No unsaved changes')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Discard changes' })).toBeNull();
  },
};

/** Layout · New panel without signals. One problem reads as a sentence and blocks saving; several show as a list. */
export const NewPanelWithoutSignals: Story = {
  args: { draft: [...savedPanels(), { id: 'p6', title: 'New chart', kind: 'line', span: 6, signals: [], x: null }], initialSelected: 'p6', initialTab: 'signals' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement), messages = canvasElement.querySelector<HTMLElement>('.pe-messages')!;
    await expect(messages).toHaveTextContent('New chart: Choose at least one signal.');
    await expect(messages.querySelector('ul')).toBeNull();
    await expect(panel(canvasElement, 'p6').querySelector('.pe-panel-empty')).toHaveTextContent('Choose at least one signal.');
    await expect(canvas.getByRole('button', { name: 'Save as R4' })).toBeDisabled();

    await userEvent.click(canvas.getByRole('button', { name: 'Add panel' }));
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Time series' }));
    await expect(messages.querySelectorAll('li')).toHaveLength(2);
    await expect(canvas.getByRole('checkbox', { name: /Mass 28/ })).toHaveFocus();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Remove New chart' })[1]);
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

    await userEvent.click(panel(canvasElement, 'p6').querySelector('h3')!);
    await userEvent.click(canvas.getByRole('tab', { name: 'Signals' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /Mass 49/ }));
    await expect(messages).not.toBeVisible();
    await expect(panel(canvasElement, 'p6').querySelectorAll('polyline')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Save as R4' }));
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ revision: 4, panels: expect.arrayContaining([expect.objectContaining({ id: 'p6', signals: ['Mass 49'] })]) }));
    await expect(canvas.getByText('R4')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save as R5' })).toBeDisabled();
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Saved as R4.'));
  },
};

/** Layout · New preset, no panels. */
export const NewPreset: Story = {
  args: { preset: { name: 'Untitled preset', revision: 0, panels: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No panels yet. Add a panel to start the layout.')).toBeVisible();
    await expect(canvas.getByText('Not saved yet')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save as R1' })).toBeDisabled();
    await expect(canvas.getByText('Select a panel to change what it shows.')).toBeVisible();
    await expect(canvas.getByRole('tab', { name: 'Panel' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Add panel' }));
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Time series' }));
    await expect(canvas.getByRole('checkbox', { name: /Mass 28/ })).toHaveFocus();
    await expect(canvasElement.querySelector('.pe-messages')).toHaveTextContent('New chart: Choose at least one signal.');
  },
};

/** Moving a panel · Pointer over a grip. Dragging by the grip reorders the panels. */
export const GripHover: Story = {
  args: { initialHover: { target: 'grip', id: 'p5' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement), grip = canvasElement.querySelector<HTMLElement>('[data-grip="p5"]')!;
    await expect(grip).toHaveAttribute('data-hover', 'true');
    const start = center(grip), target = center(panel(canvasElement, 'p2'));
    pointer(grip, 'down', start.x, start.y);
    await waitFor(() => expect(canvasElement.querySelectorAll('.pe-ghost')).toHaveLength(1));
    await expect(canvasElement.querySelector('.pe-canvas')).toHaveAttribute('data-mode', 'drag');
    for (let step = 1; step <= 10; step++) pointer(document, 'move', start.x + (target.r.left + 8 - start.x) * step / 10, start.y + (target.y - start.y) * step / 10);
    await waitFor(() => expect(canvasElement.querySelector('[data-placeholder]')).toHaveTextContent('Drop here'));
    await expect(canvasElement.querySelector('.pe-canvas > :nth-child(2)')).toHaveAttribute('data-placeholder');
    pointer(document, 'up', target.r.left + 8, target.y);
    await waitFor(() => expect(order(canvasElement)).toEqual(['p1', 'p5', 'p2', 'p3', 'p4']));
    await expect(canvasElement.querySelectorAll('.pe-ghost')).toHaveLength(0);
    await expect(canvasElement.querySelector('[data-grip="p5"]')).toHaveFocus();
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
    await expect(args.onChange).toHaveBeenCalledWith(expect.objectContaining({ panels: expect.arrayContaining([expect.objectContaining({ id: 'p5' })]) }));
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Isotope Mass 45 moved to position 2 of 5.'));
  },
};

/** Moving a panel · Dragging into a new spot. */
export const Dragging: Story = {
  args: { initialDrag: { id: 'p5', overId: 'p2' } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('.pe-ghost')).toHaveLength(1));
    const slot = canvasElement.querySelector<HTMLElement>('[data-placeholder]')!;
    await expect(slot).toHaveTextContent('Drop here');
    await expect(canvasElement.querySelector('.pe-canvas > :nth-child(2)')).toBe(slot);
    await expect(canvasElement.querySelector('.pe-canvas')).toHaveAttribute('data-mode', 'drag');
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4']);
    const ghost = canvasElement.querySelector('.pe-ghost')!.getBoundingClientRect(), s = slot.getBoundingClientRect();
    await expect(Math.abs(ghost.width - s.width * 1.02)).toBeLessThan(12);
    await expect(ghost.top).toBeGreaterThan(s.top);
  },
};

/** Moving a panel · Dragged outside the builder. Releasing there cancels the move. */
export const OutsideBuilder: Story = {
  args: { initialDrag: { id: 'p5', overId: null } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-placeholder]')).toHaveTextContent('Returns here'));
    await expect(canvasElement.querySelector('.pe-ghost-badge')).toHaveTextContent('Release to cancel');
    await expect(canvasElement.querySelector('.pe-canvas')).toHaveAttribute('data-mode', 'nodrop');
    await expect(canvasElement.querySelector('.pe-canvas > :nth-child(5)')).toHaveAttribute('data-placeholder');

    // A live drag out of the builder shows the same state and cancels on release.
    const grip = canvasElement.querySelector<HTMLElement>('[data-grip="p3"]')!, start = center(grip), c = canvasElement.querySelector('.pe-canvas')!.getBoundingClientRect();
    pointer(grip, 'down', start.x, start.y);
    for (let step = 1; step <= 8; step++) pointer(document, 'move', start.x + (c.right + 60 - start.x) * step / 8, start.y + (c.top + 20 - start.y) * step / 8);
    await waitFor(() => expect(canvasElement.querySelector('[data-placeholder]')).toHaveTextContent('Returns here'));
    await expect(canvasElement.querySelector('.pe-ghost-badge')).toHaveTextContent('Release to cancel');
    pointer(document, 'up', c.right + 60, c.top + 20);
    await waitFor(() => expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']));
    await expect(canvasElement.querySelector('.pe-ghost')).toBeNull();
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Move cancelled.'));
  },
};

/** Moving a panel · Moving with the keyboard. Space picks up, arrows move, Space drops, Escape cancels. */
export const KeyboardMove: Story = {
  args: { initialKeyboardMove: { id: 'p4', to: 1 } },
  play: async ({ canvasElement }) => {
    const grip = () => canvasElement.querySelector<HTMLElement>('[data-grip="p4"]')!, badge = () => canvasElement.querySelector('.pe-move-badge');
    await expect(order(canvasElement)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    await expect(panel(canvasElement, 'p4')).toHaveAttribute('data-lifted', 'true');
    await expect(badge()).toHaveTextContent('Position 2 of 5');
    await expect(grip()).toHaveFocus();
    await expect(grip()).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    await expect(order(canvasElement)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    await expect(badge()).toBeNull();

    await userEvent.keyboard(' ');
    await expect(badge()).toHaveTextContent('Position 4 of 5');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Recent samples picked up. Position 4 of 5. Use the arrow keys to move.'));
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await expect(badge()).toHaveTextContent('Position 2 of 5');
    await expect(grip()).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(order(canvasElement)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    await expect(badge()).toBeNull();
    await userEvent.keyboard(' {ArrowDown}{Escape}');
    await expect(order(canvasElement)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    await expect(canvasElement.querySelector('.pe-canvas')).not.toHaveAttribute('data-mode');
  },
};

/** Resizing a panel · Pointer over a resize handle. Dragging the edge snaps to a width. */
export const ResizeHover: Story = {
  args: { initialHover: { target: 'resize', id: 'p2' }, initialSelected: 'p2' },
  play: async ({ canvasElement }) => {
    const handle = canvasElement.querySelector<HTMLElement>('[data-resize="p2"]')!;
    await expect(handle).toHaveAttribute('data-hover', 'true');
    await expect(getComputedStyle(handle).opacity).toBe('1');
    const drag = await resizeBy(canvasElement, 'p2', 4);
    await waitFor(() => expect(canvasElement.querySelectorAll('.pe-guides span')).toHaveLength(12));
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Two thirds · 8 of 12 columns');
    drag.release();
    await waitFor(() => expect(panel(canvasElement, 'p2')).toHaveAttribute('data-span', '8'));
    await expect(canvasElement.querySelector('.pe-guides')).toBeNull();
    await expect(handle).toHaveAttribute('aria-valuetext', 'Two thirds width');
  },
};

/** Resizing a panel · Resizing to two thirds. */
export const Resizing: Story = {
  args: { initialResize: { id: 'p2', span: 8 } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.pe-guides span')).toHaveLength(12);
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Two thirds · 8 of 12 columns');
    await expect(panel(canvasElement, 'p2')).toHaveAttribute('data-resizing', 'true');
    await expect(panel(canvasElement, 'p2')).toHaveAttribute('data-span', '8');
  },
};

/** Resizing a panel · Resizing below the minimum. Charts stop at a third; the handle also works from the keyboard. */
export const ResizeMinimum: Story = {
  args: { initialResize: { id: 'p3', span: 4, limited: true } },
  play: async ({ canvasElement }) => {
    const handle = () => canvasElement.querySelector<HTMLElement>('[data-resize="p3"]')!;
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Minimum width for a chart');
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveAttribute('data-limit', 'true');

    const drag = await resizeBy(canvasElement, 'p3', -9);
    await waitFor(() => expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Minimum width for a chart'));
    drag.release();
    await waitFor(() => expect(panel(canvasElement, 'p3')).toHaveAttribute('data-span', '4'));
    await expect(canvasElement.querySelector('.pe-size-badge')).toBeNull();

    handle().focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(panel(canvasElement, 'p3')).toHaveAttribute('data-span', '6');
    await expect(handle()).toHaveAttribute('aria-valuetext', 'Half width');
    await userEvent.keyboard('{End}');
    await expect(panel(canvasElement, 'p3')).toHaveAttribute('data-span', '12');
    await userEvent.keyboard('{Home}');
    await expect(panel(canvasElement, 'p3')).toHaveAttribute('data-span', '4');
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Minimum width for a chart.'));
  },
};

/** Narrow window: one column, resize handles hidden, width still set in the sidebar. */
export const NarrowWindow: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.dv-preset-editor')!, inner = canvasElement.querySelector<HTMLElement>('.pe-canvas')!.clientWidth - 28;
    for (const id of ['p2', 'p3', 'p4']) await expect(Math.abs(panel(canvasElement, id).getBoundingClientRect().width - inner)).toBeLessThan(2);
    await expect(canvasElement.querySelector('[data-resize="p2"]')).not.toBeVisible();
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
};

/** Settings and recording controls · Every panel kind. Settings and recording controls are inert previews with sample values. */
export const AllKinds: Story = {
  args: { preset: allKinds },
  parameters: { previewWidth: 1440 },
  play: async ({ canvasElement }) => {
    await expect(order(canvasElement)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']);
    const settings = panel(canvasElement, 'k1'), controls = panel(canvasElement, 'k3');
    await expect(settings).toHaveAttribute('aria-label', 'CO₂ calibration settings, Settings, third width, position 1 of 8');
    await expect([...settings.querySelectorAll('.pe-setting-label')].map(el => el.textContent)).toEqual(['Zero offset', 'Span signal', 'Standard concentration']);
    await expect(settings.querySelector('.pe-qty')).toHaveTextContent('0.25mV');
    // Inert: nothing in either preview takes focus or input.
    await expect(settings.querySelectorAll('input, select, textarea, [role=combobox]')).toHaveLength(0);
    await expect(controls.querySelector('.dv-acq-tag')).toHaveTextContent('Acquiring');
    await expect(controls.querySelector('.pe-controls')).toHaveTextContent('MS-01 · Connected87 samples00:43Stop acquisition');
    await expect(controls.querySelectorAll('.pe-controls button, .pe-controls input')).toHaveLength(0);
    await expect(controls).toHaveAttribute('aria-label', 'Recording controls, Recording controls, full width, position 3 of 8');
    // Settings and controls add no signal requirements.
    await expect(canvasElement.querySelector('.pe-requires')).toHaveTextContent('Requires Mass 28Mass 32Mass 44· worked out from the panels');
  },
};

/** Settings and recording controls · Every panel kind, dark appearance. */
export const AllKindsDark: Story = { ...AllKinds, globals: { appearance: 'dark' } };

/** Settings and recording controls · Every panel kind in a narrow window: one column. */
export const AllKindsNarrow: Story = {
  args: { preset: allKinds },
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.dv-preset-editor')!, inner = canvasElement.querySelector<HTMLElement>('.pe-canvas')!.clientWidth - 28;
    for (const id of ['k1', 'k3', 'k5']) await expect(Math.abs(panel(canvasElement, id).getBoundingClientRect().width - inner)).toBeLessThan(2);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
};

/** Settings and recording controls · Settings panel selected. The sidebar shows which settings it holds; it has no signals. */
export const SettingsSelected: Story = {
  args: { preset: allKinds, initialSelected: 'k1', initialTab: 'signals' },
  parameters: { previewWidth: 1440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(panel(canvasElement, 'k1')).toHaveAttribute('data-selected', 'true');
    await expect(canvas.getByRole('tab', { name: 'Panel' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tab', { name: 'Signals' })).toBeDisabled();
    await expect(canvas.getByLabelText('Panel name')).toHaveValue('CO₂ calibration settings');
    await expect(canvas.getByLabelText('Shows')).toHaveValue('inputs');
    await expect(canvas.getByRole('group', { name: 'Settings shown' })).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: /Zero offset/ })).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: /Noise floor/ })).not.toBeChecked();
  },
};

/** Settings and recording controls · Recording controls selected. The sidebar shows which controls it holds. */
export const ControlsSelected: Story = {
  args: { preset: allKinds, initialSelected: 'k3' },
  parameters: { previewWidth: 1440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(panel(canvasElement, 'k3')).toHaveAttribute('data-selected', 'true');
    await expect(canvas.getByRole('tab', { name: 'Signals' })).toBeDisabled();
    await expect(canvas.getByLabelText('Shows')).toHaveValue('controls');
    await expect(canvas.getByLabelText('Width')).toHaveValue('12');
    await expect(canvas.getByRole('group', { name: 'Controls shown' })).toBeVisible();
    for (const name of ['Start and stop', 'Instrument connection', 'Sample count', 'Elapsed time']) await expect(canvas.getByRole('checkbox', { name })).toBeChecked();
  },
};

/** Settings and recording controls · Choosing settings and controls. The preview follows; an empty panel blocks saving. */
export const ChoosingSettingsAndControls: Story = {
  args: { preset: allKinds, initialSelected: 'k5' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), messages = canvasElement.querySelector<HTMLElement>('.pe-messages')!;
    await userEvent.click(canvas.getByRole('checkbox', { name: /Noise floor/ }));
    await expect([...panel(canvasElement, 'k5').querySelectorAll('.pe-setting-label')].map(el => el.textContent)).toEqual(['Zero offset', 'Noise floor', 'Chamber temperature']);
    for (const name of [/Zero offset/, /Noise floor/, /Chamber temperature/]) await userEvent.click(canvas.getByRole('checkbox', { name }));
    await expect(panel(canvasElement, 'k5').querySelector('.pe-panel-empty')).toHaveTextContent('Choose at least one setting.');
    await expect(messages).toHaveTextContent('O₂ settings: Choose at least one setting.');
    await expect(messages.querySelector('ul')).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Save as R4' })).toBeDisabled();

    await userEvent.click(panel(canvasElement, 'k3').querySelector('h3')!);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Elapsed time' }));
    await expect(panel(canvasElement, 'k3').querySelector('.pe-controls')).not.toHaveTextContent('00:43');
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Start and stop' }));
    await expect(panel(canvasElement, 'k3').querySelector('.pe-controls')).not.toHaveTextContent('Stop acquisition');
    await expect(panel(canvasElement, 'k3').querySelector('.dv-acq-tag')).toHaveTextContent('Acquiring');
  },
};

/** Settings and recording controls · Dragging a settings panel into a new spot. */
export const DraggingSettings: Story = {
  args: { preset: allKinds, initialDrag: { id: 'k5', overId: 'k2' } },
  parameters: { previewWidth: 1440 },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('.pe-ghost')).toHaveLength(1));
    const slot = canvasElement.querySelector<HTMLElement>('[data-placeholder]')!;
    await expect(slot).toHaveTextContent('Drop here');
    await expect(canvasElement.querySelector('.pe-canvas > :nth-child(2)')).toBe(slot);
    await expect(canvasElement.querySelector('.pe-ghost')!.querySelectorAll('.pe-qty')).toHaveLength(2);
    const ghost = canvasElement.querySelector('.pe-ghost')!.getBoundingClientRect(), s = slot.getBoundingClientRect();
    await expect(Math.abs(ghost.width - s.width * 1.02)).toBeLessThan(12);
  },
};

/** Settings and recording controls · Moving settings and controls with the keyboard. */
export const KeyboardMoveSettingsAndControls: Story = {
  args: { preset: allKinds },
  play: async ({ canvasElement }) => {
    const grip = (id: string) => canvasElement.querySelector<HTMLElement>(`[data-grip="${id}"]`)!;
    grip('k1').focus();
    await userEvent.keyboard(' ');
    await expect(panel(canvasElement, 'k1')).toHaveAttribute('data-lifted', 'true');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('CO₂ calibration settings picked up. Position 1 of 8. Use the arrow keys to move.'));
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    await expect(canvasElement.querySelector('.pe-move-badge')).toHaveTextContent('Position 3 of 8');
    await expect(grip('k1')).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(order(canvasElement)).toEqual(['k2', 'k3', 'k1', 'k4', 'k5', 'k6', 'k7', 'k8']);
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('CO₂ calibration settings dropped at position 3 of 8.'));

    grip('k3').focus();
    await userEvent.keyboard(' {ArrowLeft}');
    await expect(order(canvasElement)).toEqual(['k3', 'k2', 'k1', 'k4', 'k5', 'k6', 'k7', 'k8']);
    await userEvent.keyboard('{Escape}');
    await expect(order(canvasElement)).toEqual(['k2', 'k3', 'k1', 'k4', 'k5', 'k6', 'k7', 'k8']);
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Move cancelled.'));
  },
};

/** Settings and recording controls · Resizing recording controls below the minimum. They stop at a third. */
export const ResizeControlsMinimum: Story = {
  args: { preset: allKinds, initialResize: { id: 'k3', span: 4, limited: true } },
  parameters: { previewWidth: 1440 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Minimum width for recording controls');
    await expect(canvasElement.querySelector('.pe-size-badge')).toHaveAttribute('data-limit', 'true');
    await expect(panel(canvasElement, 'k3')).toHaveAttribute('data-span', '4');
    await expect(canvasElement.querySelector('[data-resize="k3"]')).toHaveAttribute('aria-valuemin', '4');
  },
};

/** Settings and recording controls · Dragging recording controls narrower than a third, then trying the keyboard. */
export const ResizeControlsBelowMinimum: Story = {
  args: { preset: allKinds },
  play: async ({ canvasElement }) => {
    const handle = () => canvasElement.querySelector<HTMLElement>('[data-resize="k3"]')!;
    const drag = await resizeBy(canvasElement, 'k3', -11);
    await waitFor(() => expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Minimum width for recording controls'));
    drag.release();
    await waitFor(() => expect(panel(canvasElement, 'k3')).toHaveAttribute('data-span', '4'));
    handle().focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(panel(canvasElement, 'k3')).toHaveAttribute('data-span', '4');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Minimum width for recording controls.'));
  },
};

/** Settings and recording controls · Settings panels go down to a quarter, from the keyboard too. */
export const ResizeSettingsMinimum: Story = {
  args: { preset: allKinds, initialSelected: 'k5' },
  play: async ({ canvasElement }) => {
    const handle = () => canvasElement.querySelector<HTMLElement>('[data-resize="k5"]')!;
    await expect(handle()).toHaveAttribute('aria-valuemin', '3');
    handle().focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(panel(canvasElement, 'k5')).toHaveAttribute('data-span', '3');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Minimum width for a settings panel.'));
    await userEvent.keyboard('{ArrowRight}');
    await expect(handle()).toHaveAttribute('aria-valuetext', 'Third width');
    const drag = await resizeBy(canvasElement, 'k5', -6);
    await waitFor(() => expect(canvasElement.querySelector('.pe-size-badge')).toHaveTextContent('Minimum width for a settings panel'));
    drag.release();
    await waitFor(() => expect(panel(canvasElement, 'k5')).toHaveAttribute('data-span', '3'));
  },
};

/** Adding a panel · The Add panel menu offers every kind, including settings and recording controls. */
export const AddPanelMenu: Story = {
  args: { preset: allKinds },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), add = canvas.getByRole('button', { name: 'Add panel' });
    await userEvent.click(add);
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getAllByRole('menuitem').map(el => el.textContent)).toEqual(['Time series', 'XY scatter', 'Readout', 'Table', 'Settings', 'Recording controls']);
    await expect(canvas.getByRole('menuitem', { name: 'Time series' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(canvas.getByRole('menuitem', { name: 'Recording controls' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('menu')).toBeNull();
    await expect(add).toHaveFocus();

    await userEvent.click(add);
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Settings' }));
    await expect(order(canvasElement)).toHaveLength(9);
    await expect(canvas.getByRole('checkbox', { name: /Zero offset/ })).toHaveFocus();
    await expect(canvasElement.querySelector('.pe-messages')).toHaveTextContent('New settings: Choose at least one setting.');
    await waitFor(() => expect(announcer(canvasElement)).toHaveTextContent('Panel added at the end. Choose its settings.'));

    await userEvent.click(add);
    await userEvent.click(canvas.getByRole('menuitem', { name: 'Recording controls' }));
    const added = canvasElement.querySelector<HTMLElement>('.pe-canvas > .pe-panel:last-child')!;
    await expect(added).toHaveAttribute('data-span', '12');
    await expect(added.querySelector('.pe-controls')).toHaveTextContent('Stop acquisition');
    await expect(canvas.getByRole('checkbox', { name: 'Start and stop' })).toHaveFocus();

    // A press outside the menu closes it.
    await userEvent.click(add);
    await userEvent.click(canvasElement.querySelector('.pe-requires')!);
    await expect(canvas.queryByRole('menu')).toBeNull();
  },
};
