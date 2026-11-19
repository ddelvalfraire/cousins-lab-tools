import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { CommandGlyph } from '@/shared/ui/CommandCenter';
import { PageHeader } from '@/shared/ui/PageHeader';
import { settleMotion } from '../../../.storybook/settleMotion';
import type {
  CurrentAcquisition,
  RecentExperiment,
} from '../components/SideNavigation';
import { acquisitionTrace } from './approved-fixtures';
import {
  type ScreenRoute,
  ScreenShell,
  type ScreenShellProps,
  type SearchRecord,
} from './ScreenShell';

/** The main-sidebar review's sample recents and acquisition. */
const recents: RecentExperiment[] = [
  {
    id: '025',
    title: 'Sample 025',
    subtitle: 'Leaf respiration',
    state: 'live',
  },
  {
    id: '08',
    title: 'Extract 08',
    subtitle: 'Enzyme assay',
    state: 'opened',
    tone: 'violet',
  },
];
const acquisition: CurrentAcquisition = {
  experimentId: '025',
  title: 'Sample 025',
  source: 'Simulator',
  samples: 87,
  elapsed: '00:43',
  trace: acquisitionTrace,
};

/** Sample records for the command center (command-center-review.html). */
const searchRecords: SearchRecord[] = [
  {
    id: '025',
    kind: 'experiments',
    title: 'Leaf respiration · Sample 025',
    meta: 'CO₂ & O₂ analysis · MS-01',
    icon: <CommandGlyph name="experiment" />,
    keywords: 'mass 44 mass 45',
    recent: true,
    page: 'experiment',
    pageId: '025',
  },
  {
    id: '08',
    kind: 'experiments',
    title: 'Enzyme assay · Extract 08',
    meta: 'Enzyme kinetics · enzyme-extract-08.csv',
    icon: <CommandGlyph name="experiment" />,
    keywords: 'mass 32 oxygen',
    page: 'experiment',
    pageId: '08',
  },
  {
    id: 'gas',
    kind: 'presets',
    title: 'CO₂ & O₂ analysis',
    meta: '10 panels · Compare gas signals with calibrated readouts.',
    icon: <CommandGlyph name="preset" />,
    keywords: 'mass 44 leaf respiration',
    page: 'preset',
    pageId: 'gas',
  },
  {
    id: 'ms01',
    kind: 'instruments',
    title: 'Mass spectrometer',
    meta: 'MS-01 · USB serial',
    icon: <CommandGlyph name="instrument" />,
    keywords: 'mass 44 mass 45',
    page: 'instruments',
    pageId: 'MS-01',
  },
];

const titles: Partial<Record<ScreenRoute, string>> = {
  experiments: 'Experiments',
  presets: 'Presets',
  routines: 'Routines',
  instruments: 'Instruments',
  settings: 'Settings',
};

/** The frame around a placeholder page, as in main-sidebar-review.html. Routing is simulated. */
function FrameExample(args: ScreenShellProps) {
  const [page, setPage] = useState<ScreenRoute>(args.page),
    [query, setQuery] = useState('');
  const title =
    titles[page] ??
    (page === 'preset' ? 'CO₂ & O₂ analysis' : 'Leaf respiration · Sample 025');
  return (
    <ScreenShell
      {...args}
      page={page}
      pageQuery={query}
      onPageQueryChange={setQuery}
      navigate={(next, id) => {
        setPage(next);
        setQuery('');
        args.navigate(next, id);
      }}
    >
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: 'Workspace', onClick: () => setPage('experiments') },
          ...(page === 'experiment'
            ? [{ label: 'Experiments', onClick: () => setPage('experiments') }]
            : []),
          { label: page === 'experiment' ? 'Sample 025' : title },
        ]}
      />
      <div className="dv-frame-placeholder">
        {query ? `Page content filtered by “${query}”` : 'Page content'}
      </div>
    </ScreenShell>
  );
}

const meta = {
  title: 'Screens/Frame',
  component: ScreenShell,
  parameters: { layout: 'fullscreen', previewWidth: 'viewport' },
  args: {
    page: 'experiments',
    navigate: fn(),
    recents,
    acquisition,
    onAppearanceChange: fn(),
    onNewExperiment: fn(),
    onImportRecordings: fn(),
    searchRecords,
    children: null,
  },
  render: (args) => <FrameExample {...args} />,
} satisfies Meta<typeof ScreenShell>;
export default meta;
type Story = StoryObj<typeof meta>;

const box = (canvasElement: HTMLElement, selector: string) =>
  canvasElement.querySelector(selector)!.getBoundingClientRect();

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(box(canvasElement, '.dv-shell-topbar').height).toBe(58);
    await expect(box(canvasElement, '.dv-side-navigation').width).toBe(184);
    const card = canvasElement.querySelector<HTMLElement>('.dv-shell-page')!,
      style = getComputedStyle(card);
    await expect(style.borderTopWidth).toBe('1px');
    await expect(style.borderTopLeftRadius).toBe('10px');
    // 8 px of frame to the right of and below the card.
    const shell = box(canvasElement, '.dv-shell'),
      page = card.getBoundingClientRect();
    await expect(Math.round(shell.right - page.right)).toBe(8);
    await expect(Math.round(shell.bottom - page.bottom)).toBe(8);
    // The logo is in the window bar, not the sidebar.
    await expect(
      canvasElement.querySelector('.dv-side-navigation .dv-brand-concept'),
    ).toBeNull();
    await expect(
      canvas.getByRole('button', { name: 'DVDash experiments home' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('combobox', { name: 'Search scope' }),
    ).toHaveValue('Experiments');
  },
};

/** Sidebar destinations route the page; the window bar switches appearance. */
export const Navigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use dark appearance' }),
    );
    await expect(args.onAppearanceChange).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Presets' }));
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Presets' }),
    ).toBeVisible();
    await expect(args.navigate).toHaveBeenLastCalledWith('presets', undefined);
    await expect(
      canvas.getByRole('combobox', { name: 'Search scope' }),
    ).toHaveValue('Presets');
    await userEvent.click(
      canvas.getAllByRole('button', { name: /Sample 025/ })[0],
    );
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: 'Leaf respiration · Sample 025',
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('combobox', { name: 'Search scope' }),
    ).toHaveValue('This experiment');
  },
};

export const Collapsed: Story = {
  args: { defaultCollapsed: true },
  play: async ({ canvasElement }) => {
    await expect(box(canvasElement, '.dv-side-navigation').width).toBe(58);
    await expect(Math.round(box(canvasElement, '.dv-shell-page').left)).toBe(
      58,
    );
    await expect(
      canvasElement.querySelector('.dv-shell-wordmark'),
    ).toHaveTextContent('DVDash');
  },
};

/** Collapse and expand move the card with the rail. */
export const CollapseAndExpand: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse' }));
    await waitFor(() =>
      expect(box(canvasElement, '.dv-side-navigation').width).toBe(58),
    );
    await waitFor(() =>
      expect(Math.round(box(canvasElement, '.dv-shell-page').left)).toBe(58),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Expand' }));
    await waitFor(() =>
      expect(box(canvasElement, '.dv-side-navigation').width).toBe(184),
    );
    await waitFor(() =>
      expect(Math.round(box(canvasElement, '.dv-shell-page').left)).toBe(184),
    );
  },
};

export const InsideAnExperiment: Story = { args: { page: 'experiment' } };

/** Compact window: the sidebar becomes a drawer opened from the window bar's menu button. */
export const CompactWindow: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await expect(
      canvasElement.querySelector('.dv-shell-sidebar'),
    ).not.toBeVisible();
    const menu = canvas.getByRole('button', { name: 'Open navigation' });
    await expect(menu).toBeVisible();
    await userEvent.click(menu);
    const drawer = await body.findByRole('dialog', { name: 'Navigation' });
    await waitFor(() => expect(drawer).toBeVisible());
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Presets' }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Navigation' }),
      ).not.toBeInTheDocument(),
    );
    await expect(args.navigate).toHaveBeenLastCalledWith('presets', undefined);
    await waitFor(() => expect(menu).toHaveFocus());
    // Reopen and return to Experiments, leaving the example on its first page.
    await userEvent.click(menu);
    await userEvent.click(
      within(await body.findByRole('dialog', { name: 'Navigation' })).getByRole(
        'button',
        { name: 'Experiments' },
      ),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Navigation' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(menu).toHaveFocus());
  },
};

/** Narrow window: the search box drops its keycaps so the placeholder fits, as in unified-search-review.html. */
export const NarrowSearch: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseOption(
      canvas.getByRole('combobox', { name: 'Search scope' }),
      'all',
    );
    const input = canvas.getByRole('combobox', {
        name: 'Search all DVDash',
      }) as HTMLInputElement,
      style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room =
      input.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    await expect(
      canvasElement.querySelector('.dv-shell-shortcut'),
    ).not.toBeVisible();
    await expect(
      context.measureText(input.placeholder).width,
    ).toBeLessThanOrEqual(room);
    await settleMotion();
  },
};

const searchInput = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('searchbox', { name: /^Search / });
const commandCenter = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('combobox', { name: 'Search all DVDash' });
const selected = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[role=option][aria-selected=true]');

/** Ctrl+K (⌘K on macOS) opens the command center from anywhere; Escape closes it and returns focus. */
export const CommandCenterShortcut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      presets = canvas.getByRole('button', { name: 'Presets' });
    presets.focus();
    await userEvent.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(commandCenter(canvasElement)).toHaveFocus());
    await expect(commandCenter(canvasElement)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(
      canvas.getByRole('combobox', { name: 'Search scope' }),
    ).toHaveValue('All DVDash');
    await waitFor(() =>
      expect(
        canvas.getByRole('group', { name: 'Suggested actions' }),
      ).toBeVisible(),
    );
    await expect(
      canvas.getByRole('group', { name: 'Recent · Experiments' }),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await expect(presets).toHaveFocus();
  },
};

/** Escape closes the results and leaves the caret in the box; a click in the box shows them again. */
export const ClickReopensResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseOption(
      canvas.getByRole('combobox', { name: 'Search scope' }),
      'All DVDash',
    );
    const input = commandCenter(canvasElement);
    await userEvent.click(input);
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toHaveFocus();
    await userEvent.click(input);
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible());
    await settleMotion();
  },
};

/** Arrow keys move the highlight, wrapping at both ends; Enter runs it. */
export const ArrowKeysAndEnter: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /Open command center/ }),
    );
    const input = commandCenter(canvasElement);
    await expect(selected(canvasElement)).toHaveTextContent('New experiment…');
    await userEvent.keyboard('{ArrowDown}');
    await expect(selected(canvasElement)).toHaveTextContent(
      'Import recordings…',
    );
    await expect(input).toHaveAttribute(
      'aria-activedescendant',
      selected(canvasElement)!.id,
    );
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(selected(canvasElement)).toHaveTextContent(
      'Leaf respiration · Sample 025',
    );
    await userEvent.type(input, 'go to presets');
    await expect(selected(canvasElement)).toHaveTextContent('Go to Presets');
    await userEvent.keyboard('{Enter}');
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Presets' }),
    ).toBeVisible();
    await expect(args.navigate).toHaveBeenLastCalledWith('presets', undefined);
    await waitFor(() =>
      expect(canvasElement.querySelector('main')).toHaveFocus(),
    );
    // A record opens its page with its id.
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(commandCenter(canvasElement), 'leaf');
    await userEvent.click(
      canvas.getByRole('option', { name: /^CO₂ & O₂ analysis/ }),
    );
    await expect(args.navigate).toHaveBeenLastCalledWith('preset', 'gas');
  },
};

/** "?" opens the shortcuts outside text fields only; the keyboard button opens them too and gets focus back. */
export const ShortcutsPanel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await userEvent.type(searchInput(canvasElement), 'a?b');
    await expect(searchInput(canvasElement)).toHaveValue('a?b');
    await expect(
      body.queryByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeNull();
    await expect(
      canvas.getByText('Page content filtered by “a?b”'),
    ).toBeVisible();
    canvasElement.querySelector<HTMLElement>('main')!.focus();
    await userEvent.keyboard('?');
    await waitFor(() =>
      expect(
        body.getByRole('dialog', { name: 'Keyboard shortcuts' }),
      ).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Keyboard shortcuts' }),
      ).toBeNull(),
    );
    const button = canvas.getByRole('button', {
      name: 'Show keyboard shortcuts',
    });
    await userEvent.click(button);
    await waitFor(() =>
      expect(
        body.getByRole('dialog', { name: 'Keyboard shortcuts' }),
      ).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(button).toHaveFocus());
  },
};

/** Typed text moves with the scope: the page filter becomes an All DVDash search. */
export const ScopeChange: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(searchInput(canvasElement), 'mass');
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await expect(
      canvas.getByText('Page content filtered by “mass”'),
    ).toBeVisible();
    await chooseOption(
      canvas.getByRole('combobox', { name: 'Search scope' }),
      'All DVDash',
    );
    await expect(commandCenter(canvasElement)).toHaveValue('mass');
    await expect(canvas.getByText('Page content')).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole('group', { name: 'Experiments' })).toBeVisible(),
    );
    await expect(
      canvas.getByRole('group', { name: 'Instruments' }),
    ).toBeVisible();
    await chooseOption(
      canvas.getByRole('combobox', { name: 'Search scope' }),
      'Experiments',
    );
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await expect(
      canvas.getByText('Page content filtered by “mass”'),
    ).toBeVisible();
  },
};

/** No match, then Clear search; a result type with nothing recent. */
export const EmptyAndNoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.keyboard('{Control>}k{/Control}');
    const types = within(
      canvas.getByRole('group', { name: 'Search result type' }),
    );
    await userEvent.click(types.getByRole('button', { name: 'Routines' }));
    await waitFor(() =>
      expect(canvas.getByText('No recent routines')).toBeVisible(),
    );
    await userEvent.click(types.getByRole('button', { name: 'All' }));
    await userEvent.type(commandCenter(canvasElement), 'argon');
    await expect(canvas.getByText('No results for “argon”')).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent(
      '0 search results.',
    );
    await userEvent.click(
      within(
        canvasElement.querySelector<HTMLElement>('.dv-cmd-empty')!,
      ).getByRole('button', { name: 'Clear search' }),
    );
    await expect(commandCenter(canvasElement)).toHaveValue('');
    await expect(commandCenter(canvasElement)).toHaveFocus();
    await waitFor(() =>
      expect(
        canvas.getByRole('group', { name: 'Suggested actions' }),
      ).toBeVisible(),
    );
    await settleMotion();
  },
};

/** Single keys and "G then" sequences, outside text fields. */
export const PageShortcuts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    canvasElement.querySelector<HTMLElement>('main')!.focus();
    await userEvent.keyboard('gr');
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Routines' }),
    ).toBeVisible();
    // Navigation transfers focus on the next frame before another shortcut can claim it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await userEvent.keyboard('n');
    await expect(args.onNewExperiment).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('/');
    await expect(searchInput(canvasElement)).toHaveFocus();
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await userEvent.keyboard('n');
    await expect(args.onNewExperiment).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Control>},{/Control}');
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeVisible();
  },
};
