import type { Meta, StoryObj } from '@storybook/react-vite';
import { Typography } from './Foundations';

const meta = {
  title: 'Foundations/Typography',
  component: Typography,
  tags: ['autodocs'],
} satisfies Meta<typeof Typography>;
export default meta;
export const Hierarchy: StoryObj<typeof meta> = {};
