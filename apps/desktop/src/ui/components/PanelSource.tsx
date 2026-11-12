import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type uPlot from 'uplot';
import { Chip } from './Chip';
import { DvSelect } from './DvSelect';
import { StatusBanner } from './Primitives';
import { RightSidebar, type RightSidebarTab } from './RightSidebar';
import { ScientificPlot } from './SignalChart';
import { Announcer, InspectorButton, InspectorIcon, InspectorPane } from './InspectorParts';
import './PanelSource.css';

/** A signal the panel can show. `line` is its style in the chart and legend. */
export interface PanelChannel { id: string; label: string; line: 'solid' | 'dashed' | 'dotted' }
export interface PanelSourceOption {
  id: string;
  name: string;
  /** File name, or a description for an instrument stream. */
  file: string;
  kind: 'Recorded' | 'Live';
  /** Option group in the source list, e.g. "Recordings". */
  group: string;
  duration: number;
  samples: number;
  /** Channel ids this source provides. */
  channels: readonly string[];
  unit: string;
  /** What the source measures, in words, e.g. "temperature". */
  quantity: string;
  data: readonly ({ t: number } & Record<string, number>)[];
}
/** The source and visible signals a panel shows. */
export interface PanelBinding { source: string; signals: readonly string[] }
export type PanelSourceStatus = 'idle' | 'switching' | 'failed';
/** State of a live source. */
export type StreamState = 'receiving' | 'waiting' | 'stale';

/** Why the draft can't be applied, as one sentence, or null. */
export function panelSourceProblem(draft: PanelBinding, sources: readonly PanelSourceOption[], channels: readonly PanelChannel[], requires: { unit: string; quantity: string }): { text: string; severity: 'info' | 'error' } | null {
  const s = sources.find(option => option.id === draft.source);
  if (!s) return { text: 'Choose a data source.', severity: 'info' };
  if (s.unit !== requires.unit) return { text: `This chart needs ${requires.quantity} in ${requires.unit}. This source provides ${s.quantity} in ${s.unit}.`, severity: 'error' };
  if (!draft.signals.length) return { text: 'Choose at least one signal.', severity: 'error' };
  const missing = draft.signals.filter(id => !s.channels.includes(id)).map(id => channels.find(c => c.id === id)?.label ?? id);
  if (missing.length) return { severity: 'error', text: `${missing.length === 1 ? `${missing[0]} is` : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]} are`} missing from this source. Remove ${missing.length === 1 ? 'it' : 'them'} from this panel or choose another source.` };
  return null;
}

export interface PanelSourceEditor {
  draft: PanelBinding;
  applied: PanelBinding;
  /** The panel's selected interval, cleared when a different source is applied. */
  interval: readonly [number, number] | null;
  status: PanelSourceStatus;
  problem: ReturnType<typeof panelSourceProblem>;
  dirty: boolean;
  announcement: string;
  setSource: (source: string) => void;
  toggleSignal: (signal: string, visible: boolean) => void;
  apply: () => void;
  discard: () => void;
}

/**
 * Draft source for one panel. The chart keeps the applied source while a switch is pending or after it fails;
 * a successful switch to a different source clears the panel's selected interval.
 */
export function usePanelSource({ sources, channels, requires, applied: initialApplied, initialDraft, interval: initialInterval = null, initialStatus = 'idle', onApply }: {
  sources: readonly PanelSourceOption[];
  channels: readonly PanelChannel[];
  requires: { unit: string; quantity: string };
  applied: PanelBinding;
  initialDraft?: PanelBinding;
  interval?: readonly [number, number] | null;
  initialStatus?: PanelSourceStatus;
  onApply?: (binding: PanelBinding) => Promise<void> | void;
}): PanelSourceEditor {
  const [applied, setApplied] = useState(initialApplied), [draft, setDraft] = useState(initialDraft ?? initialApplied);
  const [interval, setPanelInterval] = useState(initialInterval), [status, setStatus] = useState<PanelSourceStatus>(initialStatus), [announcement, setAnnouncement] = useState('');
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const problem = panelSourceProblem(draft, sources, channels, requires);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const edit = (next: PanelBinding) => { setDraft(next); if (status === 'failed') setStatus('idle'); };
  const order = (ids: string[]) => channels.map(c => c.id).filter(id => ids.includes(id));
  return {
    draft, applied, interval, status, problem, dirty, announcement,
    setSource: source => edit({ ...draft, source }),
    toggleSignal: (signal, visible) => edit({ ...draft, signals: order(visible ? [...draft.signals, signal] : draft.signals.filter(id => id !== signal)) }),
    apply: async () => {
      if (status === 'switching' || problem || !dirty) return;
      const target = draft, token = ++epoch.current;
      setStatus('switching');
      try { await onApply?.(target); } catch {
        if (token === epoch.current) { setStatus('failed'); setAnnouncement('Source switch failed. Previous source retained.'); }
        return;
      }
      if (token !== epoch.current) return;
      if (target.source !== applied.source) setPanelInterval(null);
      setApplied(target); setStatus('idle');
      setAnnouncement(`Panel now uses ${sources.find(s => s.id === target.source)?.name ?? target.source}.`);
    },
    discard: () => { epoch.current++; setDraft(applied); setStatus('idle'); },
  };
}

const tabs: RightSidebarTab[] = [
  { id: 'binding', label: 'Data', icon: <InspectorIcon name="signal" /> },
  { id: 'context', label: 'Source', icon: <InspectorIcon name="file" /> },
];

/**
 * Right-sidebar inspector choosing one panel's source and visible signals (Data), and describing the applied source (Source).
 * Values from design/dvdash-field-review/source-binding-review.html.
 */
export function PanelSourceInspector({ editor, sources, channels, stream, tab: controlledTab, onTabChange, collapsed, onCollapsedChange }: {
  editor: PanelSourceEditor;
  sources: readonly PanelSourceOption[];
  channels: readonly PanelChannel[];
  /** State of the applied source when it is live. */
  stream?: StreamState;
  tab?: 'binding' | 'context';
  onTabChange?: (tab: 'binding' | 'context') => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [ownTab, setOwnTab] = useState<'binding' | 'context'>('binding'), tab = controlledTab ?? ownTab;
  return <RightSidebar tabs={tabs} activeTab={tab} onTabChange={id => { setOwnTab(id as 'binding'); onTabChange?.(id as 'binding'); }} collapsed={collapsed} onCollapsedChange={onCollapsedChange}
    title={tab === 'binding' ? 'Panel source' : 'Applied source'} label="Panel source inspector" tabsLabel="Source tools">
    {tab === 'binding' ? <PanelSourceBindingPane editor={editor} sources={sources} channels={channels} /> : <PanelSourceAppliedPane editor={editor} sources={sources} channels={channels} stream={stream} />}
  </RightSidebar>;
}

/** The Data tab: source, visible signals and Apply. Place it in a `RightSidebar` that has other tabs too. */
export function PanelSourceBindingPane({ editor, sources, channels }: { editor: PanelSourceEditor; sources: readonly PanelSourceOption[]; channels: readonly PanelChannel[] }) {
  const id = useId(), root = useRef<HTMLDivElement>(null), messageId = `${id}-message`;
  const { draft, applied, status, problem, dirty } = editor, pending = status === 'switching';
  const s = sources.find(option => option.id === draft.source);
  const groups = [...new Set(sources.map(option => option.group))];
  const sourceOptions = [{ value: '', label: 'Choose a source' }, ...groups.flatMap(group => sources.filter(option => option.group === group)
    .map(option => ({ value: option.id, group, label: `${option.name} · ${option.channels.length} ${option.channels.length === 1 ? 'signal' : 'signals'}` })))];
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === 'switching' && status === 'failed') root.current?.querySelector<HTMLElement>('[data-action="retry"]')?.focus();
    if (previous.current === 'switching' && status === 'idle') root.current?.querySelector<HTMLElement>('.dv-select')?.focus();
    previous.current = status;
  }, [status]);
  const discard = () => { editor.discard(); root.current?.querySelector<HTMLElement>('.dv-select')?.focus(); };
  return <InspectorPane ref={root} label="Panel source settings" actions={<>
    <div className="dv-insp-action-row">
      <InspectorButton variant="primary" className="dv-src-apply" disabled={pending || !!problem || !dirty} onClick={editor.apply}>{pending ? 'Switching…' : 'Apply to panel'}</InspectorButton>
      <InspectorButton variant="quiet" disabled={pending || !dirty} onClick={discard}>Discard</InspectorButton>
    </div>
    {status === 'failed' && <div className="dv-insp-status"><StatusBanner severity="error">Could not switch the panel source. The previous source is still shown. <button type="button" className="dv-insp-link" data-action="retry" onClick={editor.apply}>Retry</button></StatusBanner></div>}
    <Announcer message={editor.announcement} />
  </>}>
    <div className="dv-insp-field"><label htmlFor={`${id}-source`}>Data source</label>
      <DvSelect id={`${id}-source`} value={draft.source} disabled={pending} options={sourceOptions} onChange={editor.setSource} />
    </div>
    {s && <><div className="dv-src-identity"><InspectorIcon name={s.kind === 'Live' ? 'device' : 'file'} />{s.name}</div>
      <p className="dv-src-description">{s.file}<br />{s.kind} · {s.channels.length} {s.channels.length === 1 ? 'signal' : 'signals'} · {s.unit}</p></>}
    <div className="dv-src-check-heading"><span id={`${id}-signals`}>Visible signals</span><small>{draft.signals.length} selected</small></div>
    <div role="group" aria-labelledby={`${id}-signals`}>{channels.map(channel => {
      const available = !!s && s.channels.includes(channel.id), checked = draft.signals.includes(channel.id);
      return <label key={channel.id} className="dv-src-signal">
        <input type="checkbox" checked={checked} disabled={!s || pending || (!available && !checked)} aria-describedby={messageId} onChange={e => editor.toggleSignal(channel.id, e.currentTarget.checked)} />
        <span className="dv-src-signal-label">{channel.label}</span>
        {available ? <span className="dv-src-signal-unit">{s.unit}</span> : s ? <span className="dv-src-missing"><InspectorIcon name="error" />Unavailable</span> : null}
      </label>;
    })}</div>
    <div id={messageId} className="dv-src-status">{problem && <StatusBanner severity={problem.severity}>{problem.text}</StatusBanner>}</div>
    {dirty && draft.source !== applied.source && <div className="dv-src-status"><StatusBanner severity="info">Switching source clears this panel’s selected interval. Saved results are retained.</StatusBanner></div>}
  </InspectorPane>;
}

/** The Source tab: what the panel shows now. */
export function PanelSourceAppliedPane({ editor, sources, channels, stream }: { editor: PanelSourceEditor; sources: readonly PanelSourceOption[]; channels: readonly PanelChannel[]; stream?: StreamState }) {
  const s = sources.find(option => option.id === editor.applied.source)!, interval = editor.interval;
  const label = (signal: string) => channels.find(c => c.id === signal)?.label ?? signal;
  return <InspectorPane label="Applied source details">
    <p className="dv-src-section-title">Applied source</p>
    <p className="dv-src-meta-file">{s.file}</p>
    <dl className="dv-src-facts"><dt>Source</dt><dd>{s.name}</dd><dt>Signals</dt><dd>{editor.applied.signals.map(label).join(', ')}</dd><dt>Duration</dt><dd>{s.duration} s</dd>
      <dt>Samples</dt><dd>{s.kind === 'Live' && stream === 'waiting' ? 0 : s.samples}</dd><dt>Interval</dt><dd>{interval ? `${interval[0]}–${interval[1]} s` : 'Not selected'}</dd></dl>
    <div className="dv-src-status"><StatusBanner severity="info">Changing a display does not start or stop the instrument.</StatusBanner></div>
  </InspectorPane>;
}

const lineColors = { light: { solid: '#326db1', dashed: '#7850a1', dotted: '#967112' }, dark: { solid: '#91b8eb', dashed: '#c69bdf', dotted: '#e8ce88' } } as const;

/**
 * The panel's chart. It always shows the applied source: a pending or failed switch leaves it unchanged.
 * Values from design/dvdash-field-review/source-binding-review.html (.chart-card).
 */
export function PanelSourceChart({ editor, sources, channels, title, stream, staleFor = '12 s', yLimits = [0, 2.4] }: {
  editor: PanelSourceEditor;
  sources: readonly PanelSourceOption[];
  channels: readonly PanelChannel[];
  title: string;
  stream?: StreamState;
  /** Time since the last sample of a stale stream, e.g. "12 s". */
  staleFor?: string;
  yLimits?: [number, number];
}) {
  const scheme = useComputedColorScheme('light'), narrow = useMediaQuery('(max-width: 650px)', false, { getInitialValueInEffect: false });
  const s = sources.find(option => option.id === editor.applied.source)!, shown = channels.filter(c => editor.applied.signals.includes(c.id));
  const live = s.kind === 'Live', waiting = live && stream === 'waiting', interval = editor.interval;
  const key = JSON.stringify([s.id, editor.applied.signals, waiting]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo<uPlot.AlignedData>(() => waiting ? [[0], ...shown.map(() => [null])] : [s.data.map(row => row.t), ...shown.map(c => s.data.map(row => row[c.id] ?? null))], [key]);
  return <div className="dv-insp dv-src-main">
    <section className="dv-insp-card" aria-label={title}>
      <div className="dv-insp-card-heading"><h2>{title}</h2><Chip icon={<InspectorIcon name={live ? 'signal' : 'file'} />}>{s.kind}</Chip></div>
      <p className="dv-src-current"><strong>{s.name}</strong> · {s.file}</p>
      <div className="dv-insp-legend">{shown.map(c => <span key={c.id}><i data-line={c.line} />{c.label}</span>)}</div>
      <div className="dv-insp-plot">
        <ScientificPlot data={data} range={[0, s.duration]} limits={yLimits} selection={interval && !waiting ? [interval[0], interval[1]] : undefined} xLabel="Time since source start (s)" yLabel={`Signal (${s.unit})`}
          height={narrow ? 210 : 252} minimumWidth={240} sparse={{ left: 38, bottom: 34 }} unit={s.unit}
          series={shown.map(c => ({ label: c.label, unit: s.unit, color: lineColors[scheme][c.line], dash: c.line }))} />
        {waiting && <p className="dv-src-empty-trace">Waiting for the first sample</p>}
      </div>
      <p className="dv-src-chart-meta">{interval ? `Selected interval: ${interval[0]}–${interval[1]} s` : `Full source · ${s.duration} s`}</p>
    </section>
    <div className="dv-insp-summary">{live && stream === 'stale' ? <StatusBanner severity="warning">Stale · last received {staleFor} ago. Last samples remain visible.</StatusBanner>
      : waiting ? <StatusBanner severity="info">The stream is connected. No samples received yet.</StatusBanner> : null}</div>
  </div>;
}
