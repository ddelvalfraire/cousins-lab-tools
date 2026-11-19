import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  appearanceTitle,
  type CommandId,
  commands,
  type PageId,
  pages,
  settingsRecords,
  titleOf,
} from '@/shared/config/search-registry';
import { renderScreen } from './screen-story';
import { DVDashWorkspace } from './Workspace';

/*
 * Guards that keep the search registry (src/ui/search-registry.ts) and the screens it describes in step. Each failure
 * says what to add to the registry or to the page.
 */
const meta = {
  title: 'Screens/Search registry',
  component: DVDashWorkspace,
  render: renderScreen,
  parameters: { layout: 'fullscreen', previewWidth: 'viewport' },
  args: { initialPage: 'settings' },
} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

const REGISTRY = 'src/ui/search-registry.ts';
const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim();
/** The visible label of a target box: a section's heading, a field's label or legend, or an action's own text. */
const labelOf = (box: Element) =>
  text(
    box.querySelector(
      ':scope > div > h3, :scope > legend, :scope > label, :scope > span[id], :scope > a, :scope > button',
    ),
  );
const command = (id: CommandId) => commands.find((entry) => entry.id === id)!;
const withoutEllipsis = (title: string) => title.replace(/…$/, '');

async function run(canvasElement: HTMLElement, id: CommandId) {
  const canvas = within(canvasElement),
    title = titleOf(command(id), { dark: false });
  await userEvent.keyboard('{Control>}k{/Control}');
  await userEvent.type(
    canvas.getByRole('combobox', { name: 'Search all DVDash' }),
    title.toLowerCase(),
  );
  await userEvent.click(
    await canvas.findByRole('option', { name: new RegExp(`^${title}`) }),
  );
}

/** Every settings result points at a box on the Settings page, labelled as the result is, and every section and field on the page is searchable. */
export const SettingsMatchThePage: Story = {
  play: async ({ canvasElement }) => {
    const records = settingsRecords({ dark: false });
    for (const record of records) {
      const box = canvasElement.querySelector(
        `[data-search-target="${record.target}"]`,
      );
      await expect(
        box,
        `The search registry has “${record.title}” (${record.target}) but Settings has no box with data-search-target="${record.target}". Add it to the page or remove it from ${REGISTRY}.`,
      ).not.toBeNull();
      await expect(
        labelOf(box!),
        `Settings labels ${record.target} differently from search. Render the label from ${REGISTRY}.`,
      ).toBe(record.title);
    }
    const known = new Set(records.map((record) => record.target));
    const boxes = [
      ...canvasElement.querySelectorAll(
        '.dv-settings-section, .dv-settings-field, .dv-settings-fields > fieldset, .dv-settings-actions',
      ),
    ];
    await expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const id = box.getAttribute('data-search-target') ?? '';
      await expect(
        known.has(id),
        `Settings shows “${labelOf(box)}” but search can't find it. Declare it under settings in ${REGISTRY} and give its box data-search-target={settingTarget(…)}.`,
      ).toBe(true);
    }
    for (const heading of canvasElement.querySelectorAll(
      '.dv-settings-section h3',
    )) {
      await expect(
        known.has(
          heading
            .closest('.dv-settings-section')
            ?.getAttribute('data-search-target') ?? '',
        ),
        `The Settings heading “${text(heading)}” has no search entry. Declare its section in ${REGISTRY}.`,
      ).toBe(true);
    }
  },
};

/** "Go to" commands open the page whose heading is the registry's title. */
export const PageTitlesMatchTheRegistry: Story = {
  args: { initialPage: 'experiments' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const id of Object.keys(pages) as PageId[]) {
      await run(canvasElement, `go-${id}`);
      await expect(
        await canvas.findByRole('heading', { level: 1 }),
        `“Go to ${pages[id].title}” should open a page headed ${pages[id].title}. Change pages.${id}.title in ${REGISTRY} or the page heading.`,
      ).toHaveTextContent(new RegExp(`^${pages[id].title}`));
      // Let navigation finish its focus transfer before opening search again.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  },
};

/** Actions say what their buttons say, ellipsis included; the page and dialog they open drop the ellipsis that marks further input. */
export const ActionTitlesMatchTheScreens: Story = {
  args: { initialPage: 'experiments' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const newTitle = titleOf(command('new-experiment'), { dark: false }),
      importTitle = titleOf(command('import-recordings'), { dark: false });
    const newExperiment = withoutEllipsis(newTitle),
      importRecordings = withoutEllipsis(importTitle);
    await expect(
      canvas.getByRole('button', { name: newTitle }),
      `The Experiments page button should read “${newTitle}”, as the command does`,
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: importTitle }),
      `The Experiments page button should read “${importTitle}”, as the command does`,
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: appearanceTitle({ dark: false }) }),
      'The window bar appearance button and its command share a title',
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', {
        name: titleOf(command('shortcuts'), { dark: false }),
      }),
      'The window bar shortcuts button and its command share a title',
    ).toBeVisible();
    await expect(
      // Testing Library does not map the native search element to its role yet.
      within(canvas.getByLabelText('DVDash search')).getByRole('button', {
        name: new RegExp(
          `^${titleOf(command('command-center'), { dark: false })}`,
        ),
      }),
    ).toBeVisible();
    await run(canvasElement, 'import-recordings');
    await waitFor(() =>
      expect(
        body.getByRole('dialog', { name: importRecordings }),
        `“Import recordings…” should open a dialog titled ${importRecordings}`,
      ).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: importRecordings })).toBeNull(),
    );
    await run(canvasElement, 'new-experiment');
    await expect(
      await canvas.findByRole('heading', { level: 1 }),
      `“New experiment…” should open a page headed ${newExperiment}`,
    ).toHaveTextContent(newExperiment);
  },
};

/** The shortcuts dialog lists every keyed command, with its title and keys, and nothing else. */
export const ShortcutsDialogMatchesTheRegistry: Story = {
  args: { initialPage: 'experiments' },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    canvasElement.querySelector<HTMLElement>('main')!.focus();
    await userEvent.keyboard('?');
    const dialog = await body.findByRole('dialog', {
      name: 'Keyboard shortcuts',
    });
    const rows = [...dialog.querySelectorAll('dl > div')].map(
      (row) =>
        `${text(row.querySelector('dt'))}: ${[...row.querySelectorAll('kbd')].map((key) => key.textContent).join(' ')}`,
    );
    const expected = commands
      .filter((entry) => entry.keys)
      .map(
        (entry) =>
          `${titleOf(entry, { dark: false })}: ${entry.keys!.map((key) => (key === 'Mod' ? 'Ctrl' : key)).join(' ')}`,
      );
    await expect(
      [...rows].sort(),
      `Every shortcut needs a command in ${REGISTRY}, and every keyed command a row`,
    ).toEqual([...expected].sort());
  },
};
