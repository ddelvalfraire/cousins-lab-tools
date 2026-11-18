import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FormFeedback } from './Inputs';

const meta = {
  title: 'Components/FormFeedback',
  component: FormFeedback,
  tags: ['autodocs'],
  parameters: { previewWidth: 420 },
  args: { severity: 'error' },
  argTypes: {
    severity: {
      control: 'select',
      options: ['info', 'warning', 'error', 'success'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('.dv-banner')).toHaveLength(1);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
    const field = canvas.getByRole('textbox', { name: 'Sample name' });
    const description = field.ownerDocument.getElementById(
      field.getAttribute('aria-describedby')!,
    );
    await expect(description).toContainElement(canvas.getByRole('list'));
  },
} satisfies Meta<typeof FormFeedback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Error: Story = {};
export const Warning: Story = { args: { severity: 'warning' } };
