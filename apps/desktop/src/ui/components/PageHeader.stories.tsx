import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from '@mantine/core';
import { IconAlertTriangle, IconDeviceFloppy, IconDots, IconFlask, IconHistory, IconLayoutGrid, IconUpload, IconActivity } from '@tabler/icons-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Chip, StatusWord } from './Chip';
import { HeaderButton, PageHeader } from './PageHeader';

const meta = {
  title: 'Components/PageHeader', component: PageHeader, tags: ['autodocs'],
  parameters: { layout: 'fullscreen', previewWidth: 1440 },
  args: { title: 'Experiments', count: 4, breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Experiments' }] },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

const header = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('.dv-page-header')!;

const rect = (root: HTMLElement, selector: string) => header(root).querySelector(selector)!.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Nothing in the header runs past its box, and the title line and the buttons do not overlap. */
const expectFits = async (root: HTMLElement) => {
  for (const el of header(root).querySelectorAll<HTMLElement>('.dv-page-crumbs, .dv-page-title, .dv-page-actions')) await expect(el.scrollWidth, el.className).toBeLessThanOrEqual(el.clientWidth);
  const width = rect(root, '.dv-page-header-title .dv-page-header-width');
  await expect(rect(root, '.dv-page-actions').right).toBeLessThanOrEqual(width.right + .5);
  await expect(overlaps(rect(root, '.dv-page-title-line'), rect(root, '.dv-page-actions'))).toBe(false);
  await expect(overlaps(rect(root, '.dv-page-crumbs'), rect(root, '.dv-page-actions'))).toBe(false);
};
const collectionActions = <><HeaderButton icon={<IconUpload aria-hidden />}>Import recordings…</HeaderButton><HeaderButton variant="primary" icon={<IconFlask aria-hidden />}>New experiment…</HeaderButton></>;

/** Experiments · catalog: a list page with buttons and no meta puts them on the title line, so there is no action bar. */
export const Collection: Story = {
  args: { actions: collectionActions },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Experiments' })).toBeVisible();
    await expect(rect(canvasElement, '.dv-page-header-title').height).toBe(88);
    await expect(header(canvasElement).querySelector('.dv-page-actionbar')).toBeNull();
    // The buttons sit on the title line, centred on it, and end at the content edge.
    const line = rect(canvasElement, '.dv-page-title-line'), actions = rect(canvasElement, '.dv-page-actions');
    await expect(Math.abs((actions.top + actions.bottom) / 2 - (line.top + line.bottom) / 2)).toBeLessThanOrEqual(1);
    await expect(Math.round(actions.right)).toBe(Math.round(rect(canvasElement, '.dv-page-header-title .dv-page-header-width').right));
    await expectFits(canvasElement);
    await expect(canvas.getByText('Experiments', { selector: '[aria-current="page"]' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Workspace' }));
    await expect(args.breadcrumbs![0].onClick).toHaveBeenCalled();
  },
};

/** Below 600 px the buttons drop to their own row, where the action bar would be: 88 px for the title, 48 px for the buttons. */
export const CollectionNarrow: Story = {
  args: { actions: collectionActions },
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const title = rect(canvasElement, '.dv-page-header-title'), actions = rect(canvasElement, '.dv-page-actions'), button = rect(canvasElement, '.dv-page-actions button');
    await expect(title.height).toBe(136);
    // Centred in the 48 px row as in the action bar: 8.5 px under the 31 px buttons.
    await expect(title.bottom - button.bottom).toBeCloseTo(8.5, 0);
    await expect(actions.top).toBeGreaterThanOrEqual(rect(canvasElement, '.dv-page-title-line').bottom);
    await expect(Math.round(rect(canvasElement, '.dv-page-title').top - title.top)).toBe(Math.round(16.5 + 16 + 9));
    await expectFits(canvasElement);
  },
};

/** Largest text, wide: the buttons stay on the title line and nothing overflows or overlaps. */
export const CollectionLargestText: Story = {
  args: { actions: collectionActions },
  globals: { textSize: 'largest' },
  play: async ({ canvasElement }) => {
    await expect(header(canvasElement).querySelector('.dv-page-actionbar')).toBeNull();
    await expect(rect(canvasElement, '.dv-page-actions').top).toBeLessThan(rect(canvasElement, '.dv-page-title-line').bottom);
    await expectFits(canvasElement);
  },
};

/** Largest text at 390 px: the buttons keep their own row, and the breadcrumb and title fit the window. */
export const CollectionNarrowLargestText: Story = {
  args: { actions: collectionActions },
  globals: { textSize: 'largest' },
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    await expect(rect(canvasElement, '.dv-page-actions').top).toBeGreaterThanOrEqual(rect(canvasElement, '.dv-page-title-line').bottom);
    await expect(header(canvasElement).getBoundingClientRect().width).toBeLessThanOrEqual(390);
    await expect(header(canvasElement).scrollWidth).toBeLessThanOrEqual(header(canvasElement).clientWidth);
    await expectFits(canvasElement);
  },
};

/** Preset · details: chips in the meta, primary and overflow buttons. */
export const Detail: Story = {
  args: {
    title: 'CO₂ & O₂ analysis', count: undefined,
    breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Presets', onClick: fn() }, { label: 'CO₂ & O₂ analysis' }],
    meta: <><Chip icon={<IconLayoutGrid aria-hidden />}>10 panels</Chip><Chip icon={<IconHistory aria-hidden />}>R3</Chip></>,
    actions: <><HeaderButton variant="primary" icon={<IconFlask aria-hidden />}>Use preset</HeaderButton><HeaderButton aria-label="More actions" icon={<IconDots aria-hidden />} /></>,
  },
};

/** Experiment · workspace: a sample and a live status in the meta. */
export const Experiment: Story = {
  args: {
    title: 'Leaf respiration', count: undefined,
    breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Experiments', onClick: fn() }, { label: 'Leaf respiration' }],
    meta: <><StatusWord icon={<IconFlask aria-hidden />}>Sample 025</StatusWord><Chip tone="accent" icon={<IconActivity aria-hidden />}>Acquiring</Chip></>,
    actions: <><HeaderButton icon={<IconUpload aria-hidden />}>Export recording</HeaderButton><HeaderButton aria-label="More actions" icon={<IconDots aria-hidden />} /></>,
  },
};

/** Preset · unsaved changes: quiet discard and primary save. */
export const UnsavedChanges: Story = {
  args: {
    title: 'Edit preset', count: undefined,
    breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Presets', onClick: fn() }, { label: 'CO₂ & O₂ analysis', onClick: fn() }, { label: 'Edit' }],
    meta: <><Chip icon={<IconHistory aria-hidden />}>R3</Chip><StatusWord tone="warning" icon={<IconAlertTriangle aria-hidden />}>Unsaved changes</StatusWord></>,
    actions: <><HeaderButton>Discard changes</HeaderButton><HeaderButton variant="primary" icon={<IconDeviceFloppy aria-hidden />}>Save revision</HeaderButton></>,
  },
};

/** A long title stays on one line and truncates, with the full name in its tooltip. */
export const LongTitle: Story = {
  args: {
    title: 'Réponse du dioxyde de carbone pendant les variations de température et de concentration', count: undefined,
    breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Experiments', onClick: fn() }, { label: 'Réponse du dioxyde de carbone pendant les variations de température et de concentration' }],
    meta: <StatusWord icon={<IconFlask aria-hidden />}>Sample 025</StatusWord>,
    actions: <HeaderButton icon={<IconUpload aria-hidden />}>Export recording</HeaderButton>,
  },
  play: async ({ canvasElement }) => {
    const title = header(canvasElement).querySelector<HTMLElement>('.dv-page-title')!;
    await expect(title.getBoundingClientRect().height).toBe(30);
    await expect(title).toHaveAttribute('title', title.textContent!);
  },
};

/** Page tabs sit below the action bar. */
export const WithTabs: Story = {
  args: { title: 'CO₂ & O₂ analysis', count: undefined, parent: 'Presets', onBack: fn(), breadcrumbs: undefined },
  render: args => <Tabs defaultValue="overview"><PageHeader {...args} navigation={<Tabs.List><Tabs.Tab value="overview">Overview</Tabs.Tab><Tabs.Tab value="layout">Layout preview</Tabs.Tab><Tabs.Tab value="revisions">Revisions</Tabs.Tab></Tabs.List>} /><Tabs.Panel value="overview" p="lg">Preset details</Tabs.Panel><Tabs.Panel value="layout" p="lg">Panel arrangement</Tabs.Panel><Tabs.Panel value="revisions" p="lg">Saved revisions</Tabs.Panel></Tabs>,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Layout preview' }));
    await expect(canvas.getByText('Panel arrangement')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Presets' }));
    await expect(args.onBack).toHaveBeenCalled();
  },
};

/** Narrow window: smaller title and buttons; the action bar wraps instead of overflowing. */
export const Narrow: Story = {
  ...UnsavedChanges,
  parameters: { previewWidth: 390 },
};

/** Settings in a narrow window: the description stays in the action bar, so the bar is never empty. */
export const NarrowDescription: Story = {
  args: {
    title: 'Settings', count: undefined,
    breadcrumbs: [{ label: 'Workspace', onClick: fn() }, { label: 'Settings' }],
    description: 'Applies to everyone using DVDash on this computer.',
  },
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const description = canvas.getByText('Applies to everyone using DVDash on this computer.');
    await expect(description).toBeVisible();
    await expect(description.scrollWidth).toBeLessThanOrEqual(description.clientWidth);
    await expect(header(canvasElement).querySelector('.dv-page-actionbar')!.getBoundingClientRect().height).toBe(48);
  },
};
