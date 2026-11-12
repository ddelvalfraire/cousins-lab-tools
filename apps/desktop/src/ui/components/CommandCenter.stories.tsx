import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CommandCenter, CommandGlyph, findCommands, type CommandCategory, type CommandItem } from './CommandCenter';
import { StatusWord } from './Chip';
import { ReviewIcon } from './ReviewIcons';

/** Sample rows from command-center-review.html. */
const items: CommandItem[] = [
  { id: 'new', kind: 'actions', title: 'New experiment…', icon: <CommandGlyph name="experiment" />, keys: ['N'], featured: true, keywords: 'create new experiment setup' },
  { id: 'import', kind: 'actions', title: 'Import recordings…', icon: <CommandGlyph name="import" />, keys: ['I'], featured: true, keywords: 'open file csv import recording data' },
  { id: 'go-presets', kind: 'actions', title: 'Go to presets', icon: <CommandGlyph name="preset" />, keys: ['G', 'P'], sequence: true, keywords: 'go navigation' },
  { id: 'appearance', kind: 'settings', title: 'Appearance', icon: <CommandGlyph name="sun" />, end: 'Light', keywords: 'settings preferences display light dark mode theme' },
  { id: 'shortcuts', kind: 'settings', title: 'Keyboard shortcuts', icon: <CommandGlyph name="keyboard" />, keys: ['?'], keywords: 'settings help keyboard shortcuts hotkeys commands' },
  { id: 'exp025', kind: 'experiments', title: 'Leaf respiration', meta: 'Sample 025 · CO₂ & O₂ analysis', icon: <CommandGlyph name="experiment" />, end: <StatusWord tone="accent" icon={<ReviewIcon name="signals" />}>Running</StatusWord>, keywords: 'mass 44 mass 45 MS-01', recent: true },
  { id: 'exp021', kind: 'experiments', title: 'Réponse du dioxyde de carbone pendant la variation de température', meta: 'Échantillon 021 · CO₂ & O₂ analysis', icon: <CommandGlyph name="experiment" />, keywords: 'carbon dioxide mass 44' },
  { id: 'preco2', kind: 'presets', title: 'CO₂ & O₂ analysis', meta: '10 panels · Gas signals and derived values', icon: <CommandGlyph name="preset" />, end: <><CommandGlyph name="history" />R3</>, keywords: 'mass 44 mass 45 leaf respiration' },
  { id: 'ms01', kind: 'instruments', title: 'MS-01', meta: 'Mass spectrometer · 6 signals', icon: <CommandGlyph name="instrument" />, keywords: 'mass 44 mass 45 gas' },
];

function CommandCenterExample({ query, initialCategory = 'all', onSelect, onClearQuery, onShortcuts }: { query: string; initialCategory?: CommandCategory; onSelect: (item: CommandItem) => void; onClearQuery: () => void; onShortcuts: () => void }) {
  const [category, setCategory] = useState<CommandCategory>(initialCategory), [active, setActive] = useState(0);
  return <div style={{ position: 'relative', maxWidth: 580, height: 560 }}>
    <CommandCenter listId="story-results" groups={findCommands(items, query, category)} query={query} category={category}
      onCategoryChange={next => { setCategory(next); setActive(0); }} activeIndex={active} onActiveIndexChange={setActive}
      onSelect={onSelect} onClearQuery={onClearQuery} onShortcuts={onShortcuts} mac={false} />
  </div>;
}

const meta = {
  title: 'Components/CommandCenter',
  component: CommandCenterExample,
  args: { query: '', onSelect: fn(), onClearQuery: fn(), onShortcuts: fn() },
  parameters: { previewWidth: 720 },
} satisfies Meta<typeof CommandCenterExample>;
export default meta;
type Story = StoryObj<typeof meta>;

const groupNames = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll('[role=listbox] [role=group]')].map(group => group.getAttribute('aria-label'));

/** Nothing typed: suggested actions, every setting and recent records. */
export const Suggested: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(groupNames(canvasElement)).toEqual(['Suggested actions', 'Settings', 'Recent · Experiments']);
    await expect(canvas.getByRole('option', { name: /New experiment/ })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.queryByRole('option', { name: /Go to presets/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /Shortcuts/ }));
    await expect(args.onShortcuts).toHaveBeenCalled();
  },
};

/** A typed query searches every catalog. The group with the closest match comes first: “Mass spectrometer” is closer than a keyword. */
export const Results: Story = {
  args: { query: 'mass' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(groupNames(canvasElement)).toEqual(['Instruments', 'Experiments', 'Presets']);
    await userEvent.click(canvas.getByRole('button', { name: 'Presets' }));
    await expect(canvas.getByRole('button', { name: 'Presets' })).toHaveAttribute('aria-pressed', 'true');
    await expect(groupNames(canvasElement)).toEqual(['Presets']);
    await userEvent.click(canvas.getByRole('option', { name: /CO₂ & O₂ analysis/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'preco2' }));
  },
};

export const AccentInsensitive: Story = {
  args: { query: 'temperature' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('option', { name: /Réponse du dioxyde/ })).toBeVisible();
  },
};

export const NoResults: Story = {
  args: { query: 'argon' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No results for “argon”')).toBeVisible();
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }));
    await expect(args.onClearQuery).toHaveBeenCalled();
  },
};

/** A result type with nothing recent, before anything is typed. */
export const NoRecent: Story = {
  args: { initialCategory: 'presets' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No recent presets')).toBeVisible();
    await expect(canvas.getByText('Type to search the catalogs on this device.')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Clear search' })).toBeNull();
  },
};
