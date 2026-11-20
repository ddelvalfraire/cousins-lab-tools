import { Beta } from '@/features/beta';
import { betaRows } from '@/features/beta/fixtures';
import { Chip } from '@/shared/ui/Chip';
import { Shell } from './Shell';

export const used = [Beta, betaRows, Chip, Shell];
export type Props = import('@/features/beta').BetaProps;
