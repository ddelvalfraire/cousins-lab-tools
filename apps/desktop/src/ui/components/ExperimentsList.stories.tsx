import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ExperimentsList } from './ExperimentsList';
import type { ExperimentSummary, ExperimentsListProps } from './ExperimentsList';
import { chooseOption } from './chooseOption';

const experiments: ExperimentSummary[] = [
  { id: 'exp-026', name: 'Leaf respiration · Sample 026', kind: 'instrument', source: 'MS-01', preset: 'CO₂ & O₂ analysis', revision: 3, samples: 87, status: 'running', startedAt: '2026-11-06T14:02' },
  { id: 'exp-025', name: 'Leaf respiration · Sample 025', kind: 'recording', source: 'leaf-respiration-025.csv', preset: 'CO₂ & O₂ analysis', revision: 3, samples: 601, status: 'recorded', startedAt: '2026-11-05T10:41' },
  { id: 'enz-08', name: 'Enzyme assay · Extract 08', kind: 'recording', source: 'enzyme-extract-08.csv', preset: 'Enzyme kinetics', revision: 2, samples: 121, status: 'recorded', startedAt: '2026-11-04T16:20' },
  { id: 'iso-03', name: 'Isotope exchange · Trial 03', kind: 'instrument', source: 'MS-02', preset: 'Isotope exchange', revision: 1, samples: 64, status: 'interrupted', startedAt: '2026-11-03T11:47' },
];
const many: ExperimentSummary[] = Array.from({ length: 14 }, (_, i) => ({
  id: `trial-${i + 1}`, name: `Leaf respiration · Sample ${String(i + 1).padStart(3, '0')}`, kind: 'recording', source: `leaf-respiration-${String(i + 1).padStart(3, '0')}.csv`,
  preset: 'CO₂ & O₂ analysis', revision: 3, samples: 100 + i, status: 'recorded', startedAt: `2026-10-${String(i + 10).padStart(2, '0')}T09:30`,
}));

/** Query is controlled by the page's header search; this harness clears it the way the page would. */
function ControlledQuery(args: ExperimentsListProps) {
  const [query, setQuery] = useState(args.query);
  useEffect(() => setQuery(args.query), [args.query]);
  return <ExperimentsList {...args} query={query} onClearQuery={() => { args.onClearQuery(); setQuery(''); }} />;
}

const meta = {
  title: 'Components/ExperimentsList',
  component: ExperimentsList,
  tags: ['autodocs'],
  args: {
    experiments, query: '', now: new Date('2026-11-06T16:00'),
    onOpen: fn(), onNewExperiment: fn(), onImport: fn(), onClearQuery: fn(),
  },
  render: ControlledQuery,
  parameters: { layout: 'padded', previewWidth: 1100 },
} satisfies Meta<typeof ExperimentsList>;
export default meta;
type Story = StoryObj<typeof meta>;

const rows = (canvasElement: HTMLElement) => canvasElement.querySelectorAll('tbody tr');

export const RecentExperiments: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(rows(canvasElement)).toHaveLength(4);
    await expect(canvasElement.querySelector('.dv-exp-count')).toHaveTextContent(/^4 experiments$/);
    await expect(canvasElement.querySelector('.dv-page-count')).toHaveTextContent(/^4 experiments$/);
    await expect(canvas.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Workspace');
    await expect(canvasElement.querySelectorAll('.dv-page-actions button')).toHaveLength(2);

    // Rows follow the catalog pattern: icon tile, name, source/preset/revision chips, status word with icon.
    const first = rows(canvasElement)[0] as HTMLElement;
    await expect(first.querySelectorAll('.dv-exp-mark svg')).toHaveLength(1);
    const chips = first.querySelector('.dv-exp-chips') as HTMLElement;
    await expect(chips.querySelectorAll('.dv-chip')).toHaveLength(3);
    for (const text of ['MS-01', 'CO₂ & O₂ analysis', 'R3']) await expect(chips).toHaveTextContent(text);
    const status = first.querySelector('.dv-status-word') as HTMLElement;
    await expect(status).toHaveTextContent(/^Running$/);
    await expect(status.querySelectorAll('svg')).toHaveLength(1);
    await expect(within(first).getByText('Today')).toBeVisible();
    await expect(within(first).getByText('14:02')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Open saved samples: Isotope exchange · Trial 03' })).toHaveClass('dv-exp-open');

    // Headers sort with aria-sort and keep focus.
    const date = canvas.getByRole('columnheader', { name: /Date/ });
    await expect(date).toHaveAttribute('aria-sort', 'descending');
    const samples = canvas.getByRole('button', { name: /Samples/ });
    await userEvent.click(samples);
    await expect(canvas.getByRole('columnheader', { name: /Samples/ })).toHaveAttribute('aria-sort', 'descending');
    await expect(date).toHaveAttribute('aria-sort', 'none');
    await expect(rows(canvasElement)[0]).toHaveTextContent('Sample 025');
    await expect(samples).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('columnheader', { name: /Samples/ })).toHaveAttribute('aria-sort', 'ascending');
    await expect(rows(canvasElement)[0]).toHaveTextContent('Trial 03');
    await expect(samples).toHaveFocus();

    // Opening reports the experiment; the action names the status-specific verb.
    await userEvent.click(canvas.getByRole('button', { name: 'Open live: Leaf respiration · Sample 026' }));
    await expect(args.onOpen).toHaveBeenLastCalledWith('exp-026');
    await userEvent.click(canvas.getByRole('button', { name: 'Enzyme assay · Extract 08' }));
    await expect(args.onOpen).toHaveBeenLastCalledWith('enz-08');
    await userEvent.click(canvas.getByRole('button', { name: 'Import recordings' }));
    await expect(args.onImport).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'New experiment' }));
    await expect(args.onNewExperiment).toHaveBeenCalledOnce();

    // Back to the default order, newest first, as the page opens.
    await userEvent.click(canvas.getByRole('button', { name: /Date/ }));
    await expect(date).toHaveAttribute('aria-sort', 'descending');
    await expect(rows(canvasElement)[0]).toHaveTextContent('Sample 026');
  },
};

export const FirstUse: Story = {
  args: { experiments: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'No experiments yet' })).toBeVisible();
    await expect(canvasElement.querySelector('table')).toBeNull();
    await expect(canvasElement.querySelectorAll('.dv-page-actions button')).toHaveLength(0);
    await expect(canvas.getAllByRole('button', { name: 'New experiment' })).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', { name: 'New experiment' }));
    await expect(args.onNewExperiment).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Import recordings' }));
    await expect(args.onImport).toHaveBeenCalledOnce();
  },
};

export const NoSearchMatches: Story = {
  args: { query: 'Sample 099' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'No experiments match “Sample 099”' })).toBeVisible();
    await expect(canvasElement.querySelector('.dv-exp-filter')).toHaveTextContent('Filtered by “Sample 099”');
    await expect(canvasElement.querySelector('.dv-exp-count')).toHaveTextContent(/^0 of 4 experiments$/);
    await expect(canvasElement.querySelector('.dv-exp-pagination')).toBeNull();
  },
};

/** Clear filter in the no-match message brings every experiment back. */
export const ClearNoMatches: Story = {
  args: { query: 'Sample 099' },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement.querySelector('.dv-exp-empty') as HTMLElement).getByRole('button', { name: 'Clear filter' }));
    await expect(args.onClearQuery).toHaveBeenCalledOnce();
    await expect(rows(canvasElement)).toHaveLength(4);
    await expect(canvasElement.querySelector('.dv-exp-filter')).toBeNull();
  },
};

/** Header search narrows the list and reports the filtered count. */
export const Filtered: Story = {
  args: { query: 'enzyme' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(rows(canvasElement)).toHaveLength(1);
    await expect(canvasElement.querySelector('.dv-exp-count')).toHaveTextContent(/^1 of 4 experiments$/);
    await expect(canvasElement.querySelector('.dv-exp-filter')).toHaveTextContent('Filtered by “enzyme”');
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filter' }));
    await expect(args.onClearQuery).toHaveBeenCalledOnce();
    await expect(rows(canvasElement)).toHaveLength(4);
  },
};

export const Paginated: Story = {
  args: { experiments: many },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(rows(canvasElement)).toHaveLength(10);
    const footer = canvasElement.querySelector('.dv-exp-pagination') as HTMLElement;
    await expect(footer).toHaveTextContent('1–10 of 14 experiments');
    await expect(canvas.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
    await expect(footer).toHaveTextContent('11–14 of 14 experiments');
    await expect(footer).toHaveTextContent('2 / 2');
    await expect(canvas.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await chooseOption(canvas.getByRole('combobox', { name: 'Rows per page' }), '25');
    await expect(rows(canvasElement)).toHaveLength(14);
    await expect(footer).toHaveTextContent('1 / 1');
  },
};

/** The table scrolls inside its frame; the page itself never scrolls sideways. */
export const Narrow: Story = {
  parameters: { previewWidth: 360 },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.dv-exp') as HTMLElement;
    const frame = canvasElement.querySelector('.dv-exp-frame') as HTMLElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    await expect(frame.scrollWidth).toBeGreaterThan(frame.clientWidth);
    await expect(frame).toHaveAttribute('tabindex', '0');
  },
};
