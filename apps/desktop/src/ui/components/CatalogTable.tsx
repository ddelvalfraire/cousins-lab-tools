import { useEffect, useState, type ReactNode } from 'react';
import { SidebarIcon, type SidebarIconName } from './RightSidebar';
import { Chip } from './Chip';
import { Select } from '@mantine/core';
import { chosen } from './select';
import './Approved.css';
import './CatalogTable.css';
import { ScrollFrame } from './ScrollFrame';

/*
 * Shared pieces of the catalog pages (presets, instruments, routines), from the approved catalog mockups.
 * The row pattern follows ExperimentsList: a framed sortable table, quiet arrow actions, pagination and a filter line.
 */

/** The quiet action's arrow (`M4 12h15m-5-5 5 5-5 5`, stroke 1.7). */
export const CatalogArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15m-5-5 5 5-5 5" /></svg>;

/** Quiet labelled arrow action (.preset-use): accent text, no border. */
export function CatalogAction({ children, onClick, label, disabled, unavailable, arrow = true }: { children: ReactNode; onClick?: () => void; label?: string; disabled?: boolean; unavailable?: boolean; arrow?: boolean }) {
  return <button type="button" className="dv-cat-action" aria-label={label} disabled={disabled} aria-disabled={unavailable || undefined} onClick={unavailable ? undefined : onClick}>{children}{arrow && <CatalogArrow />}</button>;
}

/** A chip with one of the sidebar glyphs (.side-chip). */
export function CatalogChip({ icon, children, title, tone }: { icon?: SidebarIconName; children: ReactNode; title?: string; tone?: 'accent' }) {
  return <Chip icon={icon && <SidebarIcon name={icon} />} title={title} tone={tone}>{children}</Chip>;
}

/** Page root: the catalog background below the shared header. */
export function CatalogRoot({ label, children }: { label: string; children: ReactNode }) {
  return <section className="dv-cat" aria-label={label}>{children}</section>;
}

/** "Filtered by …" line with Clear filter (.applied-filter). */
export function CatalogFilter({ query, onClear }: { query: string; onClear: () => void }) {
  return <div className="dv-cat-filter">
    <div className="dv-cat-filter-query"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true" focusable="false"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></svg><span>Filtered by “{query}”</span></div>
    <button type="button" className="dv-cat-text-button" onClick={onClear}>Clear filter</button>
  </div>;
}

/** Count on the left, optional controls on the right (.preset-toolbar). */
export function CatalogToolbar({ count, children }: { count: string; children?: ReactNode }) {
  return <div className="dv-cat-toolbar"><span className="dv-cat-count">{count}</span>{children}</div>;
}

export interface CatalogSort<K extends string> { key: K; ascending: boolean }
/** Sort state: a new column sorts ascending, the same column flips (as in the mockups). */
export function useCatalogSort<K extends string>(initial: CatalogSort<K>) {
  const [sort, setSort] = useState(initial);
  const sortBy = (key: K) => setSort(current => ({ key, ascending: current.key === key ? !current.ascending : true }));
  return [sort, sortBy] as const;
}

/** Sortable column header with aria-sort and the ↑/↓ mark. */
export function SortHeader<K extends string>({ sortKey, label, sort, onSort }: { sortKey: K; label: string; sort: CatalogSort<K>; onSort: (key: K) => void }) {
  const active = sort.key === sortKey;
  return <th scope="col" aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
    <button type="button" data-sort={sortKey} onClick={() => onSort(sortKey)}>{label}{active && <span aria-hidden="true">{sort.ascending ? '↑' : '↓'}</span>}</button>
  </th>;
}

/** Scrollable table frame (.preset-table-frame). */
export function CatalogFrame({ label, children }: { label: string; children: ReactNode }) {
  return <ScrollFrame className="dv-cat-frame" role="region" aria-label={label} tabIndex={0}>{children}</ScrollFrame>;
}

export const PAGE_SIZES = [5, 10] as const;
/** Page state that stays in range when the list shrinks. */
export function useCatalogPage(total: number, initialSize: number = PAGE_SIZES[0]) {
  const [size, setSize] = useState(initialSize), [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(total / size)), current = Math.min(page, count - 1);
  useEffect(() => { setPage(0); }, [size]);
  return { size, setSize, page: current, setPage, count, start: current * size, end: Math.min(total, (current + 1) * size) };
}

/** "1–5 of 8 presets", rows per page and first/previous/next/last (.preset-pagination). */
export function CatalogPagination({ noun, total, pager }: { noun: (n: number) => string; total: number; pager: ReturnType<typeof useCatalogPage> }) {
  const { page, count, size, setSize, setPage, start, end } = pager;
  const changePage = (next: number, button: HTMLButtonElement) => {
    setPage(next);
    // A boundary disables the pressed button, so keep keyboard focus in the paging controls.
    requestAnimationFrame(() => {
      if (button.isConnected && button.disabled && (document.activeElement === button || document.activeElement === document.body)) {
        button.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      }
    });
  };
  return <div className="dv-cat-pagination">
    <span>{total ? `${start + 1}–${end} of ${noun(total)}` : noun(0)}</span>
    <div className="dv-cat-pagination-controls">
      <label>Rows <Select aria-label="Rows per page" value={String(size)} data={PAGE_SIZES.map(String)} onChange={chosen(value => setSize(Number(value)))} /></label>
      <button type="button" aria-label="First page" disabled={page === 0} onClick={event => changePage(0, event.currentTarget)}>«</button>
      <button type="button" aria-label="Previous page" disabled={page === 0} onClick={event => changePage(page - 1, event.currentTarget)}>‹</button>
      <span>{page + 1} / {count}</span>
      <button type="button" aria-label="Next page" disabled={page >= count - 1} onClick={event => changePage(page + 1, event.currentTarget)}>›</button>
      <button type="button" aria-label="Last page" disabled={page >= count - 1} onClick={event => changePage(count - 1, event.currentTarget)}>»</button>
    </div>
  </div>;
}

/** Empty catalog or no matches (.preset-state): icon, heading, one sentence, optional action. */
export function CatalogState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return <div className="dv-cat-state">{icon}<h2>{title}</h2><p>{message}</p>{action}</div>;
}

/** Sidebar placeholder before anything is selected (.side-empty). */
export function SidebarEmpty({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
  return <div className="dv-cat-side-empty">{icon}<strong>{title}</strong><p>{message}</p></div>;
}

/** Search text the page filters by. Clear filter clears it here and tells the host. */
export function useCatalogQuery(query: string, onClearQuery?: () => void) {
  const [value, setValue] = useState(query);
  useEffect(() => { setValue(query); }, [query]);
  const clear = () => { setValue(''); onClearQuery?.(); };
  return [value.trim(), clear] as const;
}

export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Focus the sidebar pane after it opens, as the mockups do. */
export const focusPane = (id: string) => requestAnimationFrame(() => document.getElementById(`${id}-pane`)?.focus());
