import { Kbd } from '@mantine/core';
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';
import { keyedBy } from './keyedBy';
import './Approved.css';
import './CommandCenter.css';
import { MotionList } from './Motion';
import { ScrollFrame } from './ScrollFrame';

/*
 * The command center: the results list under the window bar's search box when it searches All DVDash.
 * Structure, copy and values from design/dvdash-field-review/command-library-review.html
 * (rows, keycaps, groups) and command-center-review.html (commands, settings, empty states).
 */

export type CommandGroupKind =
  | 'actions'
  | 'settings'
  | 'experiments'
  | 'presets'
  | 'routines'
  | 'instruments';
export type CommandCategory = 'all' | CommandGroupKind;

export interface CommandItem {
  id: string;
  kind: CommandGroupKind;
  title: string;
  /** Second line for catalog records. Commands have none. */
  meta?: string;
  /** Other words that find this item, such as signals or instrument names. */
  keywords?: string;
  icon: ReactNode;
  /** Right-hand detail: a status, a revision or a setting's current value. */
  end?: ReactNode;
  /** Shortcut keys. `Mod` is ⌘ on macOS and Ctrl elsewhere. */
  keys?: readonly string[];
  /** The keys are pressed one after the other (G then E). */
  sequence?: boolean;
  /** An action or setting listed before anything is typed. Every one is listed under its own result type. */
  featured?: boolean;
  /** A catalog record listed under Recent before anything is typed. */
  recent?: boolean;
}

export interface CommandGroup<T extends CommandItem = CommandItem> {
  kind: CommandGroupKind;
  label: string;
  items: T[];
}

export const commandGroupOrder: readonly CommandGroupKind[] = [
  'actions',
  'settings',
  'experiments',
  'presets',
  'routines',
  'instruments',
];
const groupLabel: Record<CommandGroupKind, string> = {
  actions: 'Actions',
  settings: 'Settings',
  experiments: 'Experiments',
  presets: 'Presets',
  routines: 'Routines',
  instruments: 'Instruments',
};

/** Case- and accent-insensitive form, so "temperature" finds "température". */
export const normalizeSearch = (text: string) =>
  text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();

/** Every word of the query appears somewhere in the title, second line or keywords. */
export function matchesSearch(
  item: Pick<CommandItem, 'title' | 'meta' | 'keywords'>,
  query: string,
) {
  const haystack = normalizeSearch(
    [item.title, item.meta, item.keywords].filter(Boolean).join(' '),
  );
  return normalizeSearch(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Groups to show for a query and result type. Before anything is typed: suggested actions and settings, and recent
 * records. Once typed, the group holding the closest title match comes first.
 */
export function findCommands<T extends CommandItem>(
  items: readonly T[],
  query: string,
  category: CommandCategory = 'all',
): CommandGroup<T>[] {
  const q = normalizeSearch(query).trim();
  let found = items.filter(
    (item) =>
      (category === 'all' || item.kind === category) &&
      matchesSearch(item, query),
  );
  if (!q)
    found = found.filter((item) =>
      item.kind === 'actions' || item.kind === 'settings'
        ? category !== 'all' || !!item.featured
        : !!item.recent,
    );
  const closeness = (item: CommandItem) => {
    const title = normalizeSearch(item.title);
    return title === q
      ? 0
      : title.startsWith(q)
        ? 1
        : title.includes(q)
          ? 2
          : normalizeSearch(item.meta ?? '').includes(q)
            ? 3
            : 4;
  };
  const best = (kind: CommandGroupKind) =>
    Math.min(
      Infinity,
      ...found.filter((item) => item.kind === kind).map(closeness),
    );
  const order = q
    ? [...commandGroupOrder].sort((a, b) => best(a) - best(b))
    : commandGroupOrder;
  return order
    .map((kind) => ({
      kind,
      items: found.filter((item) => item.kind === kind),
      label:
        kind === 'actions'
          ? !q && category === 'all'
            ? 'Suggested actions'
            : 'Actions'
          : kind === 'settings'
            ? 'Settings'
            : `${q ? '' : 'Recent · '}${groupLabel[kind]}`,
    }))
    .filter((group) => group.items.length > 0);
}

/** Mantine keycaps for a shortcut, with "then" between the keys of a sequence. */
export function KeyCaps({
  keys,
  sequence = false,
  mac,
  size = 'sm',
}: {
  keys: readonly string[];
  sequence?: boolean;
  mac: boolean;
  size?: 'xs' | 'sm';
}) {
  return (
    <span className="dv-keycaps">
      {keyedBy(keys, (key) => key).map(({ key: id, item: key, index }) => (
        <Fragment key={id}>
          {sequence && index > 0 && (
            <span className="dv-keycaps-then">then</span>
          )}
          <Kbd size={size}>{key === 'Mod' ? (mac ? '⌘' : 'Ctrl') : key}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

/** The DOM id of a result row, for the search input's aria-activedescendant. */
export const commandOptionId = (listId: string, item: CommandItem) =>
  `${listId}-${item.id}`;

const glyphPaths = {
  experiment: <path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10" />,
  preset: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 10h18M10 10v11" />
    </>
  ),
  routine: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6a3 3 0 0 1 3 3v6M6 9v9h9" />
    </>
  ),
  instrument: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h4m-4 5h.01m4 0h.01m4 0h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="18" r="2" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8" />
    </>
  ),
  import: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" />
    </>
  ),
  storage: (
    <>
      <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
      <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
      <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
    </>
  ),
  history: <path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l3 2" />,
  moon: <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
};
export type CommandGlyphName = keyof typeof glyphPaths;
/** Row icons from the command center mockups (24 px grid, 1.7 stroke). */
export function CommandGlyph({ name }: { name: CommandGlyphName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphPaths[name]}
    </svg>
  );
}

const searchGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export interface CommandCenterProps {
  /** Id of the results listbox; the search input points at it with aria-controls. */
  listId: string;
  groups: readonly CommandGroup[];
  query: string;
  category: CommandCategory;
  onCategoryChange: (category: CommandCategory) => void;
  /** Index of the highlighted row across all groups. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: CommandItem) => void;
  onClearQuery: () => void;
  onShortcuts: () => void;
  mac: boolean;
}

/**
 * Results under the search box. Focus stays in the search input: arrow keys move the highlight
 * (aria-activedescendant) and Enter runs it, so rows are options rather than tab stops.
 */
export function CommandCenter({
  listId,
  groups,
  query,
  category,
  onCategoryChange,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onClearQuery,
  onShortcuts,
  mac,
}: CommandCenterProps) {
  const typed = query.trim() !== '';
  const typesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = typesRef.current;
    if (!row) return;
    // In a narrow window the tabs scroll sideways, which a plain mouse wheel cannot do on its own.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const step =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? row.clientWidth
            : 1;
      const max = row.scrollWidth - row.clientWidth;
      const next = Math.min(
        max,
        Math.max(0, row.scrollLeft + event.deltaY * step),
      );
      if (max <= 0 || next === row.scrollLeft) return;
      event.preventDefault();
      row.scrollLeft = next;
    };
    row.addEventListener('wheel', onWheel, { passive: false });
    return () => row.removeEventListener('wheel', onWheel);
  }, []);
  let index = 0;
  const itemsByOptionId = new Map(
    groups.flatMap((group) =>
      group.items.map((item) => [commandOptionId(listId, item), item] as const),
    ),
  );
  // Options never take focus (the input keeps it and picks with Enter), so their clicks are handled here.
  const selectClickedOption = (event: MouseEvent<HTMLDivElement>) => {
    const option = (event.target as Element).closest('[role="option"]');
    const item = option && itemsByOptionId.get(option.id);
    if (item) onSelect(item);
  };
  // Every click in the results keeps focus in the search input. Safari and Firefox on macOS don't focus a clicked
  // button, so without this the input blurs to nothing and the popup closes before the click lands.
  return (
    <div
      className="dv-cmd"
      role="none"
      onMouseDown={(event) => event.preventDefault()}
      onClick={selectClickedOption}
    >
      <ScrollFrame
        axes="x"
        contentClassName="dv-cmd-types-list"
        className="dv-cmd-types"
        ref={typesRef}
        role="group"
        aria-label="Search result type"
      >
        {(['all', ...commandGroupOrder] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={category === type}
            onClick={() => onCategoryChange(type)}
          >
            {type === 'all' ? 'All' : groupLabel[type]}
          </button>
        ))}
      </ScrollFrame>
      <ScrollFrame axes="y" overscroll="contain" className="dv-cmd-body">
        {groups.length === 0 && (
          <div className="dv-cmd-empty">
            {searchGlyph}
            <p className="dv-cmd-empty-title">
              {typed
                ? `No results for “${query}”`
                : category === 'all'
                  ? 'No recent items'
                  : `No recent ${groupLabel[category].toLowerCase()}`}
            </p>
            <p>
              {typed
                ? 'Try a name, sample, signal or instrument.'
                : 'Type to search the catalogs on this device.'}
            </p>
            {typed && (
              <button
                type="button"
                className="dv-cmd-plain"
                onClick={onClearQuery}
              >
                Clear search
              </button>
            )}
          </div>
        )}
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          aria-hidden={groups.length === 0 || undefined}
        >
          <MotionList>
            {groups.map((group) => (
              <fieldset
                key={group.kind}
                aria-label={group.label}
                className="dv-cmd-group"
              >
                <div className="dv-cmd-group-label" aria-hidden="true">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const i = index++,
                    command =
                      item.kind === 'actions' || item.kind === 'settings';
                  return (
                    <div
                      key={item.id}
                      id={commandOptionId(listId, item)}
                      role="option"
                      aria-selected={i === activeIndex}
                      tabIndex={-1}
                      className="dv-cmd-row"
                      data-command={command || undefined}
                      onMouseMove={() => {
                        if (i !== activeIndex) onActiveIndexChange(i);
                      }}
                    >
                      <span className="dv-cmd-row-icon">{item.icon}</span>
                      <span className="dv-cmd-row-copy">
                        <span className="dv-cmd-row-title">{item.title}</span>
                        {item.meta && (
                          <span className="dv-cmd-row-meta">{item.meta}</span>
                        )}
                      </span>
                      {(item.keys || item.end) && (
                        <span className="dv-cmd-row-end">
                          {item.keys ? (
                            <KeyCaps
                              keys={item.keys}
                              sequence={item.sequence}
                              mac={mac}
                            />
                          ) : (
                            item.end
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </MotionList>
        </div>
      </ScrollFrame>
      <div className="dv-cmd-footer">
        <button type="button" onClick={onShortcuts}>
          Shortcuts <span aria-hidden="true">?</span>
        </button>
        <span aria-hidden="true">↑ ↓ navigate · ↵ select · Esc close</span>
      </div>
    </div>
  );
}
