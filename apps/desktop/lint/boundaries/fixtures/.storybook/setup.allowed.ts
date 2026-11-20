import type { ReactNode } from 'react';
import { dvdashTheme } from '../src/shared/theme/theme';
import { Chip } from '@/shared/ui/Chip';
import '../src/shared/theme/dvdash.css';
import '../src/app/screens/screens.css';
import { StoryFrame } from './StoryFrame';

export const used = [dvdashTheme, Chip, StoryFrame];
export type Node = ReactNode;
