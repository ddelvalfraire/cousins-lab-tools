/*
 * Everything the window bar's search finds besides catalog records, and every keyboard shortcut. The command center
 * rows, the keyboard shortcuts dialog and the window-wide key handler are all built from these lists, so a label or a
 * key is written once.
 *
 * How to add a searchable thing:
 * - A page: add it to `pages`. Its title is the page heading, and its "Go to" command comes from `pageCommands`.
 * - An action: add it to `commands`, then give it a handler in ScreenShell (the handler map is typed by command id, so
 *   a missing one fails the type check). Keys put it in the shortcuts dialog and the key handler as well.
 * - A setting: add a field to its section in `settings`, then render the field on the Settings page with
 *   `data-search-target={settingTarget(section, field)}` on its box and its label from here. It is then searchable,
 *   and choosing it scrolls to the field, focuses it and highlights it. A new section works the same way.
 * - Catalog records (experiments, presets, routines, instruments) come from data, not from here.
 *
 * search-registry.test.ts and the Screens/Search registry stories fail with what to add when the lists and the pages
 * drift apart.
 */

import type { AppearancePreference } from '@/shared/theme/appearance';
import type { TextSize } from '@/shared/theme/textSize';
import type { CommandGlyphName } from '@/ui/components/CommandCenter';

/** What a title or detail may depend on. */
export interface SearchContext {
  dark: boolean;
  appearance?: AppearancePreference;
  textSize?: TextSize;
}

export type PageId =
  | 'experiments'
  | 'presets'
  | 'routines'
  | 'instruments'
  | 'settings';
export interface PageEntry {
  title: string;
  glyph: CommandGlyphName;
  keys: readonly string[];
  sequence?: boolean;
  keywords?: string;
}

/** Top-level pages. `title` is the page's own heading. */
export const pages: Readonly<Record<PageId, PageEntry>> = {
  experiments: {
    title: 'Experiments',
    glyph: 'experiment',
    keys: ['G', 'E'],
    sequence: true,
  },
  presets: {
    title: 'Presets',
    glyph: 'preset',
    keys: ['G', 'P'],
    sequence: true,
  },
  routines: {
    title: 'Routines',
    glyph: 'routine',
    keys: ['G', 'R'],
    sequence: true,
  },
  instruments: {
    title: 'Instruments',
    glyph: 'instrument',
    keys: ['G', 'I'],
    sequence: true,
  },
  settings: {
    title: 'Settings',
    glyph: 'settings',
    keys: ['Mod', ','],
    keywords: 'preferences configuration',
  },
};

/** Headings of the keyboard shortcuts dialog, in order. */
export const shortcutGroups = {
  search: 'Search and settings',
  actions: 'Common actions',
  pages: 'Go to a page',
} as const;
export type ShortcutGroup = keyof typeof shortcutGroups;

export interface CommandEntry<Id extends string = string> {
  id: Id;
  title: string | ((context: SearchContext) => string);
  glyph: CommandGlyphName | ((context: SearchContext) => CommandGlyphName);
  /** Shortcut keys. `Mod` is ⌘ on macOS and Ctrl elsewhere. */
  keys?: readonly string[];
  /** The keys are pressed one after the other (G then E). */
  sequence?: boolean;
  keywords?: string;
  /** Listed before anything is typed. */
  featured?: boolean;
  /** A shortcut only, with no command center row (the search box itself, for example). */
  inSearch?: false;
  /** Where the shortcuts dialog lists it. Commands without keys are not listed. */
  group: ShortcutGroup;
  /** The page a "Go to" command opens. */
  page?: PageId;
}

/** "Use dark appearance": the window bar's appearance button says the same. */
export const appearanceTitle = ({ dark }: SearchContext) =>
  `Use ${dark ? 'light' : 'dark'} appearance`;

/** The page's "Go to" command, so its wording always follows the page title. */
const goTo = <P extends PageId>(page: P): CommandEntry<`go-${P}`> => ({
  id: `go-${page}`,
  title: `Go to ${pages[page].title}`,
  glyph: pages[page].glyph,
  keys: pages[page].keys,
  sequence: pages[page].sequence,
  keywords: `go navigation ${pages[page].keywords ?? ''}`.trim(),
  group: page === 'settings' ? 'search' : 'pages',
  page,
});

const commandList = [
  {
    id: 'new-experiment',
    title: 'New experiment…',
    glyph: 'experiment',
    keys: ['N'],
    featured: true,
    keywords: 'create new experiment setup',
    group: 'actions',
  },
  {
    id: 'import-recordings',
    title: 'Import recordings…',
    glyph: 'import',
    keys: ['I'],
    featured: true,
    keywords: 'open file csv import recording data',
    group: 'actions',
  },
  {
    id: 'command-center',
    title: 'Open command center',
    glyph: 'keyboard',
    keys: ['Mod', 'K'],
    inSearch: false,
    group: 'search',
  },
  {
    id: 'filter-page',
    title: 'Filter this page',
    glyph: 'keyboard',
    keys: ['/'],
    inSearch: false,
    group: 'search',
  },
  goTo('settings'),
  {
    id: 'shortcuts',
    title: 'Show keyboard shortcuts',
    glyph: 'keyboard',
    keys: ['?'],
    keywords: 'help keyboard shortcuts hotkeys commands',
    group: 'search',
  },
  {
    id: 'appearance',
    title: appearanceTitle,
    glyph: ({ dark }) => (dark ? 'sun' : 'moon'),
    keywords: 'light dark mode theme appearance colors',
    group: 'actions',
  },
  goTo('experiments'),
  goTo('presets'),
  goTo('routines'),
  goTo('instruments'),
] as const satisfies readonly CommandEntry[];

export type CommandId = (typeof commandList)[number]['id'];
/** Every command, in the order search lists them. */
export const commands: readonly CommandEntry<CommandId>[] = commandList;

export const titleOf = (
  entry: Pick<CommandEntry, 'title'>,
  context: SearchContext,
) => (typeof entry.title === 'function' ? entry.title(context) : entry.title);
export const glyphOf = (
  entry: Pick<CommandEntry, 'glyph'>,
  context: SearchContext,
) => (typeof entry.glyph === 'function' ? entry.glyph(context) : entry.glyph);

export interface ShortcutRow {
  label: string;
  keys: readonly string[];
  sequence?: boolean;
}
export interface ShortcutSection {
  title: string;
  rows: readonly ShortcutRow[];
}

/** The shortcuts dialog's sections: every given command that has keys, under its group. */
export function shortcutSectionsFor(
  entries: readonly CommandEntry[],
  context: SearchContext = { dark: false },
): ShortcutSection[] {
  return (Object.keys(shortcutGroups) as ShortcutGroup[])
    .map((group) => ({
      title: shortcutGroups[group],
      rows: entries
        .filter((entry) => entry.group === group && entry.keys)
        .map((entry) => ({
          label: titleOf(entry, context),
          keys: entry.keys!,
          sequence: entry.sequence,
        })),
    }))
    .filter((section) => section.rows.length > 0);
}

/** A key press as the shortcut handler sees it. */
export interface KeyPress {
  key: string;
  /** ⌘ or Ctrl, without Alt. */
  mod: boolean;
  /** Alt, AltGraph or a lone ⌘/Ctrl that is not a Mod shortcut: such presses never run single-key shortcuts. */
  otherModifier: boolean;
  /** The focus is in a text field, where only Mod shortcuts run. */
  inTextField: boolean;
}
/** The first key of a sequence and when it was pressed. */
export interface SequenceStart {
  key: string;
  at: number;
}
export type ShortcutMatch =
  | { command: string }
  | { sequence: SequenceStart }
  | null;

/** How long the second key of a sequence may follow the first. */
export const SEQUENCE_MS = 1200;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Which command a key press runs. Mod shortcuts run anywhere; single keys and sequences only outside text fields.
 * Returns the start of a sequence when the key begins one, so the caller can keep it for the next press.
 */
export function matchShortcut(
  entries: readonly CommandEntry[],
  press: KeyPress,
  started: SequenceStart | null,
  now: number,
): ShortcutMatch {
  const keyed = entries.filter((entry) => entry.keys?.length);
  if (press.mod) {
    const hit = keyed.find(
      (entry) =>
        entry.keys!.length === 2 &&
        entry.keys![0] === 'Mod' &&
        same(entry.keys![1], press.key),
    );
    return hit ? { command: hit.id } : null;
  }
  if (press.inTextField || press.otherModifier) return null;
  if (started && now - started.at < SEQUENCE_MS) {
    const hit = keyed.find(
      (entry) =>
        entry.sequence &&
        same(entry.keys![0], started.key) &&
        same(entry.keys![1], press.key),
    );
    if (hit) return { command: hit.id };
  }
  if (keyed.some((entry) => entry.sequence && same(entry.keys![0], press.key)))
    return { sequence: { key: press.key, at: now } };
  const hit = keyed.find(
    (entry) =>
      !entry.sequence &&
      entry.keys!.length === 1 &&
      same(entry.keys![0], press.key),
  );
  return hit ? { command: hit.id } : null;
}

/** What the live region says after the first key of a sequence: "Go to: E Experiments, P Presets, …". */
export function sequenceHint(entries: readonly CommandEntry[], first: string) {
  const next = entries.filter(
    (entry) => entry.sequence && entry.keys && same(entry.keys[0], first),
  );
  return `Go to: ${next.map((entry) => `${entry.keys![1]} ${entry.page ? pages[entry.page].title : titleOf(entry, { dark: false })}`).join(', ')}.`;
}

/** The Settings page's theme choices, also the Theme result's current value. */
export const themeOptions: readonly {
  value: AppearancePreference;
  label: string;
}[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
/** The Settings page's text size steps, smallest first, also the Text size result's current value. */
export const textSizeOptions: readonly { value: TextSize; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
  { value: 'largest', label: 'Largest' },
];

export interface SettingField {
  /** The field's label on the page. */
  label: string;
  keywords?: string;
  /** Listed under Settings before anything is typed. */
  featured?: boolean;
  /** The setting's current value, shown at the end of its row. */
  value?: (context: SearchContext) => string | undefined;
}
export interface SettingsSectionEntry {
  label: string;
  description: string;
  glyph: CommandGlyphName;
  keywords?: string;
  fields: Readonly<Record<string, SettingField>>;
}

/** The Settings page's sections, in page order, and the fields in each. The page renders its headings and labels from here. */
export const settings = {
  appearance: {
    label: 'Appearance',
    description: 'How DVDash looks.',
    glyph: 'sun',
    keywords: 'display look',
    fields: {
      theme: {
        label: 'Theme',
        keywords: 'light dark mode match system colours colors',
        featured: true,
        value: ({ appearance }) =>
          themeOptions.find((option) => option.value === appearance)?.label,
      },
      textSize: {
        label: 'Text size',
        keywords:
          'font size larger text bigger smaller zoom scale type readability accessibility',
        value: ({ textSize }) =>
          textSizeOptions.find((option) => option.value === textSize)?.label,
      },
    },
  },
  numbers: {
    label: 'Numbers',
    description:
      'How values are shown on screen and written to exported files.',
    glyph: 'settings',
    keywords: 'number format',
    fields: {
      decimal: {
        label: 'Decimal separator',
        keywords: 'decimal marker point comma locale',
      },
    },
  },
  recordings: {
    label: 'Recordings',
    description: 'Where new recordings are saved.',
    glyph: 'storage',
    keywords: 'data storage files local device',
    fields: {
      folder: {
        label: 'Recordings folder',
        keywords: 'folder location path directory save storage files',
        featured: true,
      },
    },
  },
  export: {
    label: 'Export',
    description:
      'Defaults for exported data files. You can still change them when exporting.',
    glyph: 'settings',
    keywords: 'csv spreadsheet data files',
    fields: {
      delimiter: {
        label: 'Column separator in CSV files',
        keywords: 'csv delimiter comma semicolon tab spreadsheet',
      },
    },
  },
  about: {
    label: 'About',
    description: 'Include these details when reporting a problem.',
    glyph: 'settings',
    keywords:
      'version commit release build platform runtime logs settings file',
    fields: {
      report: {
        label: 'Report a problem',
        keywords: 'bug issue feedback github',
      },
    },
  },
} as const satisfies Record<string, SettingsSectionEntry>;

export type SettingsSectionId = keyof typeof settings;
export type SettingFieldId<S extends SettingsSectionId> =
  keyof (typeof settings)[S]['fields'] & string;

/** The id of a section or field on the Settings page: its `data-search-target` and its search result's target. */
export const settingTarget = <S extends SettingsSectionId>(
  section: S,
  field?: SettingFieldId<S>,
) => (field ? `settings.${section}.${field}` : `settings.${section}`);

/** A search result that opens a page at a place on it. */
export interface TargetRecord {
  id: string;
  title: string;
  meta: string;
  keywords?: string;
  glyph: CommandGlyphName;
  featured?: boolean;
  end?: string;
  page: PageId;
  target: string;
}

/** Settings results: each section ("Numbers", under "Settings") and each field ("Decimal separator", under "Settings · Numbers"). */
export function settingsRecords(context: SearchContext): TargetRecord[] {
  return (
    Object.entries(settings) as [SettingsSectionId, SettingsSectionEntry][]
  ).flatMap(([id, section]) => [
    {
      id: settingTarget(id),
      title: section.label,
      meta: pages.settings.title,
      keywords: `${section.description} ${section.keywords ?? ''}`.trim(),
      glyph: section.glyph,
      page: 'settings' as const,
      target: settingTarget(id),
    },
    ...Object.entries(section.fields).map(([field, entry]) => ({
      id: `settings.${id}.${field}`,
      title: entry.label,
      meta: `${pages.settings.title} · ${section.label}`,
      keywords: entry.keywords,
      glyph: section.glyph,
      featured: entry.featured,
      end: entry.value?.(context),
      page: 'settings' as const,
      target: `settings.${id}.${field}`,
    })),
  ]);
}

/** What the live region says when search opens a place: "Decimal separator, Settings, Numbers." */
export function describeTarget(target: string) {
  const record = settingsRecords({ dark: false }).find(
    (item) => item.target === target,
  );
  return record
    ? `${record.title}, ${record.meta.split(' · ').join(', ')}.`
    : '';
}
