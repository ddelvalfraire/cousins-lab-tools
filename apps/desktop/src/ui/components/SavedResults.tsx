import { useEffect, useId, useRef, useState } from 'react';
import { Chip } from './Chip';
import { formatClockTime } from '../time';
import { Presence, Swap } from './Motion';
import { StatusBanner } from './Primitives';
import { RightSidebar, type RightSidebarTab } from './RightSidebar';
import { InspectorButton, InspectorIcon, InspectorPane } from './InspectorParts';
import './SavedResults.css';
import { ScrollFrame } from './ScrollFrame';

/** A saved interval result with the inputs and calculation stored with it. Missing context is null, never reconstructed. */
export interface SavedResult {
  id: string;
  sample: string;
  /** Selected interval, in seconds. */
  start: number;
  end: number;
  value: number;
  /** Mean signal over the interval, in the signal unit. */
  mean: number | null;
  sampleCount: number | null;
  signal: string;
  signalUnit: string;
  recording: string;
  sourceId: string | null;
  calibrationRevision: string;
  calibration: { revision: string; zero: number; scale: number } | null;
  preset: { name: string; revision: string } | null;
  /** ISO instant with its zone, e.g. `2026-04-14T09:20:00Z`; shown in local time. */
  savedAt: string;
}
/** What the results measure: a short symbol for the table and formula, a full label and the unit. */
export interface ResultQuantity { symbol: string; label: string; unit: string; unitName?: string }
export type SavedResultPhase = 'ready' | 'loading' | 'error';
export type SavedResultTab = 'details' | 'context';

const fmt = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** "14 Apr 2026 · 09:20:00" in local time; the date and the time come from the same zone. */
const savedDate = (iso: string) => `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))} · ${formatClockTime(iso)}`;

/**
 * Saved results with a details button per row and pages of `pageSize`.
 * Values from design/dvdash-field-review/saved-result-inspector-review.html (.table-card).
 */
export function SavedResultsTable({ results, quantity, selectedId, expanded = true, onOpen, pageSize = 3, page: controlledPage, onPageChange, notice }: {
  results: readonly SavedResult[];
  quantity: ResultQuantity;
  selectedId?: string | null;
  /** Whether the details of the selected row are showing (the inspector is open). */
  expanded?: boolean;
  onOpen?: (id: string) => void;
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  /** One sentence shown below the table, e.g. that a newer calibration exists. */
  notice?: string;
}) {
  const titleId = useId();
  const [ownPage, setOwnPage] = useState(0), page = controlledPage ?? ownPage;
  const pages = Math.max(1, Math.ceil(results.length / pageSize)), rows = results.slice(page * pageSize, page * pageSize + pageSize);
  const go = (next: number) => { setOwnPage(next); onPageChange?.(next); };
  const empty = !results.length;
  const pager: [string, 'first' | 'left' | 'chevron' | 'last', number, boolean][] = [
    ['First page', 'first', 0, page === 0], ['Previous page', 'left', page - 1, page === 0],
    ['Next page', 'chevron', page + 1, page >= pages - 1], ['Last page', 'last', pages - 1, page >= pages - 1],
  ];
  return <div className="dv-insp dv-res-main">
    <section className="dv-res-card" aria-labelledby={titleId}>
      <header className="dv-res-head"><h2 id={titleId}>Saved results</h2><small>{results.length} {results.length === 1 ? 'result' : 'results'}</small></header>
      <ScrollFrame axes="x" className="dv-res-region" tabIndex={0} role="region" aria-label="Saved interval results">
        {empty ? <div className="dv-res-empty"><h3>No saved results</h3><p>Saved interval results will appear here after calculation.</p></div>
          : <table>
            <thead><tr><th scope="col">Sample</th><th scope="col" className="dv-res-numeric">{quantity.symbol}<span className="dv-res-subline">{quantity.unit}</span></th><th scope="col">Calibration</th><th scope="col"><span className="dv-insp-sr">Details</span></th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id} data-selected={r.id === selectedId}>
              <td><span className="dv-res-sample">{r.sample}</span><span className="dv-res-subline">{r.start}–{r.end} s</span></td>
              <td className="dv-res-numeric">{fmt(r.value)}</td>
              <td><span className="dv-res-revision"><InspectorIcon name="clock" />{r.calibrationRevision}</span></td>
              <td><button type="button" className="dv-res-open" aria-label={`View ${r.sample.toLowerCase()} result`} aria-expanded={r.id === selectedId && expanded} onClick={() => onOpen?.(r.id)}><InspectorIcon name="chevron" /></button></td>
            </tr>)}</tbody>
          </table>}
      </ScrollFrame>
      {!empty && <nav className="dv-res-pager" aria-label="Saved-results pagination">
        <span>{page * pageSize + 1}–{Math.min(results.length, page * pageSize + pageSize)} of {results.length}</span>
        <div className="dv-res-pager-actions">{pager.map(([label, icon, target, disabled]) => <button key={label} type="button" aria-label={label} disabled={disabled} onClick={() => go(target)}><InspectorIcon name={icon} /></button>)}</div>
      </nav>}
    </section>
    <div className="dv-insp-summary"><Presence show={!!notice}><StatusBanner severity="info">{notice}</StatusBanner></Presence></div>
  </div>;
}

/** Selection, loading and sidebar state shared by the table and the inspector. */
export function useSavedResultInspector({ results, load, initialSelected = results[0]?.id ?? null, initialPhase = 'ready' }: {
  results: readonly SavedResult[];
  /** Loads the saved context of one result. Without it, rows open at once. */
  load?: (id: string) => Promise<SavedResult>;
  initialSelected?: string | null;
  initialPhase?: SavedResultPhase;
}) {
  const [selectedId, setSelectedId] = useState(initialSelected), [loaded, setLoaded] = useState<SavedResult | null>(null);
  const [phase, setPhase] = useState<SavedResultPhase>(initialPhase), [tab, setTab] = useState<SavedResultTab>('details'), [collapsed, setCollapsed] = useState(false);
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const open = async (id: string) => {
    const token = ++epoch.current;
    setSelectedId(id); setCollapsed(false);
    if (!load) { setLoaded(null); setPhase('ready'); return; }
    setPhase('loading');
    try { const result = await load(id); if (token === epoch.current) { setLoaded(result); setPhase('ready'); } } catch { if (token === epoch.current) setPhase('error'); }
  };
  const fallback = results.find(r => r.id === selectedId) ?? null;
  const result = loaded?.id === selectedId ? loaded : fallback;
  return { selectedId, result, phase, tab, setTab, collapsed, setCollapsed, open, retry: () => { if (selectedId) void open(selectedId); } };
}

const tabs: RightSidebarTab[] = [
  { id: 'details', label: 'Details', icon: <InspectorIcon name="file" /> },
  { id: 'context', label: 'Context', icon: <InspectorIcon name="clock" /> },
];

/**
 * Right-sidebar inspector for one saved result: Details (value and saved calculation) and Context (source, preset, calibration).
 * Values from design/dvdash-field-review/saved-result-inspector-review.html.
 */
export function SavedResultInspector({ result, phase = 'ready', quantity, tab: controlledTab, onTabChange, collapsed, onCollapsedChange, onRetry, onExport }: {
  result: SavedResult | null;
  phase?: SavedResultPhase;
  quantity: ResultQuantity;
  tab?: SavedResultTab;
  onTabChange?: (tab: SavedResultTab) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onRetry?: () => void;
  /** Exports the selected result. A returned sentence is shown under the button. */
  onExport?: (result: SavedResult) => Promise<string | void> | string | void;
}) {
  const [ownTab, setOwnTab] = useState<SavedResultTab>('details'), tab = controlledTab ?? ownTab;
  const [exported, setExported] = useState<{ id: string; text: string } | null>(null);
  const exportResult = async () => {
    if (!result || phase !== 'ready') return;
    let text: string;
    try { text = (await onExport?.(result)) || 'Result exported.'; } catch { text = 'Could not export the result. Try again.'; }
    setExported({ id: result.id, text });
  };
  const status = exported && exported.id === result?.id && phase === 'ready' ? exported.text : null;
  return <RightSidebar tabs={tabs} activeTab={tab} onTabChange={id => { setOwnTab(id as SavedResultTab); onTabChange?.(id as SavedResultTab); }} collapsed={collapsed} onCollapsedChange={onCollapsedChange}
    title={tab === 'details' ? 'Result details' : 'Saved context'} label="Saved result inspector" tabsLabel="Result tools">
    <InspectorPane label={tab === 'details' ? 'Result details' : 'Saved context'} actions={<>
      <InspectorButton className="dv-res-export" disabled={!result || phase !== 'ready'} onClick={exportResult}><InspectorIcon name="download" />Export result</InspectorButton>
      <Presence show={!!status}><p className="dv-res-download" role="status">{status}</p></Presence>
    </>}>
      {!result ? <div className="dv-res-placeholder"><h3>No result selected</h3><p>Open a saved result to review its calculation and source.</p></div>
        : phase === 'loading' ? <div className="dv-res-placeholder" aria-busy="true"><h3>Loading result details…</h3><div className="dv-res-skeleton" data-size="big" /><div className="dv-res-skeleton" /><div className="dv-res-skeleton" /><div className="dv-res-skeleton" /></div>
        : phase === 'error' ? <StatusBanner severity="error">Could not load saved context. The result remains in the table. <button type="button" className="dv-insp-link" onClick={onRetry}>Retry</button></StatusBanner>
        : tab === 'details' ? <ResultDetails result={result} quantity={quantity} /> : <ResultContext result={result} />}
    </InspectorPane>
  </RightSidebar>;
}

function ResultDetails({ result: r, quantity }: { result: SavedResult; quantity: ResultQuantity }) {
  const c = r.calibration;
  return <>
    <div className="dv-res-identity"><Chip icon={<InspectorIcon name="flask" />}>{r.sample}</Chip><span className="dv-res-revision"><InspectorIcon name="clock" />{r.calibrationRevision}</span></div>
    <p className="dv-res-label">{quantity.label}</p>
    <div className="dv-res-value"><strong>{fmt(r.value)}</strong><abbr tabIndex={0} title={quantity.unitName}>{quantity.unit}</abbr></div>
    <p className="dv-res-meta">Saved {savedDate(r.savedAt)}</p>
    <dl className="dv-res-facts"><dt>Selected interval</dt><dd>{r.start}–{r.end} s</dd><dt>Samples</dt><dd>{r.sampleCount ?? 'Not stored'}</dd><dt>Mean signal</dt><dd>{r.mean === null ? 'Not stored' : `${fmt(r.mean)} ${r.signalUnit}`}</dd></dl>
    <h3 className="dv-res-group">Saved calculation</h3>
    <Swap swapKey={c && r.mean !== null ? 'stored' : 'missing'}>{c && r.mean !== null ? <>
      <div className="dv-res-formula"><strong>{quantity.symbol} = ({r.signal} − zero) × scale</strong>({fmt(r.mean)} − {fmt(c.zero)}) × {c.scale} = {fmt(r.value)}</div>
      <dl className="dv-res-facts"><dt>Zero offset</dt><dd>{fmt(c.zero)} {r.signalUnit}</dd><dt>Scale factor</dt><dd>{c.scale}</dd></dl>
      <p className="dv-insp-help">Scale unit: {quantity.unit} per {r.signalUnit}</p>
    </> : <StatusBanner severity="warning">Calibration settings were not stored with this result. Its saved value is retained.</StatusBanner>}</Swap>
  </>;
}

function ResultContext({ result: r }: { result: SavedResult }) {
  const c = r.calibration;
  return <>
    <div className="dv-res-identity"><Chip icon={<InspectorIcon name="flask" />}>{r.sample}</Chip></div>
    <div className="dv-res-context">
      <div><p className="dv-res-context-label">Recording</p><p className="dv-res-context-value">{r.recording}</p><p className="dv-insp-help">{r.sourceId ?? 'Recording identifier not stored'}</p></div>
      <div><p className="dv-res-context-label">Signal and interval</p><p className="dv-res-context-value">{r.signal} · {r.start}–{r.end} s</p></div>
      <div><p className="dv-res-context-label">Preset at calculation</p>{r.preset ? <div className="dv-res-tags"><Chip icon={<InspectorIcon name="file" />}>{r.preset.name}</Chip><Chip icon={<InspectorIcon name="clock" />}>{r.preset.revision}</Chip></div> : <p className="dv-res-context-value">Preset revision not stored</p>}</div>
      <div><p className="dv-res-context-label">Calibration at calculation</p><p className="dv-res-context-value">{c ? `${c.revision} · zero ${fmt(c.zero)} ${r.signalUnit} · scale ${c.scale}` : `${r.calibrationRevision} · settings not stored`}</p></div>
      <div><p className="dv-res-context-label">Result identifier</p><p className="dv-res-context-value">{r.id}</p></div>
    </div>
  </>;
}
