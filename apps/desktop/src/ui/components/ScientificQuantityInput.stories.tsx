import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { ScientificQuantityInput } from './ScientificQuantityInput';

const meta = {
  title: 'Components/ScientificQuantityInput',
  component: ScientificQuantityInput,
  tags: ['autodocs'],
  parameters: { layout: 'centered', previewWidth: 620 },
  decorators: [
    (Story) => (
      <div
        style={{
          background: 'var(--dv-paper)',
          border: '1px solid var(--dv-line)',
          borderRadius: 12,
          padding: '22px 24px 24px',
          color: 'var(--dv-ink)',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Baseline offset',
    description:
      'Subtracted from the Mass 44 signal before results are calculated.',
    label: 'Offset',
    initialValue: -0.25,
    initialUnit: 'mV',
    emptyMessage: 'Enter an offset. Use 0 for no offset.',
    onValueChange: fn(),
  },
} satisfies Meta<typeof ScientificQuantityInput>;
export default meta;
type Story = StoryObj<typeof meta>;

const parts = (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  return {
    canvas,
    field: canvas.getByRole('textbox', { name: 'Offset' }),
    unit: canvas.getByRole('combobox', { name: 'Offset unit' }),
    stored: canvasElement.querySelector(
      '[data-quantity="stored"]',
    ) as HTMLElement,
  };
};

export const OrdinaryValue: Story = {
  play: async ({ canvasElement }) => {
    const { canvas, field, unit, stored } = parts(canvasElement);
    await expect(field).toHaveValue('-0.25');
    await expect(unit).toHaveValue('mV');
    await expect(stored).toHaveTextContent('-0.25 mV');
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

/** Changing the unit converts the number and keeps the stored quantity; typing stores each valid value. */
export const ChangingUnits: Story = {
  play: async ({ canvasElement, args }) => {
    const { field, unit, stored } = parts(canvasElement);
    await chooseOption(unit, 'µV');
    await expect(field).toHaveValue('-250');
    await chooseOption(unit, 'V');
    await expect(field).toHaveValue('-0.00025');
    await expect(stored).toHaveTextContent('-0.25 mV');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await chooseOption(unit, 'mV');
    await userEvent.clear(field);
    await userEvent.type(field, '1.5e3');
    await expect(stored).toHaveTextContent('1500 mV');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(1500);
    await userEvent.clear(field);
    await userEvent.type(field, '2e-9');
    await expect(stored).toHaveTextContent('2 × 10⁻⁹ mV');
    // A decimal comma works the same as a point.
    await userEvent.clear(field);
    await userEvent.type(field, '1,25e-3');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(0.00125);
  },
};

export const DecimalComma: Story = {
  args: { initialText: '-0,25' },
  play: async ({ canvasElement }) => {
    const { canvas, field, stored } = parts(canvasElement);
    await expect(field).toHaveValue('-0,25');
    await expect(stored).toHaveTextContent('-0.25 mV');
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

export const ScientificNotation: Story = {
  args: { initialText: '-2.5e-4', initialUnit: 'V' },
  play: async ({ canvasElement }) => {
    const { canvas, stored } = parts(canvasElement);
    await expect(stored).toHaveTextContent('-0.25 mV');
    await expect(canvas.getByText('-2.5 × 10⁻⁴ V')).toBeVisible();
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

export const TooLarge: Story = {
  args: { initialText: '1e308', initialUnit: 'V' },
  play: async ({ canvasElement }) => {
    const { canvas, field, stored } = parts(canvasElement);
    const message = canvas.getByRole('alert');
    await expect(message).toHaveTextContent(
      'This value is too large to store. Enter less than 1.798 × 10³⁰⁵ V.',
    );
    await expect(message).toHaveTextContent('Still using -0.25 mV.');
    await expect(message.querySelectorAll('li')).toHaveLength(0);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(stored).toHaveTextContent('-0.25 mV');
  },
};

export const TooSmall: Story = {
  args: { initialText: '1e-323', initialUnit: 'µV' },
  play: async ({ canvasElement }) => {
    const { canvas, field } = parts(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This value is too small to store and would become 0. Enter 0 or a larger value.',
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
  },
};

/** Changing the unit while invalid reinterprets the typed text instead of converting it. */
export const UnitFixesTooSmall: Story = {
  args: { initialText: '1e-323', initialUnit: 'µV' },
  play: async ({ canvasElement, args }) => {
    const { canvas, field, unit } = parts(canvasElement);
    await chooseOption(unit, 'mV');
    await expect(field).toHaveValue('1e-323');
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(args.onValueChange).toHaveBeenLastCalledWith(1e-323);
  },
};

export const NotANumber: Story = {
  args: { initialText: '0.25 mV' },
  play: async ({ canvasElement }) => {
    const { canvas, field } = parts(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Enter a number, such as 0.25, 0,25 or 2.5e-4.',
    );
    await expect(field).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Empty: Story = {
  args: { initialText: '' },
  play: async ({ canvasElement }) => {
    const { canvas, field, stored } = parts(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Enter an offset. Use 0 for no offset.',
    );
    await expect(field).toHaveValue('');
    await expect(stored).toHaveTextContent('-0.25 mV');
  },
};

/** Typing 0 into the empty field clears the message and stores 0. */
export const FillEmpty: Story = {
  args: { initialText: '' },
  play: async ({ canvasElement, args }) => {
    const { canvas, field, stored } = parts(canvasElement);
    await userEvent.type(field, '0');
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(stored).toHaveTextContent('0 mV');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(0);
  },
};

/** Older field-only use: no heading, forced invalid by the surrounding form. */
export const FieldOnly: Story = {
  args: {
    title: undefined,
    description: undefined,
    label: 'Raw signal',
    initialValue: 3.2e-6,
    initialUnit: 'mV',
    emptyMessage: undefined,
    invalid: true,
    warning: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('textbox', { name: 'Raw signal' }),
    ).toHaveValue('3.2e-6');
    await expect(canvas.getByRole('alert').querySelectorAll('li')).toHaveLength(
      2,
    );
  },
};
