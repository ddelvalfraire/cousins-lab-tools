import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorPalette } from './Foundations';

const meta = {
  title: 'Foundations/ColorPalette',
  component: ColorPalette,
  tags: ['autodocs'],
} satisfies Meta<typeof ColorPalette>;
export default meta;
export const GreenField: StoryObj<typeof meta> = {};
