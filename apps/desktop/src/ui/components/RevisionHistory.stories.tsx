import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RightSidebar, SidebarIcon } from '@/shared/ui/RightSidebar';
import { presetRevisions, revisionChanges } from './exchange-fixtures';
import {
  RevisionChanges,
  RevisionHistoryList,
  RevisionRestoreConfirm,
} from './RevisionHistory';
import './SavedVersions.css';

const tabs = [
  { id: 'details', label: 'Details', icon: <SidebarIcon name="details" /> },
  { id: 'panels', label: 'Panels', icon: <SidebarIcon name="panels" /> },
  {
    id: 'revisions',
    label: 'Revisions',
    icon: <SidebarIcon name="revisions" />,
  },
];

/** Saved revisions in the right sidebar's Revisions tab. The full page is in Components/SavedVersions. */
const meta = {
  title: 'Components/RevisionHistory',
  component: RevisionHistoryList,
  parameters: { previewWidth: 360 },
  render: (args) => (
    <RightSidebar
      tabs={tabs}
      defaultTab="revisions"
      title="Revisions"
      subtitle="CO₂ & O₂ analysis"
    >
      <RevisionHistoryList {...args} />
    </RightSidebar>
  ),
  args: { revisions: presetRevisions, current: 3, selected: 3, onSelect: fn() },
} satisfies Meta<typeof RevisionHistoryList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Borderless R labels, Current and selected marks, date and panel chips, inset separators. */
export const Revisions: Story = {
  play: async ({ canvasElement, args }) => {
    const list = within(
      within(canvasElement).getByRole('navigation', {
        name: 'Saved preset versions',
      }),
    );
    const entries = list.getAllByRole('button');
    await expect(entries[0]).toHaveTextContent(
      'R3CurrentSelectedAdjusted signal scaling2 Nov · 10:42:005 panels',
    );
    await expect(
      list.getByLabelText('Saved 2 Nov 2026 at 10:42:00'),
    ).toBeVisible();
    await userEvent.click(entries[2]);
    await expect(args.onSelect).toHaveBeenCalledWith(1);
  },
};

export const EarlierSelected: Story = { args: { selected: 2 } };

/** While a restore runs, choosing another revision waits. */
export const Busy: Story = {
  args: { selected: 2, busy: true },
  play: async ({ canvasElement }) => {
    for (const entry of within(canvasElement).getAllByRole('button', {
      name: /^R\d/,
    }))
      await expect(entry).toBeDisabled();
  },
};

export const NoEarlierRevisions: Story = {
  args: { revisions: presetRevisions.slice(2), current: 1, selected: 1 },
};

/** Changes grouped by panel: previous value, arrow, new value. */
export const Changes: StoryObj<typeof RevisionChanges> = {
  parameters: { previewWidth: 928 },
  render: () => (
    <div className="dv-saved-version">
      <RevisionChanges changes={revisionChanges[3]} />
      <RevisionChanges changes={revisionChanges[2]} />
    </div>
  ),
};

/** Restore confirmation, in progress, failed and done. */
export const RestoreConfirm: StoryObj<typeof RevisionRestoreConfirm> = {
  parameters: { previewWidth: 928 },
  render: () => (
    <div className="dv-saved-version">
      <RevisionRestoreConfirm
        phase="confirm"
        selected={2}
        next={4}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
      <RevisionRestoreConfirm
        phase="restoring"
        selected={2}
        next={4}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
      <RevisionRestoreConfirm
        phase="failed"
        selected={2}
        next={4}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
      <RevisionRestoreConfirm
        phase="restored"
        selected={2}
        next={4}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    </div>
  ),
};
