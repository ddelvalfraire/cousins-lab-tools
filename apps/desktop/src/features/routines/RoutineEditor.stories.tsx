import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { settleMotion } from '../../../.storybook/settleMotion';
import type { RoutineDefinition } from './RoutineEditor';
import { RoutineEditor } from './RoutineEditor';

const savedRoutine: RoutineDefinition = {
  parameters: [
    { id: 'q1', name: 'Reference', seconds: 10 },
    { id: 'q2', name: 'Settle', seconds: 5 },
    { id: 'q3', name: 'Sample', seconds: 20 },
  ],
  steps: [
    { id: 's1', kind: 'capture', name: 'Reference', duration: { param: 'q1' } },
    { id: 's2', kind: 'wait', name: '', duration: { param: 'q2' } },
    { id: 's3', kind: 'annotate', name: 'Add the sample', duration: null },
    { id: 's4', kind: 'capture', name: 'Sample', duration: { param: 'q3' } },
    { id: 's5', kind: 'wait', name: '', duration: { fixed: 5 } },
  ],
};
const edit = (change: (r: RoutineDefinition) => void) => {
  const r = structuredClone(savedRoutine);
  change(r);
  return r;
};

const order = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.dv-re-canvas > [data-step]')].map(
    (el) => el.dataset.step,
  );
const grip = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`.dv-re-canvas [data-grip="${id}"]`)!;
const chip = (root: HTMLElement, id: string) =>
  root.querySelector<HTMLElement>(`[data-step="${id}"] .dv-chip`);
const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

const meta = {
  title: 'Components/RoutineEditor',
  component: RoutineEditor,
  tags: ['autodocs'],
  args: {
    name: 'Reference and sample',
    revision: 3,
    routine: savedRoutine,
    onSave: fn(),
    onDiscard: fn(),
  },
  argTypes: { onSave: { control: false }, onDiscard: { control: false } },
  parameters: { previewWidth: 1240 },
} satisfies Meta<typeof RoutineEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('5 steps · 40 s total')).toBeVisible();
    await expect(canvasElement.querySelectorAll('.dv-re-seg')).toHaveLength(4);
    await expect(
      canvasElement.querySelectorAll('.dv-re-seg-mark'),
    ).toHaveLength(1);
    await expect(chip(canvasElement, 's1')).toHaveTextContent(
      '10 s · Reference',
    );
    await expect(chip(canvasElement, 's1')).toHaveAttribute(
      'data-tone',
      'accent',
    );
    await expect(chip(canvasElement, 's5')).toHaveTextContent(/^5 s$/);
    await expect(canvas.getByText('No unsaved changes')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Save as R4' }),
    ).toBeDisabled();
  },
};

/** Arrow buttons move a step without dragging and keep focus on the moved step. */
export const MoveWithArrows: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Arrow buttons move without dragging and keep focus on the moved step.
    await expect(
      canvas.getByRole('button', { name: 'Move step 1 up' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Move step 5 down' }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Move step 4 up' }),
    );
    await expect(order(canvasElement)).toEqual(['s1', 's2', 's4', 's3', 's5']);
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Move step 3 up' }),
      ).toHaveFocus(),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Move step 4 down' }),
    );
    await expect(order(canvasElement)).toEqual(['s1', 's2', 's4', 's5', 's3']);
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Move step 5 up' }),
      ).toHaveFocus(),
    );
    await expect(canvas.getByText('Unsaved changes')).toBeVisible();
  },
};

export const StepUsingAParameter: Story = {
  name: 'Step using a parameter',
  args: {
    draft: edit((r) => {
      r.parameters[2].seconds = 30;
    }),
    selectedStepId: 's4',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Step 4 · Capture' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('radio', { name: 'Parameter' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('combobox', { name: 'Parameter' }),
    ).toHaveValue('Sample · 30 s');
    await expect(chip(canvasElement, 's4')).toHaveTextContent('30 s · Sample');
    await expect(canvas.getByText('5 steps · 50 s total')).toBeVisible();
  },
};

/** Changing or renaming the parameter updates every bound step, because bindings are by id. */
export const EditBoundParameter: Story = {
  args: {
    draft: edit((r) => {
      r.parameters[2].seconds = 30;
    }),
    selectedStepId: 's4',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Changing or renaming the parameter updates every bound step, because bindings are by id.
    await userEvent.click(canvas.getByRole('tab', { name: 'Parameters' }));
    const value = canvas.getAllByRole('textbox', { name: 'Default' })[2];
    await userEvent.clear(value);
    await userEvent.type(value, '40');
    await expect(value).toHaveFocus();
    await expect(chip(canvasElement, 's4')).toHaveTextContent('40 s · Sample');
    await expect(canvas.getByText('5 steps · 60 s total')).toBeVisible();
    const name = canvas.getAllByRole('textbox', { name: 'Name' })[2];
    await userEvent.type(name, ' time');
    await expect(chip(canvasElement, 's4')).toHaveTextContent(
      '40 s · Sample time',
    );
    await expect(canvas.getAllByText('Used by step 4')).toHaveLength(1);
  },
};

export const StepChangedToANote: Story = {
  name: 'Step changed to a note',
  args: {
    draft: edit((r) => {
      r.steps[4] = {
        id: 's5',
        kind: 'annotate',
        name: 'Check the flow rate',
        duration: null,
      };
    }),
    selectedStepId: 's5',
    notice: {
      stepId: 's5',
      text: 'Notes don’t take time, so this step’s duration was removed.',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = () => canvasElement.querySelector('.dv-re-side-note');
    await expect(note()).toHaveTextContent(
      /^Notes don’t take time, so this step’s duration was removed\.$/,
    );
    await expect(canvas.queryByRole('group', { name: 'Duration' })).toBeNull();
  },
};

/** Changing a step's type drops what the new type can't have, and says so. */
export const ChangeStepType: Story = {
  args: StepChangedToANote.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const note = () => canvasElement.querySelector('.dv-re-side-note');
    // Changing a capture to a wait removes its name and says so.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit step 4, Capture sample' }),
    );
    await waitFor(() => expect(note()).toBeNull());
    await chooseOption(canvas.getByRole('combobox', { name: 'Type' }), 'wait');
    await expect(note()).toHaveTextContent(
      /^Wait steps don’t have a name, so “Sample” was removed\.$/,
    );
    await expect(
      canvas.queryByRole('textbox', { name: 'What it captures' }),
    ).toBeNull();
    await expect(
      canvas.getByRole('heading', { name: 'Step 4 · Wait' }),
    ).toBeVisible();
    // And a wait changed to a note drops its duration.
    await chooseOption(
      canvas.getByRole('combobox', { name: 'Type' }),
      'annotate',
    );
    await expect(note()).toHaveTextContent(
      /^Notes don’t take time, so this step’s duration was removed\.$/,
    );
    await expect(chip(canvasElement, 's4')).toBeNull();
    await settleMotion();
  },
};

export const ParameterStillInUse: Story = {
  name: 'Parameter still in use',
  args: { tab: 'parameters', blockedParameterId: 'q1' },
  play: async ({ canvasElement }) => {
    const blocked = canvasElement.querySelector('.dv-re-param-blocked');
    await expect(blocked).toHaveTextContent(
      'Used by step 1. Change that step first.',
    );
    await expect(
      within(canvasElement).getByRole('tab', { name: 'Parameters' }),
    ).toHaveAttribute('aria-selected', 'true');
  },
};

/** A parameter can be removed once no step uses it. */
export const FreeAParameter: Story = {
  args: { tab: 'parameters', blockedParameterId: 'q1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove parameter Reference' }),
    );
    await expect(canvas.getAllByRole('textbox', { name: 'Name' })).toHaveLength(
      3,
    );
    await expect(
      canvasElement.querySelectorAll('.dv-re-param-blocked'),
    ).toHaveLength(1);
    // Switch step 1 to a fixed duration; then the parameter can go.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit step 1, Capture reference' }),
    );
    await expect(
      canvas.getByRole('heading', { name: 'Step 1 · Capture' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'Fixed' }));
    const seconds = canvas.getByRole('textbox', { name: 'Seconds' });
    await expect(seconds).toHaveValue('10');
    await userEvent.clear(seconds);
    await userEvent.type(seconds, '12');
    await expect(chip(canvasElement, 's1')).toHaveTextContent(/^12 s$/);
    await userEvent.click(canvas.getByRole('tab', { name: 'Parameters' }));
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove parameter Reference' }),
    );
    await expect(
      canvas
        .getAllByRole('textbox', { name: 'Name' })
        .map((el) => (el as HTMLInputElement).value),
    ).toEqual(['Settle', 'Sample']);
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Remove parameter Settle' }),
      ).toHaveFocus(),
    );
  },
};

export const StepsThatCantBeSaved: Story = {
  name: "Steps that can't be saved",
  args: {
    draft: edit((r) => {
      r.steps[0].name = '';
      r.steps.push({
        id: 's6',
        kind: 'wait',
        name: '',
        duration: { fixed: 0 },
      });
    }),
    selectedStepId: 's1',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save as R4' });
    await expect(
      canvasElement.querySelectorAll('.dv-re-messages li'),
    ).toHaveLength(2);
    await expect(save).toBeDisabled();
  },
};

/** Fixing each step enables saving the next revision. */
export const FixAndSave: Story = {
  args: StepsThatCantBeSaved.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save as R4' });
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'What it captures' }),
      'Reference',
    );
    await expect(
      canvasElement.querySelector('.dv-re-messages'),
    ).toHaveTextContent(/^Step 6: Enter a duration longer than 0 s\.$/);
    await expect(
      canvasElement.querySelectorAll('.dv-re-messages li'),
    ).toHaveLength(0);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit step 6, Wait' }),
    );
    const seconds = canvas.getByRole('textbox', { name: 'Seconds' });
    await userEvent.clear(seconds);
    await userEvent.type(seconds, '3');
    await waitFor(() =>
      expect(canvasElement.querySelector('.dv-re-messages')).toBeNull(),
    );
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Reference and sample', revision: 4 }),
    );
    await expect(canvas.getByText('R4')).toBeVisible();
    await expect(canvas.getByText('No unsaved changes')).toBeVisible();
  },
};

export const NewRoutine: Story = {
  name: 'New routine',
  args: {
    name: 'Untitled routine',
    revision: 0,
    routine: { parameters: [], steps: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('No steps yet. Add a step to start the routine.'),
    ).toBeVisible();
    await expect(canvas.getByText('Not saved yet')).toBeVisible();
  },
};

/** The first added step asks for its name. */
export const AddFirstStep: Story = {
  args: {
    name: 'Untitled routine',
    revision: 0,
    routine: { parameters: [], steps: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add capture' }));
    await waitFor(() =>
      expect(
        canvas.getByRole('textbox', { name: 'What it captures' }),
      ).toHaveFocus(),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('Step 1: Name what this step captures.'),
      ).toBeVisible(),
    );
    await expect(
      canvas.getByRole('button', { name: 'Save as R1' }),
    ).toBeDisabled();
    await settleMotion();
  },
};

export const GripHover: Story = {
  name: 'Grip hover',
  args: { interaction: { type: 'grip-hover', stepId: 's4' } },
  play: async ({ canvasElement }) => {
    await expect(grip(canvasElement, 's4')).toHaveAttribute(
      'data-hover',
      'true',
    );
  },
};

/** Pointer drag: a ghost follows the pointer and a slot shows where the step lands. */
export const PointerDrag: Story = {
  args: { interaction: { type: 'grip-hover', stepId: 's4' } },
  play: async ({ canvasElement }) => {
    // Pointer drag: a ghost follows the pointer and a slot shows where the step lands.
    const start = center(grip(canvasElement, 's4')),
      target = center(canvasElement.querySelector('[data-step="s1"]')!);
    await fireEvent.pointerDown(grip(canvasElement, 's4'), {
      ...start,
      button: 0,
    });
    for (let i = 1; i <= 5; i++)
      await fireEvent.pointerMove(document, {
        clientX: start.clientX,
        clientY: start.clientY + ((target.clientY + 5 - start.clientY) * i) / 5,
      });
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-placeholder]'),
      ).toHaveTextContent('Drop here'),
    );
    await expect(canvasElement.querySelectorAll('.dv-re-ghost')).toHaveLength(
      1,
    );
    await fireEvent.pointerUp(document, {
      clientX: start.clientX,
      clientY: target.clientY + 5,
    });
    await expect(order(canvasElement)).toEqual(['s1', 's4', 's2', 's3', 's5']);
    await waitFor(() => expect(grip(canvasElement, 's4')).toHaveFocus());
  },
};

export const Dragging: Story = {
  args: { interaction: { type: 'dragging', stepId: 's4', afterStepId: 's1' } },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-placeholder]'),
      ).toHaveTextContent('Drop here'),
    );
    await expect(canvasElement.querySelector('.dv-re-canvas')).toHaveAttribute(
      'data-mode',
      'drag',
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('.dv-re-ghost')).toBeVisible(),
    );
  },
};

/** Releasing drops the step into the slot. */
export const DropStep: Story = {
  args: { interaction: { type: 'dragging', stepId: 's4', afterStepId: 's1' } },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector('.dv-re-ghost')).toBeVisible(),
    );
    await fireEvent.pointerUp(document);
    await expect(order(canvasElement)).toEqual(['s1', 's4', 's2', 's3', 's5']);
  },
};

export const OutsideBuilder: Story = {
  name: 'Outside builder',
  args: { interaction: { type: 'outside', stepId: 's4' } },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-placeholder]'),
      ).toHaveTextContent('Returns here'),
    );
    await expect(
      canvasElement.querySelector('.dv-re-ghost-badge'),
    ).toHaveTextContent('Release to cancel');
  },
};

/** Releasing outside the builder puts the step back. */
export const CancelOutsideBuilder: Story = {
  args: { interaction: { type: 'outside', stepId: 's4' } },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-placeholder]'),
      ).toHaveTextContent('Returns here'),
    );
    await fireEvent.pointerUp(document);
    await expect(order(canvasElement)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    await expect(
      within(canvasElement).getByText('No unsaved changes'),
    ).toBeVisible();
  },
};

export const KeyboardMove: Story = {
  name: 'Keyboard move',
  args: { interaction: { type: 'keyboard', stepId: 's5', toIndex: 2 } },
  play: async ({ canvasElement }) => {
    const badge = () => canvasElement.querySelector('.dv-re-move-badge');
    await waitFor(() => expect(grip(canvasElement, 's5')).toHaveFocus());
    await expect(badge()).toHaveTextContent('Step 3 of 5');
  },
};

/** Arrows move, Escape puts the step back, Space picks up and drops. */
export const KeyboardMoveAndDrop: Story = {
  args: { interaction: { type: 'keyboard', stepId: 's5', toIndex: 2 } },
  play: async ({ canvasElement }) => {
    const badge = () => canvasElement.querySelector('.dv-re-move-badge');
    await waitFor(() => expect(grip(canvasElement, 's5')).toHaveFocus());
    await userEvent.keyboard('{ArrowUp}');
    await expect(badge()).toHaveTextContent('Step 2 of 5');
    // Escape puts the step back where it was picked up.
    await userEvent.keyboard('{Escape}');
    await expect(order(canvasElement)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    await expect(badge()).toBeNull();
    // Space picks up, arrows move, Space drops.
    await waitFor(() => expect(grip(canvasElement, 's5')).toHaveFocus());
    await userEvent.keyboard(' ');
    await expect(badge()).toHaveTextContent('Step 5 of 5');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    await expect(order(canvasElement)).toEqual(['s1', 's2', 's3', 's5', 's4']);
    await expect(badge()).toBeNull();
  },
};
