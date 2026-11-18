import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  presetRevisions,
  restoredRevision,
  revisionChanges,
  savedPreview,
} from './exchange-fixtures';
import { HeaderButton, PageHeader } from './PageHeader';
import {
  type PresetRevision,
  type RestorePhase,
  RevisionHistoryList,
} from './RevisionHistory';
import { RightSidebar, SidebarIcon, WorkspaceBody } from './RightSidebar';
import {
  SavedVersionPreview,
  type SavedVersionTab,
  SavedVersionView,
} from './SavedVersions';
import { reduceMotion, settleMotion } from './settleMotion';

/** Story revisions remember which revision a restored copy came from, to show its layout and changes. */
type StoryRevision = PresetRevision & { restoredFrom?: number };
/** Restoring R2 over R3 undoes R3's changes. */
const undoChanges = (number: number) =>
  (revisionChanges[number] ?? []).map((change) => ({
    ...change,
    before: change.after,
    after: change.before,
  }));

interface PageArgs {
  revisions: readonly StoryRevision[];
  selected: number;
  tab: SavedVersionTab;
  restore: RestorePhase;
  restoredFrom?: number;
  status: 'ready' | 'loading' | 'error';
  title: string;
}

/**
 * Revision history page as composed in the app: shared header, the selected revision in the page,
 * and the revision list in the right sidebar's Revisions tab. Selecting, tabs and restore are interactive.
 */
function RevisionHistoryPage(args: PageArgs) {
  const [revisions, setRevisions] = useState<readonly StoryRevision[]>(
    args.revisions,
  );
  const [selected, setSelected] = useState(args.selected);
  const [tab, setTab] = useState(args.tab);
  const [restore, setRestore] = useState(args.restore);
  const [restoredFrom, setRestoredFrom] = useState(args.restoredFrom);
  const current = revisions[0].number;
  const revision =
    revisions.find((item) => item.number === selected) ?? revisions[0];
  const index = revisions.indexOf(revision);
  const previous = revisions[index + 1];
  const confirm = () => {
    setRestore('restoring');
    window.setTimeout(() => {
      const created: StoryRevision = {
        ...revision,
        number: current + 1,
        note: `Restored from R${revision.number}`,
        savedAt: restoredRevision.savedAt,
        restoredFrom: revision.number,
      };
      setRevisions((list) => [created, ...list]);
      setRestoredFrom(revision.number);
      setSelected(created.number);
      setTab('preview');
      setRestore('restored');
    }, 600);
  };
  const preview = savedPreview(
    revision.restoredFrom ?? Math.min(revision.number, 3),
  );
  return (
    <div
      className="dv-story-page"
      style={{ background: 'var(--dv-bg)', minHeight: '100vh' }}
    >
      <PageHeader
        title="Revision history"
        titleId="revision-history-title"
        breadcrumbs={[
          { label: 'Workspace', onClick: () => {} },
          { label: 'Presets', onClick: () => {} },
          { label: args.title, onClick: () => {} },
          { label: 'Revision history' },
        ]}
        metadata={
          <>
            <SidebarIcon name="panels" />
            {args.title}
          </>
        }
        actions={<HeaderButton>View current preset</HeaderButton>}
      />
      <WorkspaceBody
        sidebar={
          <RightSidebar
            label="Page tools"
            defaultTab="revisions"
            title="Revisions"
            subtitle={args.title}
            tabs={[
              {
                id: 'details',
                label: 'Details',
                icon: <SidebarIcon name="details" />,
              },
              {
                id: 'panels',
                label: 'Panels',
                icon: <SidebarIcon name="panels" />,
              },
              {
                id: 'revisions',
                label: 'Revisions',
                icon: <SidebarIcon name="revisions" />,
              },
            ]}
          >
            <RevisionHistoryList
              revisions={revisions}
              current={current}
              selected={selected}
              busy={restore === 'restoring'}
              onSelect={(number) => {
                setSelected(number);
                setRestore('idle');
              }}
            />
          </RightSidebar>
        }
      >
        <SavedVersionView
          title={args.title}
          revision={revision}
          current={current}
          status={args.status}
          tab={tab}
          onTabChange={setTab}
          preview={<SavedVersionPreview {...preview} />}
          changes={
            revision.restoredFrom
              ? undoChanges(revision.restoredFrom + 1)
              : (revisionChanges[revision.number] ?? [])
          }
          comparedWith={previous?.number}
          restore={restore}
          restoredFrom={restoredFrom}
          onRestore={() => setRestore('confirm')}
          onCancelRestore={() => setRestore('idle')}
          onConfirmRestore={confirm}
        />
      </WorkspaceBody>
    </div>
  );
}

const meta = {
  title: 'Components/SavedVersions',
  component: RevisionHistoryPage,
  parameters: { layout: 'fullscreen', previewWidth: 1440 },
  args: {
    revisions: presetRevisions,
    selected: 3,
    tab: 'preview',
    restore: 'idle',
    status: 'ready',
    title: 'CO₂ & O₂ analysis',
  },
  argTypes: {
    tab: { control: 'inline-radio', options: ['preview', 'changes'] },
    restore: {
      control: 'select',
      options: ['idle', 'confirm', 'restoring', 'failed', 'restored'],
    },
    status: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
  },
} satisfies Meta<typeof RevisionHistoryPage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The current revision's layout. */
export const CurrentPreset: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const list = within(
      page.getByRole('navigation', { name: 'Saved preset versions' }),
    );
    await expect(list.getAllByRole('button')).toHaveLength(3);
    await expect(list.getAllByRole('button')[0]).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(
      page.getByRole('tab', { name: 'Changes · 3' }),
    ).toHaveAttribute('aria-selected', 'false');
    await expect(page.queryByRole('button', { name: /^Restore/ })).toBeNull();
  },
};

/** Choosing a saved revision previews it and offers to restore it. */
export const ChooseRevision: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(
      within(
        page.getByRole('navigation', { name: 'Saved preset versions' }),
      ).getByRole('button', { name: /R2/ }),
    );
    await waitFor(
      () =>
        expect(page.getByRole('button', { name: 'Restore R2' })).toBeVisible(),
      { timeout: 10000 },
    );
    await settleMotion();
    await expect(page.getByText('Earlier version')).toBeVisible();
  },
};

/** What the current revision changed, compared with the one before. */
export const Changes: Story = {
  args: { tab: 'changes' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      page.getByText('Changes saved in R3 · compared with R2'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mass 44' })).toBeVisible();
  },
};

/** Arrow keys move between the Preview and Changes tabs. */
export const TabKeyboard: Story = {
  args: { tab: 'changes' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('tab', { name: 'Changes · 3' }));
    await userEvent.keyboard('{ArrowLeft}');
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveFocus();
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await settleMotion();
  },
};

export const EarlierRevision: Story = { args: { selected: 2 } };

export const EarlierLayout: Story = { args: { selected: 1 } };

/** The first revision has nothing to compare with. */
export const FirstRevisionChanges: Story = {
  args: { selected: 1, tab: 'changes' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('First saved version'),
    ).toBeVisible();
  },
};

/** Restore asks first. */
export const RestoreConfirm: Story = {
  args: { selected: 2, restore: 'confirm' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      page.getByText(
        'Restore R2 as R4? Existing experiments keep their pinned revisions.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create R4' })).toBeEnabled();
  },
};

/** Confirming appends a new revision; earlier ones stay as they are. */
export const RestoreFlow: Story = {
  args: { selected: 2, restore: 'confirm' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Create R4' }));
    await expect(
      page.getByRole('button', { name: 'Creating R4…' }),
    ).toBeDisabled();
    await waitFor(
      () => expect(page.getByText('R4 created from R2.')).toBeVisible(),
      { timeout: 10000 },
    );
    await settleMotion();
    const list = within(
      page.getByRole('navigation', { name: 'Saved preset versions' }),
    );
    await expect(list.getAllByRole('button')).toHaveLength(4);
    await expect(list.getAllByRole('button')[0]).toHaveTextContent(
      'Restored from R2',
    );
  },
};

export const Restoring: Story = { args: { selected: 2, restore: 'restoring' } };

export const Restored: Story = {
  args: {
    revisions: [{ ...restoredRevision, restoredFrom: 2 }, ...presetRevisions],
    selected: 4,
    restore: 'restored',
    restoredFrom: 2,
  },
};

export const RestoreFailed: Story = {
  args: { selected: 2, restore: 'failed' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      page.getByText('Could not create the revision. Try again.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  },
};

export const NoEarlierRevisions: Story = {
  args: { revisions: presetRevisions.slice(2), selected: 1 },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('tab', { name: 'Changes' })).toBeVisible();
  },
};

export const Loading: Story = { args: { status: 'loading' } };

export const Unavailable: Story = {
  args: { status: 'error' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Saved versions could not be loaded.'),
    ).toBeVisible();
  },
};

export const LongLabels: Story = {
  args: {
    title:
      'Carbon dioxide and oxygen response during temperature and concentration changes',
  },
};

/** Chart previews fill a wide card instead of staying at the mockup's 260 px. */
export const WidePreview: Story = {
  render: () => (
    <div style={{ width: 1600, padding: 24 }}>
      <SavedVersionPreview {...savedPreview(3)} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const plots = [
      ...canvasElement.querySelectorAll<SVGSVGElement>('.dv-saved-plot'),
    ];
    await expect(plots.length).toBeGreaterThan(0);
    for (const plot of plots)
      await waitFor(() =>
        expect(plot.viewBox.baseVal.width).toBe(
          Math.round(plot.getBoundingClientRect().width),
        ),
      );
    for (const plot of plots)
      await expect(plot.viewBox.baseVal.width).toBeGreaterThan(600);
    for (const plot of plots)
      await expect(plot.getScreenCTM()!.a).toBeCloseTo(1, 3);
    for (const plot of plots)
      await expect(plot.getBoundingClientRect().height).toBe(150);
  },
};
/** Largest text: each plot scales by 1.5 as a whole, so its labels grow without running into each other. */
export const WidePreviewLargestText: Story = {
  ...WidePreview,
  globals: { textSize: 'largest' },
  play: async ({ canvasElement }) => {
    const plots = [
      ...canvasElement.querySelectorAll<SVGSVGElement>('.dv-saved-plot'),
    ];
    await expect(plots.length).toBeGreaterThan(0);
    for (const plot of plots)
      await waitFor(() =>
        expect(plot.viewBox.baseVal.width).toBeCloseTo(
          plot.getBoundingClientRect().width / 1.5,
          0,
        ),
      );
    for (const plot of plots) {
      await expect(Math.abs(plot.getScreenCTM()!.a - 1.5)).toBeLessThanOrEqual(
        0.02,
      );
      await expect(plot.getBoundingClientRect().height).toBe(225);
      const boxes = [...plot.querySelectorAll('text')].map((t) => ({
        text: t.textContent,
        box: t.getBoundingClientRect(),
      }));
      for (const [i, a] of boxes.entries())
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.box.right <= b.box.left ||
            b.box.right <= a.box.left ||
            a.box.bottom <= b.box.top ||
            b.box.bottom <= a.box.top;
          await expect(apart, `${a.text} and ${b.text}`).toBe(true);
        }
    }
  },
};

export const RevisionMotion: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    let animated = false,
      overlap = false,
      sampling = true;
    const sample = () => {
      for (const swap of canvasElement.querySelectorAll(
        '.dv-swap-sequential',
      )) {
        const entering = swap.querySelector(':scope > [data-motion="enter"]'),
          leaving = swap.querySelector(':scope > [data-motion="leave"]');
        overlap ||=
          !!entering &&
          !!leaving &&
          Number(getComputedStyle(entering).opacity) > 0 &&
          Number(getComputedStyle(leaving).opacity) > 0;
      }
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const observer = new MutationObserver(() => {
      animated ||= !!canvasElement.querySelector('[data-motion]');
    });
    observer.observe(canvasElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    await userEvent.click(
      within(
        page.getByRole('navigation', { name: 'Saved preset versions' }),
      ).getByRole('button', { name: /R2/ }),
    );
    await settleMotion();
    await userEvent.click(page.getByRole('tab', { name: /Changes/ }));
    await settleMotion();
    await expect(page.getByRole('tab', { name: /Changes/ })).toHaveFocus();
    await userEvent.click(page.getByRole('button', { name: 'Restore R2' }));
    await settleMotion();
    await expect(page.getByRole('button', { name: 'Create R4' })).toHaveFocus();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await settleMotion();
    await expect(
      page.getByRole('button', { name: 'Restore R2' }),
    ).toHaveFocus();
    await userEvent.click(page.getByRole('button', { name: 'Restore R2' }));
    await userEvent.click(page.getByRole('button', { name: 'Create R4' }));
    await waitFor(
      () => expect(page.getByText('R4 created from R2.')).toBeVisible(),
      { timeout: 10000 },
    );
    await settleMotion();
    await expect(
      canvasElement.querySelector('.dv-saved-version [role="tabpanel"]'),
    ).toHaveFocus();
    await waitFor(
      () => expect(canvasElement.querySelector('[data-motion]')).toBeNull(),
      { timeout: 10000 },
    );
    sampling = false;
    observer.disconnect();
    await expect(overlap).toBe(false);
    await expect(animated).toBe(
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    await expect(
      within(
        page.getByRole('navigation', { name: 'Saved preset versions' }),
      ).getAllByRole('button'),
    ).toHaveLength(4);
  },
};
export const RevisionReducedMotion: Story = {
  ...RevisionMotion,
  beforeEach: () => reduceMotion(),
};
