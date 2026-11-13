import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ReviewIcon } from './ReviewIcons';
import { Chip, StatusWord } from './Chip';
import { Select } from '@mantine/core';
import { Presence, Swap } from './Motion';
import { chosen } from './select';
import { formatClockTime } from '../time';
import { HeaderButton, PageHeader, type PageBreadcrumb } from './PageHeader';
import type { StatusTone } from './Chip';
import './ExperimentsList.css';
import { ScrollFrame } from './ScrollFrame';
import { RightSidebar, SidebarFacts, SidebarIcon, SidebarSection, WorkspaceBody } from './RightSidebar';
import { CatalogAction, SidebarEmpty, focusPane } from './CatalogTable';
import { pages } from '../search-registry';

export type ExperimentStatus = 'running' | 'recorded' | 'interrupted';

export interface ExperimentSummary {
  id: string;
  name: string;
  /** Live instrument acquisition, or an imported/saved recording file. */
  kind: 'instrument' | 'recording';
  /** Instrument name (MS-01) or recording file name. */
  source: string;
  preset: string;
  revision: number;
  samples: number;
  status: ExperimentStatus;
  /** Local ISO date-time; used for sorting and the Date column. */
  startedAt: string;
}

export interface ExperimentsListProps {
  experiments: readonly ExperimentSummary[];
  /** Header search text. Filters names, sources and presets. */
  query?: string;
  /** Reference time for "Today" in the Date column. */
  now?: Date;
  onOpen: (id: string) => void;
  onNewExperiment: () => void;
  onImport: () => void;
  onClearQuery: () => void;
  /** Leave out the page header, e.g. when the host renders its own. */
  hideHeader?: boolean;
  /** Trail above the title. Defaults to Workspace › Experiments. */
  breadcrumbs?: readonly PageBreadcrumb[];
  /** Experiment shown in the Details sidebar. Defaults to the first row; a filter that hides it shows the first match. */
  initialSelected?: string | null;
  initialCollapsed?: boolean;
}

type SortKey = 'name' | 'samples' | 'status' | 'date';

const STATUS: Record<ExperimentStatus, { label: string; action: string; tone: StatusTone; icon: ReactNode }> = {
  running: { label: 'Running', action: 'Open live', tone: 'accent', icon: <ReviewIcon name="signals" /> },
  recorded: { label: 'Recorded', action: 'Open', tone: 'neutral', icon: <ReviewIcon name="check" /> },
  interrupted: { label: 'Interrupted', action: 'Open saved samples', tone: 'warning', icon: <ReviewIcon name="warn" /> },
};
/** Row marks from the approved mockup: an instrument trace in a rounded box, and a file with a trace. */
const InstrumentMark = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M6 14h3l2-5 3 8 2-4h2M7 7h1" /></svg>;
const RecordingMark = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7l-4-4v4h4" /><path d="m8 15 2-3 2 2 2-4 2 3" /></svg>;
const STATUS_ORDER: Record<ExperimentStatus, number> = { running: 0, interrupted: 1, recorded: 2 };
const PAGE_SIZES = [10, 25] as const;

const noun = (n: number) => `${n} ${n === 1 ? 'experiment' : 'experiments'}`;
const fullDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function formatDate(iso: string, now: Date) {
  const d = new Date(iso);
  return {
    date: sameDay(d, now) ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: formatClockTime(d),
  };
}

function compare(key: SortKey, a: ExperimentSummary, b: ExperimentSummary) {
  switch (key) {
    case 'name': return a.name.localeCompare(b.name);
    case 'samples': return a.samples - b.samples;
    case 'status': return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case 'date': return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  }
}

/** Experiments home list: shared page header and actions, sortable table, pagination, filter and empty states. */
export function ExperimentsList({ experiments, query = '', now, onOpen, onNewExperiment, onImport, onClearQuery, hideHeader = false, breadcrumbs = [{ label: 'Workspace' }, { label: 'Experiments' }], initialSelected, initialCollapsed = false }: ExperimentsListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [ascending, setAscending] = useState(false);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const titleId = useId(), sidebarId = useId().replace(/:/g, '');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected ?? null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [reveal, setReveal] = useState(0);
  const reference = now ?? new Date();
  const search = query.trim();

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    const list = experiments.filter(e => !needle || `${e.name} ${e.source} ${e.preset}`.toLowerCase().includes(needle));
    return list.sort((a, b) => compare(sortKey, a, b) * (ascending ? 1 : -1));
  }, [experiments, search, sortKey, ascending]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  useEffect(() => { setPage(0); }, [search, pageSize]);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);
  // Without a choice, or when the filter hides it, the first row the list shows is the selection.
  const selected = filtered.find(e => e.id === selectedId) ?? filtered[0] ?? null;
  const select = (id: string) => { setSelectedId(id); setCollapsed(false); setReveal(n => n + 1); focusPane(sidebarId); };

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAscending(!ascending);
    else { setSortKey(key); setAscending(key === 'name'); }
  };
  const clear = () => { onClearQuery(); setAnnouncement('Showing all experiments.'); };

  const actions = <>
    <HeaderButton icon={<ReviewIcon name="upload" />} onClick={onImport}>Import recordings…</HeaderButton>
    <HeaderButton variant="primary" icon={<ReviewIcon name="plus" />} onClick={onNewExperiment}>New experiment…</HeaderButton>
  </>;

  const header = (key: SortKey, title: string) => {
    const active = sortKey === key;
    return <th scope="col" aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}>
      <button type="button" data-sort={key} onClick={() => sortBy(key)}>{title}{active && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}</button>
    </th>;
  };

  let content: ReactNode;
  if (!experiments.length) {
    content = <div className="dv-exp-frame"><div className="dv-exp-empty">
      <h2>No experiments yet</h2>
      <p>Start one from a preset, or import recordings you already have.</p>
      <div className="dv-exp-empty-actions">{actions}</div>
    </div></div>;
  } else {
    const body = !filtered.length
      ? <div className="dv-exp-frame"><div className="dv-exp-empty">
          <h2>No experiments match “{search}”</h2>
          <p>Search looks at experiment names, sources and presets.</p>
          <button className="dv-exp-plain-button" type="button" onClick={clear}>Clear filter</button>
        </div></div>
      : <ScrollFrame className="dv-exp-frame" tabIndex={0} role="region" aria-label="Experiments table">
          <table className="dv-exp-table">
            <caption className="dv-exp-sr-only">Recent experiments</caption>
            <colgroup><col /><col /><col /><col /><col /></colgroup>
            <thead><tr>
              {header('name', 'Experiment')}{header('samples', 'Samples')}{header('status', 'Status')}{header('date', 'Date')}
              <th scope="col"><span className="dv-exp-sr-only">Actions</span></th>
            </tr></thead>
            <tbody>{visible.map(e => {
              const status = STATUS[e.status];
              const when = formatDate(e.startedAt, reference);
              const instrument = e.kind === 'instrument';
              return <tr key={e.id} data-selected={selected?.id === e.id}>
                <td><div className="dv-exp-identity">
                  <span className="dv-exp-mark">{instrument ? <InstrumentMark /> : <RecordingMark />}</span>
                  <div>
                    <button type="button" className="dv-exp-name" onClick={() => select(e.id)}>{e.name}</button>
                    <div className="dv-exp-chips">
                      <Chip icon={<ReviewIcon name={instrument ? 'signals' : 'file'} />} title={`${instrument ? 'Instrument' : 'Recording'} ${e.source}`}>{e.source}</Chip>
                      <Chip icon={<ReviewIcon name="panels" />} title={`Preset ${e.preset}`}>{e.preset}</Chip>
                      <Chip icon={<ReviewIcon name="revisions" />} title={`Preset revision ${e.revision}`}>R{e.revision}</Chip>
                    </div>
                  </div>
                </div></td>
                <td><Chip icon={<ReviewIcon name="signals" />} title={`${e.samples} samples`}>{e.samples.toLocaleString('en-US')}</Chip></td>
                <td><StatusWord tone={status.tone} icon={status.icon}>{status.label}</StatusWord></td>
                <td><span className="dv-exp-date">{when.date}<small>{when.time}</small></span></td>
                <td><button type="button" className="dv-exp-open" aria-label={`${status.action}: ${e.name}`} onClick={() => onOpen(e.id)}>{status.action}<ReviewIcon name="arrow" /></button></td>
              </tr>;
            })}</tbody>
          </table>
        </ScrollFrame>;
    const first = current * pageSize;
    content = <>
      <Presence show={!!search}><div className="dv-exp-filter">
        <div className="dv-exp-filter-query"><ReviewIcon name="filter" strokeWidth={1.7} /><span>Filtered by “{search}”</span></div>
        <button className="dv-exp-text-button" type="button" onClick={clear}>Clear filter</button>
      </div></Presence>
      <div className="dv-exp-toolbar"><span className="dv-exp-count">{search ? `${filtered.length} of ${noun(experiments.length)}` : noun(experiments.length)}</span></div>
      <Swap swapKey={filtered.length ? 'table' : 'empty'}>{body}</Swap>
      {filtered.length > 0 && <div className="dv-exp-pagination">
        <span>{first + 1}–{first + visible.length} of {noun(filtered.length)}</span>
        <div className="dv-exp-pagination-controls">
          <label>Rows <Select aria-label="Rows per page" value={String(pageSize)} data={PAGE_SIZES.map(String)} onChange={chosen(value => setPageSize(Number(value)))} /></label>
          <button type="button" aria-label="First page" disabled={current === 0} onClick={() => setPage(0)}>«</button>
          <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
          <span>{current + 1} / {pageCount}</span>
          <button type="button" aria-label="Next page" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>›</button>
          <button type="button" aria-label="Last page" disabled={current >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>»</button>
        </div>
      </div>}
    </>;
  }

  let pane;
  if (!selected) pane = <SidebarEmpty icon={<SidebarIcon name="details" />} title="Select an experiment" message="Open an experiment name to inspect its source, preset and samples." />;
  else {
    const status = STATUS[selected.status], instrument = selected.kind === 'instrument';
    pane = <>
      <SidebarSection>
        <div className="dv-cat-detail-identity"><span className="dv-exp-mark">{instrument ? <InstrumentMark /> : <RecordingMark />}</span><div><strong>{selected.name}</strong><small>{selected.source}</small></div></div>
        <StatusWord tone={status.tone} icon={status.icon}>{status.label}</StatusWord>
        <div className="dv-cat-actions"><CatalogAction label={`${status.action}: ${selected.name}`} onClick={() => onOpen(selected.id)}>{status.action}</CatalogAction></div>
      </SidebarSection>
      <SidebarSection title="Recording"><SidebarFacts items={[
        [instrument ? 'Instrument' : 'Recording file', selected.source],
        ['Preset', `${selected.preset} · R${selected.revision}`],
        ['Started', <>{fullDay(selected.startedAt)}<br />{formatClockTime(selected.startedAt)}</>],
        ['Samples', selected.samples.toLocaleString('en-US')],
      ]} /></SidebarSection>
    </>;
  }
  const sidebar = <RightSidebar id={sidebarId} tabsLabel="Experiment tools" activeTab="details" collapsed={collapsed} onCollapsedChange={setCollapsed} revealKey={reveal} subtitle={selected?.name ?? pages.experiments.title}
    tabs={[{ id: 'details', label: 'Details', icon: <SidebarIcon name="details" /> }]}><Swap swapKey={selected?.id ?? ''}>{pane}</Swap></RightSidebar>;

  return <section className="dv-exp" aria-labelledby={hideHeader ? undefined : titleId} aria-label={hideHeader ? 'Experiments' : undefined}>
    {!hideHeader && <PageHeader title={pages.experiments.title} titleId={titleId} breadcrumbs={breadcrumbs} count={experiments.length ? noun(experiments.length) : undefined} actions={experiments.length > 0 ? actions : undefined} />}
    <WorkspaceBody sidebar={sidebar}>{content}</WorkspaceBody>
    <div className="dv-exp-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  </section>;
}
