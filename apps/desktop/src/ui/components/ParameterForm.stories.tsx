import type { Meta, StoryObj } from '@storybook/react-vite';
import { ParameterForm } from './Inputs';
const meta = { title: 'Components/ParameterForm', component: ParameterForm, tags: ['autodocs'], args: { invalid: false } } satisfies Meta<typeof ParameterForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Invalid: Story = { args: { invalid: true } };
