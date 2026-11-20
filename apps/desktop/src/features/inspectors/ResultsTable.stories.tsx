import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { formatClockTime } from '@/shared/lib/time';
import { Chip } from '@/shared/ui/Chip';
import { InspectorIcon } from '@/shared/ui/InspectorParts';
import { PageHeader } from '@/shared/ui/PageHeader';
import { WorkspaceBody } from '@/shared/ui/RightSidebar';
import { settleMotion } from '../../../.storybook/settleMotion';
import {
  type ResultQuantity,
  type SavedResult,
  SavedResultInspector,
  type SavedResultPhase,
  SavedResultsTable,
  useSavedResultInspector,
} from './SavedResults';

/** Synthetic saved results. */
const results: SavedResult[] = [1.508, 1.742, 2.713, 1.92, 1.335, 0.85].map(
  (mean, i) => ({
    id: `result-${i + 1}`,
    sample: `Sample ${String(25 + i).padStart(3, '0')}`,
    start: 120 + i * 10,
    end: 140 + i * 10,
    mean,
    value: (mean - 0.303) * 83,
    sampleCount: 41,
    signal: 'Mass 44',
    signalUnit: 'mV',
    recording: `leaf-respiration-${String(25 + i).padStart(3, '0')}.csv`,
    sourceId: `recording-${25 + i}`,
    calibrationRevision: 'c2',
    calibration: { revision: 'c2', zero: 0.303, scale: 83 },
    preset: { name: 'Gas analysis', revision: 'R3' },
    savedAt: `2026-04-14T09:${20 + i}:00Z`,
  }),
);
const quantity: ResultQuantity = {
  symbol: 'CO₂',
  label: 'Dissolved CO₂',
  unit: 'nmol/mL',
  unitName: 'Nanomoles per millilitre',
};
const incomplete = (r: SavedResult): SavedResult => ({
  ...r,
  calibration: null,
  preset: null,
  sourceId: null,
  mean: null,
  sampleCount: null,
});

type Scenario = 'saved' | 'changed' | 'partial' | 'loading' | 'error' | 'empty';
/** The results page: saved results beside the result inspector, beneath the shared header. */
function SavedResultsExample({
  scenario = 'saved',
  onExport,
}: {
  scenario?: Scenario;
  onExport?: (result: SavedResult) => string | undefined;
}) {
  const rows = scenario === 'empty' ? [] : results;
  const shown = (r: SavedResult) =>
    scenario === 'partial' ? incomplete(r) : r;
  const load = (id: string) =>
    new Promise<SavedResult>((resolve) =>
      setTimeout(() => resolve(shown(rows.find((r) => r.id === id)!)), 350),
    );
  const initialPhase: SavedResultPhase =
    scenario === 'loading'
      ? 'loading'
      : scenario === 'error'
        ? 'error'
        : 'ready';
  const inspector = useSavedResultInspector({
    results: rows.map(shown),
    load,
    initialPhase,
  });
  return (
    <div style={{ background: 'var(--dv-bg)' }}>
      <PageHeader
        title="Leaf respiration"
        breadcrumbs={[
          { label: 'Experiments', onClick: () => {} },
          { label: 'Leaf respiration' },
        ]}
        meta={<Chip icon={<InspectorIcon name="file" />}>Recorded</Chip>}
      />
      <WorkspaceBody
        sidebar={
          <SavedResultInspector
            result={inspector.result}
            phase={inspector.phase}
            quantity={quantity}
            tab={inspector.tab}
            onTabChange={inspector.setTab}
            collapsed={inspector.collapsed}
            onCollapsedChange={inspector.setCollapsed}
            onRetry={inspector.retry}
            onExport={onExport}
          />
        }
      >
        <SavedResultsTable
          results={rows}
          quantity={quantity}
          selectedId={inspector.selectedId}
          expanded={!inspector.collapsed}
          onOpen={inspector.open}
          notice={
            scenario === 'changed'
              ? 'Calibration c3 is available. Saved results still use c2.'
              : undefined
          }
        />
      </WorkspaceBody>
    </div>
  );
}

const meta = {
  title: 'Components/SavedResultInspector',
  component: SavedResultsExample,
  tags: ['autodocs'],
  // 1302 px gives the 898 px main column of a 1280 px page padded 16 px, since WorkspaceBody pads 24 px.
  parameters: { layout: 'fullscreen', previewWidth: 1302 },
  args: { scenario: 'saved', onExport: fn() },
  argTypes: {
    scenario: {
      control: 'select',
      options: ['saved', 'changed', 'partial', 'loading', 'error', 'empty'],
    },
    onExport: { control: false },
  },
} satisfies Meta<typeof SavedResultsExample>;
export default meta;
type Story = StoryObj<typeof meta>;

const open = (canvasElement: HTMLElement, sample: string) =>
  within(canvasElement).getByRole('button', { name: `View ${sample} result` });

/** The first result is open with its saved calculation. */
export const SavedResultDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Result details' }),
    ).toBeVisible();
    await expect(open(canvasElement, 'sample 025')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(
      canvas.getByText('100.015', { selector: 'strong' }),
    ).toBeVisible();
    await expect(
      canvas.getByText('(1.508 − 0.303) × 83 = 100.015'),
    ).toBeVisible();
    // The fixture saves at 09:20 UTC; the page shows it in the zone the test runs in, so the expectation is built the same way.
    const saved = new Date('2026-04-14T09:20:00Z');
    await expect(
      canvas.getByText(
        `Saved ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(saved)} · ${formatClockTime(saved)}`,
      ),
    ).toBeVisible();
    await expect(canvas.getByText('1–3 of 6')).toBeVisible();
  },
};
export const NewerCalibrationAvailable: Story = {
  args: { scenario: 'changed' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Calibration c3 is available. Saved results still use c2.',
      ),
    ).toBeVisible();
  },
};
/** Context that was not stored is named, not reconstructed. */
export const IncompleteSavedContext: Story = {
  args: { scenario: 'partial' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Not stored')).toHaveLength(2);
    await expect(
      canvas.getByText(
        'Calibration settings were not stored with this result. Its saved value is retained.',
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Context' }));
    await waitFor(() =>
      expect(canvas.getByText('Recording identifier not stored')).toBeVisible(),
    );
    await expect(canvas.getByText('c2 · settings not stored')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'Details' }));
  },
};
export const LoadingDetails: Story = {
  args: { scenario: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading result details…'),
    ).toBeVisible();
    await expect(
      within(canvasElement).getByRole('button', { name: 'Export result' }),
    ).toBeDisabled();
  },
};
export const DetailsUnavailable: Story = { args: { scenario: 'error' } };
export const NoSavedResults: Story = {
  args: { scenario: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0 results')).toBeVisible();
    await expect(canvas.getByText('No result selected')).toBeVisible();
    await expect(
      canvas.queryByRole('navigation', { name: 'Saved-results pagination' }),
    ).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'Export result' }),
    ).toBeDisabled();
  },
};

/** Opening a row loads its saved context; the table marks the row. */
export const OpenAnotherResult: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(open(canvasElement, 'sample 026'));
    await expect(canvas.getByText('Loading result details…')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Export result' }),
    ).toBeDisabled();
    await expect(
      await canvas.findByText('119.437', { selector: 'strong' }),
    ).toBeVisible();
    await expect(open(canvasElement, 'sample 026')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(open(canvasElement, 'sample 025')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(
      open(canvasElement, 'sample 026').closest('tr'),
    ).toHaveAttribute('data-selected', 'true');
    await userEvent.click(canvas.getByRole('tab', { name: 'Context' }));
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Saved context' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByText('leaf-respiration-026.csv')).toBeVisible(),
    );
    await expect(canvas.getByText('Mass 44 · 130–150 s')).toBeVisible();
  },
};

/** Collapsing the inspector clears the row's expanded state; opening a row shows the inspector again. */
export const CollapseAndReopen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse right sidebar' }),
    );
    await expect(open(canvasElement, 'sample 025')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(
      canvas.queryByRole('heading', { level: 2, name: 'Result details' }),
    ).toBeNull();
    await userEvent.click(open(canvasElement, 'sample 027'));
    await expect(
      await canvas.findByText('200.030', { selector: 'strong' }),
    ).toBeVisible();
    await expect(open(canvasElement, 'sample 027')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  },
};

export const Pagination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
    await expect(canvas.getByText('4–6 of 6')).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Last page' }),
    ).toBeDisabled();
    await expect(open(canvasElement, 'sample 030')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'First page' }));
    await expect(canvas.getByText('1–3 of 6')).toBeVisible();
  },
};

/** A failed load keeps the result in the table; Retry loads it. */
export const RetryDetails: Story = {
  args: { scenario: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        /Could not load saved context\. The result remains in the table\./,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Export result' }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await expect(
      await canvas.findByText('100.015', { selector: 'strong' }),
    ).toBeVisible();
  },
};

export const ExportResult: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Export result' }),
    );
    await expect(args.onExport).toHaveBeenCalledWith(results[0]);
    await waitFor(() =>
      expect(canvas.getByText('Result exported.')).toBeVisible(),
    );
    await settleMotion();
  },
};
