import type { Meta, StoryObj } from '@storybook/react-vite';
import { StandardControls } from './Foundations';

const meta = {
  title: 'Foundations/StandardControls',
  component: StandardControls,
  tags: ['autodocs'],
} satisfies Meta<typeof StandardControls>;
export default meta;
export const ButtonsAndChips: StoryObj<typeof meta> = {};
