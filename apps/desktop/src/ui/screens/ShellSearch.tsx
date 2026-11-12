import { useEffect, useId, useImperativeHandle, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { CommandCenter, KeyCaps, commandOptionId, findCommands, type CommandCategory, type CommandItem } from '../components/CommandCenter';

/** A command center row and what choosing it does. */
export type ShellCommand = CommandItem & { run: () => void };
export interface ShellSearchHandle {
  /** ⌘K / Ctrl+K: search All DVDash from an empty query. Escape returns focus to where it was. */
  openCommandCenter: () => void;
  /** "/": focus the search box on this page's own filter, or on All DVDash where the page has none. */
  focusPageSearch: () => void;
}
type Scope = 'page' | 'all';

export interface ShellSearchProps {
  ref?: Ref<ShellSearchHandle>;
  /** The page's scope option, such as "Experiments" or "This preset". */
  pageLabel: string;
  pagePlaceholder: string;
  /** The page's filter text. A page without onPageQueryChange has no filter, so its scope option is disabled. */
  pageQuery?: string;
  onPageQueryChange?: (query: string) => void;
  commands: readonly ShellCommand[];
  mac: boolean;
  onShortcuts: () => void;
  onAnnounce: (message: string) => void;
}

const glyph = (path: ReactNode) => <svg className="dv-shell-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{path}</svg>;

/**
 * The window bar's unified search (unified-search-review.html): one box, two scopes. The page scope filters the
 * page through its query; All DVDash opens the command center (command-library-review.html) under the box.
 */
export function ShellSearch({ ref, pageLabel, pagePlaceholder, pageQuery = '', onPageQueryChange, commands, mac, onShortcuts, onAnnounce }: ShellSearchProps) {
  const filterable = !!onPageQueryChange;
  const [scope, setScope] = useState<Scope>(filterable ? 'page' : 'all');
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CommandCategory>('all'), [active, setActive] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const quietFocus = useRef(false);
  const listId = useId();
  const all = scope === 'all', value = all ? query : pageQuery;
  const groups = all ? findCommands(commands, query, category) : [];
  const results = groups.flatMap(group => group.items), current = results[Math.min(active, results.length - 1)];

  /** Focus the input without opening the results. */
  const focusQuietly = () => { quietFocus.current = true; inputRef.current?.focus(); quietFocus.current = false; };
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus && returnFocus.current?.isConnected) returnFocus.current.focus();
    returnFocus.current = null;
  };
  // flushSync: the input's focus handler must see the new scope.
  const openCommandCenter = () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !anchorRef.current?.contains(focused)) returnFocus.current = focused;
    flushSync(() => { setScope('all'); setQuery(''); setCategory('all'); setActive(0); setOpen(true); });
    onPageQueryChange?.('');
    inputRef.current?.focus();
  };
  const focusPageSearch = () => {
    returnFocus.current = null;
    flushSync(() => { setScope(filterable ? 'page' : 'all'); setQuery(''); setOpen(false); });
    onPageQueryChange?.('');
    focusQuietly();
  };
  useImperativeHandle(ref, () => ({ openCommandCenter, focusPageSearch }));

  const change = (text: string) => {
    if (!all) { onPageQueryChange?.(text); return; }
    setQuery(text); setActive(0); setOpen(true);
  };
  const changeScope = (next: Scope) => {
    if (next === 'all') { setQuery(pageQuery); onPageQueryChange?.(''); setOpen(true); }
    else { onPageQueryChange?.(query); setQuery(''); setOpen(false); }
    setScope(next); setCategory('all'); setActive(0);
  };
  const clear = () => { change(''); inputRef.current?.focus(); };
  const choose = (item: ShellCommand) => {
    returnFocus.current = null;
    setOpen(false); setQuery(''); setScope(filterable ? 'page' : 'all');
    item.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (all && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!results.length) return;
      const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      document.getElementById(commandOptionId(listId, results[next]))?.scrollIntoView({ block: 'nearest' });
    } else if (all && event.key === 'Enter' && open && current) { event.preventDefault(); choose(current); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
    else if (event.key === 'Enter' && !all) event.preventDefault();
  };
  /** A click on the box's buttons leaves focus where it was (see CommandCenter), so the popup stays open on macOS. */
  const keepInputFocus = (event: MouseEvent) => event.preventDefault();
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!anchorRef.current?.contains(event.relatedTarget as Node | null)) { setOpen(false); returnFocus.current = null; }
  };

  const typed = query.trim() !== '';
  useEffect(() => {
    if (all && open) onAnnounce(`${results.length} ${typed ? (results.length === 1 ? 'search result' : 'search results') : 'suggestions'}.`);
  }, [all, open, typed, query, category, results.length, onAnnounce]);

  const combobox = all ? { role: 'combobox', 'aria-autocomplete': 'list', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': listId, 'aria-activedescendant': open && current ? commandOptionId(listId, current) : undefined } as const : {};
  return <div className="dv-shell-search-anchor" ref={anchorRef} onBlur={onBlur}>
    <div className="dv-shell-searchbox" role="search" aria-label="DVDash search">
      {glyph(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>)}
      <select aria-label="Search scope" value={scope} onChange={event => changeScope(event.currentTarget.value as Scope)}>
        <option value="page" disabled={!filterable}>{pageLabel}</option><option value="all">All DVDash</option>
      </select>
      <input ref={inputRef} type="search" autoComplete="off" spellCheck={false} value={value} {...combobox}
        aria-label={all ? 'Search all DVDash' : `Search ${pageLabel.toLowerCase()}`} placeholder={all ? 'Search DVDash…' : pagePlaceholder}
        onChange={event => change(event.currentTarget.value)} onFocus={() => { if (all && !quietFocus.current) setOpen(true); }} onKeyDown={onKeyDown} />
      {value && <button type="button" className="dv-shell-clear" aria-label="Clear search" onMouseDown={keepInputFocus} onClick={clear}>{glyph(<path d="m6 6 12 12M6 18 18 6" />)}</button>}
      <button type="button" className="dv-shell-shortcut" title={`Open command center · ${mac ? '⌘' : 'Ctrl'} K`} onMouseDown={keepInputFocus} onClick={openCommandCenter}>
        <span className="dv-shell-sr">Open command center</span><KeyCaps keys={['Mod', 'K']} mac={mac} size="xs" />
      </button>
    </div>
    {all && open && <CommandCenter listId={listId} groups={groups} query={query} category={category} onCategoryChange={next => { setCategory(next); setActive(0); }}
      activeIndex={active} onActiveIndexChange={setActive} onSelect={item => choose(item as ShellCommand)} onClearQuery={clear} onShortcuts={() => { setOpen(false); focusQuietly(); onShortcuts(); }} mac={mac} />}
  </div>;
}
