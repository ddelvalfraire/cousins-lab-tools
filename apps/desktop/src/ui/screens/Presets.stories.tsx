import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { reduceMotion, settleMotion } from '../../../.storybook/settleMotion';
import type { PresetCatalogProps } from '../components/PresetCatalog';
import { toAcquisition, toRecents } from './approved-fixtures';
import { PresetsPage } from './CatalogPages';
import { ScreenShell } from './ScreenShell';
import { experiments } from './screen-fixtures';
import { renderScreen } from './screen-story';
import { DVDashWorkspace } from './Workspace';

/** A frozen catalog state inside the frame. Navigation is recorded, not followed. */
function FrozenPresets(state: Partial<PresetCatalogProps>) {
  const navigate = fn();
  return (
    <ScreenShell
      page="presets"
      navigate={navigate}
      recents={toRecents(experiments)}
      acquisition={toAcquisition(experiments)}
    >
      <PresetsPage
        navigate={navigate}
        onImport={fn()}
        onNewPreset={fn()}
        {...state}
      />
    </ScreenShell>
  );
}

const meta = {
  title: 'Screens/Presets',
  component: DVDashWorkspace,
  render: renderScreen,
  parameters: { layout: 'fullscreen', previewWidth: 'viewport' },
  args: { initialPage: 'presets' },
} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Ends on the New experiment page, whose own heading-order violation also fails the Preparation stories; the catalog part passes. */
const endsOnSetup = { a11y: { test: 'todo' } } as const;
const rows = (canvasElement: HTMLElement) => [
  ...canvasElement.querySelectorAll(
    '.dv-cat-table tbody tr:not([data-motion=leave])',
  ),
];

/** Navigable catalog in the workspace fixture. */
export const Catalog: Story = {};
/** preset-catalog-review.html, Catalog example: sorted by name, sidebar collapsed to its rail. */
export const Default: Story = {
  render: () => <FrozenPresets />,
  play: async ({ canvasElement }) => {
    await expect(rows(canvasElement)).toHaveLength(5);
    await expect(
      within(canvasElement).getByRole('columnheader', { name: /Preset/ }),
    ).toHaveAttribute('aria-sort', 'ascending');
    await expect(
      within(canvasElement).getByText('1–5 of 8 presets'),
    ).toBeVisible();
  },
};
export const SelectedRow: Story = {
  render: () => <FrozenPresets initialSelected="gas" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'CO₂ & O₂ analysis' }),
    ).toBeVisible();
    await expect(rows(canvasElement)[1]).toHaveAttribute(
      'data-selected',
      'true',
    );
  },
};
export const PanelsTab: Story = {
  render: () => <FrozenPresets initialSelected="gas" initialTab="panels" />,
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll('.dv-cat-side-signal'),
    ).toHaveLength(5);
  },
};
export const RevisionsTab: Story = {
  render: () => <FrozenPresets initialSelected="gas" initialTab="revisions" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Current')).toBeVisible();
  },
};
export const SortedByRevision: Story = {
  render: () => (
    <FrozenPresets initialSort={{ key: 'revision', ascending: false }} />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('columnheader', { name: /Revision/ }),
    ).toHaveAttribute('aria-sort', 'descending');
    await expect(rows(canvasElement)[0]).toHaveTextContent('R5');
  },
};
export const Filtered: Story = {
  render: () => <FrozenPresets query="calibration" />,
  play: async ({ canvasElement }) => {
    await expect(rows(canvasElement)).toHaveLength(1);
    await expect(
      within(canvasElement).getByText('Filtered by “calibration”'),
    ).toBeVisible();
  },
};
export const NoResults: Story = {
  render: () => <FrozenPresets query="argon" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'No matching presets' }),
    ).toBeVisible();
  },
};
/** Clear search in the no-results state brings every row back. */
export const ClearSearch: Story = {
  render: () => <FrozenPresets query="argon" />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Clear search' }),
    );
    await expect(rows(canvasElement)).toHaveLength(5);
    await settleMotion();
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-motion="leave"]')).toBeNull(),
    );
    await expect(canvasElement.querySelector('.dv-cat-filter')).toBeNull();
    await expect(canvasElement.querySelector('.dv-cat-state')).toBeNull();
    await expect(
      canvasElement.querySelector('.dv-cat-pagination'),
    ).toBeVisible();
  },
};
export const Empty: Story = {
  render: () => <FrozenPresets presets={[]} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'No presets yet' }),
    ).toBeVisible();
  },
};
export const SidebarCollapsed: Story = {
  render: () => <FrozenPresets initialSelected="gas" initialCollapsed />,
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.dv-right-sidebar'),
    ).toHaveAttribute('data-collapsed', 'true');
    await expect(rows(canvasElement)[1]).toHaveAttribute(
      'data-selected',
      'true',
    );
  },
};
export const Grid: Story = {
  render: () => <FrozenPresets initialView="grid" />,
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll('.dv-cat-tile-card'),
    ).toHaveLength(5);
  },
};
/** At 390 px the pane is a sheet over the list: each name opens it, the same name again too, and Escape closes it. */
export const NarrowSheet: Story = {
  render: () => <FrozenPresets />,
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const side = canvasElement.querySelector<HTMLElement>('.dv-right-sidebar')!;
    const choose = async (name: string) => {
      await userEvent.click(canvas.getByRole('button', { name }));
      await expect(side).toHaveAttribute('data-collapsed', 'false');
      await waitFor(() =>
        expect(side.querySelector('.dv-cat-side-heading')?.textContent).toBe(
          name,
        ),
      );
      await waitFor(() =>
        expect(side.querySelector('[role=tabpanel]')).toHaveFocus(),
      );
    };
    const close = async () => {
      await userEvent.keyboard('{Escape}');
      await expect(side).toHaveAttribute('data-collapsed', 'true');
    };
    await expect(side).toHaveAttribute('data-mode', 'sheet');
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    await choose('Baseline stability');
    await close();
    await choose('CO₂ & O₂ analysis');
    await close();
    await choose('CO₂ & O₂ analysis');
  },
};
/** Sorting, paging and opening a name in the sidebar, then collapsing it. */
export const BrowseCatalog: Story = {
  render: () => <FrozenPresets />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Next page' }));
    await expect(rows(canvasElement)).toHaveLength(3);
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'First page' })).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'First page' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Next page' })).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Revision' }));
    await userEvent.click(canvas.getByRole('button', { name: /Revision/ }));
    await expect(rows(canvasElement)[0]).toHaveTextContent('R5');
    await userEvent.click(
      canvas.getByRole('button', { name: 'CO₂ & O₂ analysis' }),
    );
    await userEvent.click(canvas.getByRole('tab', { name: 'Panels' }));
    await expect(
      canvasElement.querySelectorAll('.dv-cat-side-signal'),
    ).toHaveLength(5);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Collapse right sidebar' }),
    );
    await waitFor(() =>
      expect(canvas.getByRole('tab', { name: 'Panels' })).toHaveFocus(),
    );
  },
};
export const PresetDetail: Story = { args: { initialPage: 'preset' } };
/** The preset page: its current layout beside Details, Panels and Revisions. */
export const PresetRevisions: Story = {
  args: { initialPage: 'preset' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Revisions' }));
    const list = within(
      canvas.getByRole('navigation', { name: 'Saved preset versions' }),
    );
    await expect(list.getAllByRole('button')).toHaveLength(3);
    await expect(list.getAllByRole('button')[0]).toHaveAttribute(
      'aria-current',
      'true',
    );
  },
};
/** Open a preset from the catalog sidebar, then an earlier revision from its Revisions tab (revision-chips-review.html). */
export const OpenRevision: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'CO₂ & O₂ analysis' }),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open preset: CO₂ & O₂ analysis' }),
    );
    await userEvent.click(canvas.getByRole('tab', { name: 'Revisions' }));
    await userEvent.click(
      within(
        canvas.getByRole('navigation', { name: 'Saved preset versions' }),
      ).getByRole('button', { name: /R2/ }),
    );
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Revision history' }),
    ).toBeVisible();
    await expect(canvas.getByRole('main')).toHaveFocus();
    await expect(
      canvas.getByRole('button', { name: 'Restore R2' }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: 'View current preset' }),
    );
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'CO₂ & O₂ analysis' }),
    ).toBeVisible();
  },
};
/** Revision history with the current revision selected. */
export const RevisionHistory: Story = {
  args: { initialPage: 'preset-history' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Revision history' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('tab', { name: 'Changes · 3' }),
    ).toHaveAttribute('aria-selected', 'false');
    await expect(canvas.queryByRole('button', { name: /^Restore/ })).toBeNull();
  },
};
/** Use preset goes straight to setup for a new experiment with that preset. */
export const UsePreset: Story = {
  parameters: endsOnSetup,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use preset: Baseline stability' }),
    );
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'New experiment' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent('Baseline stability');
  },
};
export const EditPreset: Story = {
  args: { initialPage: 'preset' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit preset' }));
    await expect(
      canvas.getByRole('heading', { name: 'CO₂ & O₂ analysis' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /^Save as R4/ }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Move Raw signals earlier' }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole('heading', { name: 'CO₂ calibration settings' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Recording controls' }),
    ).toBeVisible();
  },
};

export const FilterMotion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      search = canvas.getByRole('searchbox', { name: 'Search presets' });
    await userEvent.type(search, 'zzzznomatch');
    await settleMotion();
    await waitFor(() => expect(rows(canvasElement)).toHaveLength(0));
    await expect(
      canvas.getByRole('heading', { name: 'No matching presets' }),
    ).toBeVisible();
    await expect(canvasElement.querySelector('.dv-cat-pagination')).toBeNull();
    await expect(search).toHaveFocus();
    await userEvent.clear(search);
    await settleMotion();
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-motion="leave"]')).toBeNull(),
    );
    await expect(rows(canvasElement).length).toBeGreaterThan(0);
    await expect(canvasElement.querySelector('.dv-cat-filter')).toBeNull();
    await expect(canvasElement.querySelector('.dv-cat-state')).toBeNull();
    await expect(
      canvasElement.querySelector('.dv-cat-pagination'),
    ).toBeVisible();
    await expect(search).toHaveFocus();
  },
};
export const FilterReducedMotion: Story = {
  ...FilterMotion,
  beforeEach: () => reduceMotion(),
};
