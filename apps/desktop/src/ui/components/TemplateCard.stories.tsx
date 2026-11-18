import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { templates } from '../fixtures';
import { TemplateCard } from './Catalog';

const meta = {
  title: 'Components/TemplateCard',
  component: TemplateCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered', previewWidth: 360 },
  args: { template: templates[0], onOpen: fn() },
  argTypes: { onOpen: { control: false } },
} satisfies Meta<typeof TemplateCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GasExchange: Story = {};
export const Comparison: Story = { args: { template: templates[1] } };
