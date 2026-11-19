// Command center records built from the screen fixtures. Synthetic data; nothing here reads files.
import type { ReactNode } from 'react';
import {
  type ExperimentSummary,
  presets,
} from '@/shared/testing/screen-fixtures';
import { type StatusTone, StatusWord } from '@/shared/ui/Chip';
import { CommandGlyph } from '@/shared/ui/CommandCenter';
import { ReviewIcon } from '@/shared/ui/ReviewIcons';
import { InstrumentStatus } from '../components/InstrumentCatalog';
import { toListExperiment, toRecents } from './approved-fixtures';
import {
  catalogInstruments,
  catalogPresets,
  catalogRoutines,
} from './catalog-fixtures';
import type { SearchRecord } from './ScreenShell';

/** The Experiments list's status words (ExperimentsList). */
const experimentStatus: Record<
  ExperimentSummary['status'],
  { label: string; tone: StatusTone; icon: ReactNode }
> = {
  Running: {
    label: 'Running',
    tone: 'accent',
    icon: <ReviewIcon name="signals" />,
  },
  Recorded: {
    label: 'Recorded',
    tone: 'neutral',
    icon: <ReviewIcon name="check" />,
  },
  Interrupted: {
    label: 'Interrupted',
    tone: 'warning',
    icon: <ReviewIcon name="warn" />,
  },
};
const revision = (n: number) => (
  <>
    <CommandGlyph name="history" />R{n}
  </>
);

/** Experiments, presets, routines and instruments as the catalog pages show them. Recent: the sidebar's recents and their presets. */
export function searchRecords(
  rows: readonly ExperimentSummary[],
): SearchRecord[] {
  const recent = new Set(toRecents(rows).map((item) => item.id));
  const recentPresets = new Set(
    rows.filter((row) => recent.has(row.id)).map((row) => row.presetId),
  );
  return [
    ...rows.map((row): SearchRecord => {
      const listed = toListExperiment(row),
        status = experimentStatus[row.status];
      return {
        id: `experiment-${row.id}`,
        kind: 'experiments',
        title: row.name,
        meta: `${listed.preset} · ${listed.source}`,
        keywords: presets
          .find((preset) => preset.id === row.presetId)
          ?.signals.join(' '),
        icon: <CommandGlyph name="experiment" />,
        end: (
          <StatusWord tone={status.tone} icon={status.icon}>
            {status.label}
          </StatusWord>
        ),
        recent: recent.has(row.id),
        page: 'experiment',
        pageId: row.id,
      };
    }),
    ...catalogPresets.map(
      (preset): SearchRecord => ({
        id: `preset-${preset.id}`,
        kind: 'presets',
        title: preset.name,
        meta: `${preset.panels.length} panels · ${preset.description}`,
        keywords: preset.panels.map((panel) => panel.name).join(' '),
        icon: <CommandGlyph name="preset" />,
        end: revision(preset.revision),
        recent: recentPresets.has(preset.id),
        page: 'preset',
        pageId: preset.id,
      }),
    ),
    ...catalogRoutines.map(
      (routine): SearchRecord => ({
        id: `routine-${routine.id}`,
        kind: 'routines',
        title: routine.name,
        meta: `${routine.steps.length} steps · ${routine.role}`,
        keywords: routine.parameters.map(([name]) => name).join(' '),
        icon: <CommandGlyph name="routine" />,
        end: revision(routine.revision),
        page: 'routines',
        pageId: routine.id,
      }),
    ),
    ...catalogInstruments.map(
      (instrument): SearchRecord => ({
        id: `instrument-${instrument.id}`,
        kind: 'instruments',
        title: instrument.name,
        meta: `${instrument.id} · ${instrument.transport}`,
        keywords: instrument.channels.map((channel) => channel.name).join(' '),
        icon: <CommandGlyph name="instrument" />,
        end: <InstrumentStatus state={instrument.state} />,
        page: 'instruments',
        pageId: instrument.id,
      }),
    ),
  ];
}
