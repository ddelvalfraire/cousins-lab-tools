import { describe, expect, it } from 'vitest';
import {
  commands,
  type KeyPress,
  matchShortcut,
  type PageId,
  pages,
  SEQUENCE_MS,
  sequenceHint,
  settings,
  settingsRecords,
  shortcutSectionsFor,
  titleOf,
} from './search-registry';

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  mod: false,
  otherModifier: false,
  inTextField: false,
  ...extra,
});
const keyed = commands.filter((entry) => entry.keys);
const combo = (entry: (typeof commands)[number]) =>
  `${entry.sequence ? 'sequence' : 'chord'} ${entry.keys!.join('+').toLowerCase()}`;

/** Presses a command's keys the way the window's key handler does and returns the command they run. */
function run(keys: readonly string[], sequence = false, inTextField = false) {
  if (keys[0] === 'Mod')
    return matchShortcut(
      commands,
      press(keys[1], { mod: true, inTextField }),
      null,
      0,
    );
  if (!sequence)
    return matchShortcut(commands, press(keys[0], { inTextField }), null, 0);
  const first = matchShortcut(
    commands,
    press(keys[0], { inTextField }),
    null,
    0,
  );
  if (!first || !('sequence' in first)) return first;
  return matchShortcut(
    commands,
    press(keys[1], { inTextField }),
    first.sequence,
    100,
  );
}

describe('search registry: shortcuts', () => {
  it('gives every key combination to one command only', () => {
    const owners = new Map<string, string[]>();
    for (const entry of keyed)
      owners.set(combo(entry), [...(owners.get(combo(entry)) ?? []), entry.id]);
    const clashes = [...owners]
      .filter(([, ids]) => ids.length > 1)
      .map(([keys, ids]) => `${keys}: ${ids.join(', ')}`);
    expect(
      clashes,
      'Give each of these commands its own keys in src/shared/config/search-registry.ts',
    ).toEqual([]);
  });

  it('never uses the first key of a sequence as a shortcut of its own', () => {
    const firsts = new Set(
      keyed
        .filter((entry) => entry.sequence)
        .map((entry) => entry.keys![0].toLowerCase()),
    );
    const shadowed = keyed
      .filter(
        (entry) =>
          !entry.sequence &&
          entry.keys!.length === 1 &&
          firsts.has(entry.keys![0].toLowerCase()),
      )
      .map((entry) => entry.id);
    expect(
      shadowed,
      'These single-key shortcuts start a sequence instead of running; pick another key',
    ).toEqual([]);
  });

  it('runs every command from the keys the shortcuts dialog shows for it', () => {
    for (const entry of keyed)
      expect(
        run(entry.keys!, entry.sequence),
        `${entry.id} (${entry.keys!.join(' ')}) should run from its keys`,
      ).toEqual({ command: entry.id });
  });

  it('lists every command that has keys in the shortcuts dialog, and nothing else', () => {
    const rows = shortcutSectionsFor(commands).flatMap((section) =>
      section.rows.map((row) => `${row.label} ${row.keys.join('+')}`),
    );
    expect(
      [...rows].sort(),
      'Each dialog row must be a command in src/shared/config/search-registry.ts with the same title and keys',
    ).toEqual(
      keyed
        .map(
          (entry) =>
            `${titleOf(entry, { dark: false })} ${entry.keys!.join('+')}`,
        )
        .sort(),
    );
    expect(rows).toHaveLength(keyed.length);
  });

  it('lists only the commands a window can run', () => {
    const titles = shortcutSectionsFor(
      commands.filter((entry) => entry.id !== 'import-recordings'),
    ).flatMap((section) => section.rows.map((row) => row.label));
    expect(titles).not.toContain('Import recordings…');
    expect(titles).toContain('New experiment…');
  });

  it('runs single keys and sequences outside text fields only, and Mod shortcuts anywhere', () => {
    expect(run(['N'], false, true)).toBeNull();
    expect(run(['G', 'E'], true, true)).toBeNull();
    expect(run(['Mod', 'K'], false, true)).toEqual({
      command: 'command-center',
    });
    expect(
      matchShortcut(commands, press('n', { otherModifier: true }), null, 0),
    ).toBeNull();
  });

  it('lets a sequence lapse after its time and matches letters in either case', () => {
    expect(
      matchShortcut(commands, press('e'), { key: 'g', at: 0 }, SEQUENCE_MS + 1),
    ).toBeNull();
    expect(
      matchShortcut(commands, press('E'), { key: 'G', at: 0 }, 10),
    ).toEqual({ command: 'go-experiments' });
    expect(
      matchShortcut(commands, press('i'), { key: 'g', at: 0 }, 10),
    ).toEqual({ command: 'go-instruments' });
    expect(matchShortcut(commands, press('i'), null, 10)).toEqual({
      command: 'import-recordings',
    });
  });

  it('names each page by its title in "Go to" commands and the sequence hint', () => {
    for (const [id, page] of Object.entries(pages) as [
      PageId,
      (typeof pages)[PageId],
    ][]) {
      const command = commands.find((entry) => entry.page === id);
      expect(
        command && titleOf(command, { dark: false }),
        `pages.${id} needs a "Go to" command`,
      ).toBe(`Go to ${page.title}`);
    }
    expect(sequenceHint(commands, 'g')).toBe(
      'Go to: E Experiments, P Presets, R Routines, I Instruments.',
    );
  });
});

describe('search registry: settings', () => {
  const records = settingsRecords({ dark: false, appearance: 'system' });

  it('makes every declared section and field a result titled with its label, under its section', () => {
    for (const [id, section] of Object.entries(settings)) {
      expect(
        records.find((record) => record.id === `settings.${id}`),
        `settings.${id}`,
      ).toMatchObject({
        title: section.label,
        meta: 'Settings',
        target: `settings.${id}`,
      });
      for (const [field, entry] of Object.entries(section.fields))
        expect(
          records.find((record) => record.id === `settings.${id}.${field}`),
          `settings.${id}.${field}`,
        ).toMatchObject({
          title: entry.label,
          meta: `Settings · ${section.label}`,
          page: 'settings',
        });
    }
  });

  it('gives every result its own id', () => {
    const ids = [
      ...records.map((record) => record.id),
      ...commands.map((entry) => entry.id),
    ];
    expect(
      ids.filter((id, i) => ids.indexOf(id) !== i),
      'Rename these registry entries so each id is unique',
    ).toEqual([]);
  });

  it('shows the current theme preference on the Theme result', () => {
    expect(
      records.find((record) => record.id === 'settings.appearance.theme')?.end,
    ).toBe('Match system');
    expect(
      settingsRecords({ dark: true, appearance: 'dark' }).find(
        (record) => record.id === 'settings.appearance.theme',
      )?.end,
    ).toBe('Dark');
  });

  it('lists Text size under Appearance with the current step, findable by the words people use for it', () => {
    const record = settingsRecords({ dark: false, textSize: 'larger' }).find(
      (item) => item.id === 'settings.appearance.textSize',
    );
    expect(record).toMatchObject({
      title: 'Text size',
      meta: 'Settings · Appearance',
      end: 'Larger',
      target: 'settings.appearance.textSize',
    });
    const words = `${record!.title} ${record!.keywords}`
      .toLowerCase()
      .split(/\s+/);
    for (const query of ['text size', 'font size', 'zoom', 'larger text'])
      expect(
        query.split(' ').every((word) => words.includes(word)),
        query,
      ).toBe(true);
  });
});
