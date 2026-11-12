import { useId, useState, type ReactNode } from 'react';
import { Kbd } from '@mantine/core';
import { Chip } from './Chip';
import { DvSelect } from './DvSelect';
import { RightSidebar, SidebarFacts, SidebarIcon, SidebarSection, type RightSidebarTab } from './RightSidebar';
import { SignalTrace } from './SignalChart';
import { AffectedPanelFlag, ProblemsPanel, problemFlag, problemsSummary, type ProblemsPanelProps } from './ProblemsPanel';
import type { LiveStream, RecordedChannel, RecordedSample } from './ExperimentWorkspace.fixtures';
import './Approved.css';
import './ExperimentWorkspace.css';

/* Glyphs from the approved mockups (24 px grid, 1.6 stroke). */
const strokeProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
const glyphs = {
  signal: <path d="m2 12 4-1 3 6 5-12 3 8 5-1" />,
  history: <path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l3 2" />,
  warn: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  previous: <path d="m19 5-11 7 11 7ZM5 5v14" />,
  next: <path d="m5 5 11 7-11 7ZM19 5v14" />,
} as const;
export function WorkspaceGlyph({ name }: { name: keyof typeof glyphs }) { return <svg {...strokeProps}>{glyphs[name]}</svg>; }

const fixed = (value: number | null | undefined, digits: number) => value === null || value === undefined ? '—' : value.toFixed(digits);
/** `mm:ss.t`, as in sticky-playback-review.html (`pbTimecode`). */
export function timecode(seconds: number) {
  const ticks = Math.max(0, Math.round(seconds * 10)), whole = Math.floor(ticks / 10);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}.${ticks % 10}`;
}
/** Index of the sample shown at a playback position: the last one at or before it. */
export function sampleIndexAt(rows: readonly { time: number }[], position: number) {
  let index = 0;
  for (let i = 0; i < rows.length && rows[i].time <= position + 1e-9; i++) index = i;
  return index;
}

/* ---------- Live workspace (right-sidebar-review.html, experiment page) ---------- */

/** Clocks and counts above the stream cards (.live-summary). */
export function LiveSummary({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return <div className="dv-xw-summary"><div className="dv-xw-summary-main">
    {items.map(item => <div key={item.label}><span className="dv-xw-label">{item.label}</span><span className="dv-xw-number">{item.value}</span></div>)}
  </div></div>;
}

/** One live stream: reading, the last 30 s and whether it is captured (.stream-card). */
export function StreamCard({ stream, precision = stream.precision, min = stream.min, max = stream.max, stale = false }: {
  stream: LiveStream; precision?: number; min?: number; max?: number;
  /** No recent samples: the reading and line stay at the last received values. */
  stale?: boolean;
}) {
  const last = [...stream.points].reverse().find(p => p.value !== null)?.value ?? null;
  const headingId = `dv-xw-stream-${stream.id}`;
  return <article className="dv-xw-stream" data-stream={stream.id} aria-labelledby={headingId}>
    <div className="dv-xw-stream-heading">
      <h2 id={headingId}>{stream.title}</h2>
      <span className="dv-xw-stream-state" data-bad={stale}><WorkspaceGlyph name={stale ? 'warn' : 'signal'} />{stale ? 'No recent data' : 'Live'}</span>
    </div>
    <p className="dv-xw-stream-sub">{stream.source} · {stream.unit}</p>
    <div className="dv-xw-stream-reading"><strong data-live-value={stream.id}>{fixed(last, precision)}</strong><small>{stream.unit}</small></div>
    <SignalTrace variant="live" points={stream.points} from={-30} to={0} min={min} max={max} unit={stream.unit}
      label={`${stream.title}, ${min} to ${max} ${stream.unit}, last 30 seconds`} disconnectAfter={{ threshold: 0.75 }} />
    <p className="dv-xw-stream-foot">{stale ? 'Last received 45 s ago' : '2 samples/s'}</p>
    <div className="dv-xw-stream-capture">{stream.captured
      ? <span className="dv-xw-capture-pill">Capturing</span>
      : <><WorkspaceGlyph name="history" />Not capturing</>}</div>
  </article>;
}

/** A value calculated from the streams (.live-component). */
export function DerivedCard({ title, description, value, unit, unavailable }: { title: string; description: string; value: string; unit: string; unavailable?: string }) {
  return <article className="dv-xw-derived" aria-label={title}>
    <div><h2>{title}</h2><p>{description}</p></div>
    {unavailable
      ? <span className="dv-xw-derived-missing"><WorkspaceGlyph name="warn" />{unavailable}</span>
      : <span className="dv-xw-number">{value} <small>{unit}</small></span>}
  </article>;
}

/* ---------- Recorded workspace (sticky-playback-review.html, compact sticky transport) ---------- */

export interface PlaybackTransportProps {
  position: number;
  duration: number;
  playing: boolean;
  speed: number;
  sampleIndex: number;
  sampleCount: number;
  /** Seconds between samples, for the step buttons' titles. */
  step: number;
  onSeek: (position: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
}

/** Thin transport that stays at the top of the workspace while the charts scroll under it (.playback-toolbar). */
export function PlaybackTransport({ position, duration, playing, speed, sampleIndex, sampleCount, step, onSeek, onPlayingChange, onSpeedChange }: PlaybackTransportProps) {
  const ended = !playing && duration > 0 && position >= duration;
  const label = playing ? 'Pause playback' : ended ? 'Replay recording' : 'Play recording';
  return <section className="dv-xw-transport" role="group" aria-label="Recording playback">
    <div className="dv-xw-transport-bar">
      <div className="dv-xw-transport-controls">
        <button type="button" className="dv-xw-step" aria-label="Previous sample" title={`Previous sample · ${step} s`} disabled={position <= 0} onClick={() => onSeek(Math.max(0, position - step))}><WorkspaceGlyph name="previous" /></button>
        <button type="button" className="dv-xw-play" aria-label={label} aria-keyshortcuts="Space" data-mode={playing ? 'playing' : ended ? 'ended' : 'paused'} title={`${playing ? 'Pause' : ended ? 'Replay' : 'Play'} (Space)`}
          onClick={() => { if (ended) onSeek(0); onPlayingChange(!playing); }}>
          {playing
            ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            : ended ? <svg {...strokeProps} strokeWidth={1.8}><path d="M20 7v5h-5M19 12a7 7 0 1 1-2-5l3 3" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="m8 4 12 8-12 8Z" /></svg>}
        </button>
        <button type="button" className="dv-xw-step" aria-label="Next sample" title={`Next sample · ${step} s`} disabled={position >= duration} onClick={() => onSeek(Math.min(duration, position + step))}><WorkspaceGlyph name="next" /></button>
      </div>
      <div className="dv-xw-transport-time">
        <span className="dv-xw-elapsed">{timecode(position)}</span>
        <span className="dv-xw-sample-count">Sample <span className="dv-xw-sample-index">{sampleCount ? sampleIndex + 1 : 0}</span> / {sampleCount}</span>
        <span className="dv-xw-sr">{playing ? 'Playing' : ended ? 'Ended' : 'Paused'}</span>
      </div>
      <div className="dv-xw-seek">
        <div className="dv-xw-seek-track" aria-hidden="true"><div className="dv-xw-seek-fill" style={{ width: `${duration ? position / duration * 100 : 0}%` }} /></div>
        <input type="range" className="dv-xw-timeline" min={0} max={duration} step={step} value={position} aria-label="Playback position"
          aria-valuetext={`${timecode(position)} of ${timecode(duration)}`} onChange={event => { onPlayingChange(false); onSeek(Number(event.currentTarget.value)); }} />
      </div>
      <span className="dv-xw-total">{timecode(duration)}</span>
      <label className="dv-xw-speed"><span className="dv-xw-sr">Speed</span>
        <DvSelect aria-label="Playback speed" value={String(speed)} options={SPEEDS} onChange={value => onSpeedChange(Number(value))} />
      </label>
    </div>
  </section>;
}

/** One recorded signal with its value at the playhead (.playback-chart). */
export function PlaybackChartCard({ channel, rows, position, duration }: { channel: RecordedChannel; rows: readonly RecordedSample[]; position: number; duration: number }) {
  const current = rows[sampleIndexAt(rows, position)]?.[channel.id] ?? null;
  const headingId = `dv-xw-chart-${channel.id}`;
  return <article className="dv-xw-chart" aria-labelledby={headingId} style={{ ['--dv-plot-color' as string]: channel.color }}>
    <div className="dv-xw-chart-head"><h2 id={headingId}>{channel.name}</h2><div className="dv-xw-chart-reading"><strong data-pb-value={channel.id}>{fixed(current, 3)}</strong><small>{channel.unit}</small></div></div>
    <div className="dv-xw-chart-key"><span />{channel.name}</div>
    <SignalTrace variant="playback" points={rows.map(row => ({ time: row.time, value: row[channel.id] }))} from={0} to={duration} cursor={position}
      min={channel.min} max={channel.max} unit={channel.unit} color={channel.color}
      label={`${channel.name} recorded signal; time in seconds, signal in millivolts. The playhead follows the playback position.`} />
  </article>;
}

const PAGE_SIZE = 10;
/** Paginated sample table; the row at the playhead is marked (.pb-recorded-samples). */
export function RecordedSamples({ rows, position }: { rows: readonly RecordedSample[]; position: number }) {
  const current = sampleIndexAt(rows, position), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const shown = Math.min(page, pages - 1), start = shown * PAGE_SIZE, visible = rows.slice(start, start + PAGE_SIZE);
  return <section className="dv-xw-samples" aria-labelledby="dv-xw-samples-title">
    <header><h2 id="dv-xw-samples-title">Recorded samples</h2><button type="button" className="dv-xw-link" onClick={() => setPage(Math.floor(current / PAGE_SIZE))}>Show current sample</button></header>
    <div className="dv-xw-table-frame" role="region" aria-label="Recorded samples table" tabIndex={0}>
      <table className="dv-xw-table">
        <caption className="dv-xw-sr">Sample values from the recording</caption>
        <thead><tr><th scope="col">Time<small>s</small></th><th scope="col">Mass 44<small>mV</small></th><th scope="col">Mass 45<small>mV</small></th></tr></thead>
        <tbody>{visible.map((row, i) => <tr key={row.time} data-current={start + i === current}>
          <td>{row.time.toFixed(1)}</td><td>{fixed(row.mass44, 3)}</td><td>{fixed(row.mass45, 3)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="dv-xw-pagination">
      <span>{rows.length ? `${start + 1}–${start + visible.length} of ${rows.length} samples` : 'No samples'}</span>
      <div className="dv-xw-page-actions">
        <button type="button" aria-label="First sample page" disabled={shown === 0} onClick={() => setPage(0)}>«</button>
        <button type="button" aria-label="Previous sample page" disabled={shown === 0} onClick={() => setPage(shown - 1)}>‹</button>
        <span>{shown + 1} / {pages}</span>
        <button type="button" aria-label="Next sample page" disabled={shown >= pages - 1} onClick={() => setPage(shown + 1)}>›</button>
        <button type="button" aria-label="Last sample page" disabled={shown >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
      </div>
    </div>
  </section>;
}

/** Keyboard hints under the recorded workspace (.playback-shortcuts). */
export function PlaybackShortcuts() {
  return <div className="dv-xw-shortcuts">
    <span><Kbd size="sm">Space</Kbd>Play / pause</span>
    <span><Kbd size="sm">←</Kbd><Kbd size="sm">→</Kbd>Step sample</span>
    <span><Kbd size="sm">Home</Kbd><Kbd size="sm">End</Kbd>Jump</span>
  </div>;
}

/** A labelled sidebar field (.sidebar-field). The label names only the control, not its current value. */
const SPEEDS = [0.25, 0.5, 1, 2, 4].map(value => ({ value: String(value), label: `${value}×` }));
const SCALES = [{ value: 'auto', label: 'Automatic' }, { value: 'fixed', label: 'Fixed range' }];
const PRECISIONS = [1, 2, 3, 4].map(n => ({ value: String(n), label: String(n) }));

function SideField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="dv-sidebar-field"><label htmlFor={id}>{label}</label>{children(id)}</div>;
}

/* ---------- Right sidebar panes (right-sidebar-review.html, diagnostics-review.html) ---------- */

export type ExperimentSidebarTab = 'problems' | 'details' | 'signals' | 'display';

export interface DetailsPaneProps {
  sampleName: string;
  onSampleNameChange: (value: string) => void;
  presetName: string;
  presetRevision: number;
  facts: readonly (readonly [ReactNode, ReactNode])[];
  /** Further sections, e.g. the calibration checklist or saved-result inspector. */
  children?: ReactNode;
}

export function DetailsPane({ sampleName, onSampleNameChange, presetName, presetRevision, facts, children }: DetailsPaneProps) {
  return <>
    <SidebarSection>
      <SideField label="Sample name">{id => <input id={id} value={sampleName} onChange={event => onSampleNameChange(event.currentTarget.value)} />}</SideField>
      <span className="dv-sidebar-save" role="status"><SidebarIcon name="check" />Saved</span>
    </SidebarSection>
    <SidebarSection title="Pinned preset">
      <div className="dv-sidebar-item"><span className="dv-sidebar-item-mark"><SidebarIcon name="panels" /></span><div><strong>{presetName}</strong><small>Experiment layout</small></div></div>
      <Chip icon={<SidebarIcon name="revisions" />}>R{presetRevision}</Chip>
    </SidebarSection>
    <SidebarSection title="Recording"><SidebarFacts items={facts} /></SidebarSection>
    {children}
  </>;
}

export interface SignalOption { id: string; title: string; source: string; unit: string }
export function SignalsPane({ signals, hidden, onVisibleChange, derived }: {
  signals: readonly SignalOption[];
  hidden: ReadonlySet<string>;
  onVisibleChange: (id: string, visible: boolean) => void;
  derived: readonly { title: string; detail: string }[];
}) {
  return <>
    <SidebarSection title="Visible signals">
      {signals.map(signal => <div key={signal.id} className="dv-xw-side-signal">
        <WorkspaceGlyph name="signal" />
        <div><strong>{signal.title}</strong><small>{signal.source} · {signal.unit}</small></div>
        <label className="dv-xw-switch"><input type="checkbox" role="switch" aria-label={`Show ${signal.title}`} checked={!hidden.has(signal.id)} onChange={event => onVisibleChange(signal.id, event.currentTarget.checked)} /></label>
      </div>)}
    </SidebarSection>
    <SidebarSection title="Derived outputs">
      {derived.map(item => <div key={item.title} className="dv-sidebar-item dv-xw-side-derived"><WorkspaceGlyph name="signal" /><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}
    </SidebarSection>
  </>;
}

export interface DisplaySettings { scale: 'auto' | 'fixed'; min: string; max: string; precision: number }
export function DisplayPane({ signal, settings, onChange, axes, children }: {
  /** The signal these settings apply to. */
  signal: string;
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
  axes: readonly (readonly [ReactNode, ReactNode])[];
  /** Further display sections. */
  children?: ReactNode;
}) {
  const auto = settings.scale === 'auto';
  return <>
    <SidebarSection title={signal}>
      <SideField label="Scale">{id => <DvSelect id={id} value={settings.scale} options={SCALES} onChange={value => onChange({ ...settings, scale: value as DisplaySettings['scale'] })} />}</SideField>
      <div className="dv-xw-field-pair">
        <SideField label="Minimum Y">{id => <input id={id} inputMode="decimal" value={settings.min} disabled={auto} onChange={event => onChange({ ...settings, min: event.currentTarget.value })} />}</SideField>
        <SideField label="Maximum Y">{id => <input id={id} inputMode="decimal" value={settings.max} disabled={auto} onChange={event => onChange({ ...settings, max: event.currentTarget.value })} />}</SideField>
      </div>
      <SideField label="Decimal places">{id => <DvSelect id={id} value={String(settings.precision)} options={PRECISIONS} onChange={value => onChange({ ...settings, precision: Number(value) })} />}</SideField>
      <span className="dv-sidebar-save" role="status"><SidebarIcon name="check" />Saved</span>
    </SidebarSection>
    <SidebarSection title="Axis units"><SidebarFacts items={axes} /></SidebarSection>
    {children}
  </>;
}

export interface ExperimentSidebarProps {
  tab: ExperimentSidebarTab;
  onTabChange: (tab: ExperimentSidebarTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  subtitle: ReactNode;
  problems: ProblemsPanelProps;
  details: ReactNode;
  signals: ReactNode;
  display: ReactNode;
}

/** The experiment page's right sidebar: Problems, Details, Signals and Display. */
export function ExperimentSidebar({ tab, onTabChange, collapsed, onCollapsedChange, subtitle, problems, details, signals, display }: ExperimentSidebarProps) {
  const { attention } = problemsSummary(problems.problems);
  const tabs: RightSidebarTab[] = [
    { id: 'problems', label: 'Problems', icon: <WorkspaceGlyph name="warn" />, badge: attention || undefined },
    { id: 'details', label: 'Details', icon: <SidebarIcon name="details" /> },
    { id: 'signals', label: 'Signals', icon: <SidebarIcon name="signals" /> },
    { id: 'display', label: 'Display', icon: <SidebarIcon name="display" /> },
  ];
  return <RightSidebar id="dv-experiment-sidebar" tabs={tabs} activeTab={tab} onTabChange={id => onTabChange(id as ExperimentSidebarTab)} collapsed={collapsed} onCollapsedChange={onCollapsedChange}
    subtitle={subtitle} label="Page tools" tabsLabel="Experiment tools">
    {tab === 'problems' ? <ProblemsPanel {...problems} /> : tab === 'signals' ? signals : tab === 'display' ? display : details}
  </RightSidebar>;
}

/** Wraps a workspace panel so the selected problem can flag it. */
export function Flagged({ panel, problems, selectedId, children }: { panel: string; problems: ProblemsPanelProps['problems']; selectedId?: string | null; children: ReactNode }) {
  const flag = problemFlag(problems, selectedId, panel);
  return <div className="dv-xw-panel" data-panel={panel}><AffectedPanelFlag severity={flag?.severity} label={flag?.label}>{children}</AffectedPanelFlag></div>;
}
