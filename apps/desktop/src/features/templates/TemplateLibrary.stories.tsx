import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateLibrary } from './Catalog';
import { templates } from './sample-templates';

const meta = {
  title: 'Components/TemplateLibrary',
  component: TemplateLibrary,
  tags: ['autodocs'],
  parameters: { previewWidth: 1080 },
  args: { templates, empty: false, loading: false, failed: false },
  argTypes: { templates: { control: false } },
} satisfies Meta<typeof TemplateLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const Empty: Story = { args: { empty: true } };
export const Loading: Story = { args: { loading: true } };
export const Failed: Story = { args: { failed: true } };
