import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Primitives';
const meta = { title: 'Components/Panel', component: Panel, tags: ['autodocs'], args: { title: 'Signal group', children: 'Panel contents', description: 'Optional description' } } satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
