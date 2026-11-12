import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Drawer } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import identityBoard from '../../../../../design/dvdash-field-review/identity-review.png';
import { StatusWord } from './Chip';
import './SideNavigation.css';

export type NavigationDestination = 'experiments' | 'presets' | 'routines' | 'instruments' | 'settings';
export type NavigationLabelKey = NavigationDestination | 'workspace' | 'recent' | 'collapse' | 'expand';

/** How a recent experiment last appeared: still acquiring, finished recording, or opened earlier. */
export type RecentExperimentState = 'live' | 'recorded' | 'opened';
export interface RecentExperiment {
  id: string;
  /** Sample or run name, e.g. "Sample 025". */
  title: string;
  /** Experiment kind, e.g. "Leaf respiration". */
  subtitle: string;
  state: RecentExperimentState;
  tone?: 'accent' | 'violet';
}

/** The acquisition that is running now. */
export interface CurrentAcquisition {
  experimentId: string;
  title: string;
  /** Data source, e.g. "Simulator". */
  source: string;
  samples: number;
  /** Elapsed time as shown, e.g. "00:43". */
  elapsed: string;
  /** Recent values for the sparkline, oldest first. */
  trace?: readonly number[];
}

export interface SideNavigationProps {
  active?: NavigationDestination;
  collapsed?: boolean;
  /** The current page is a detail page inside `active` (an experiment, a preset). The parent stays selected. */
  detail?: boolean;
  /** Show the Collapse button. */
  collapsible?: boolean;
  labels?: Partial<Record<NavigationLabelKey, string>>;
  /** Recent experiments, newest first. Empty hides the section. */
  recents?: readonly RecentExperiment[];
  /** The running acquisition. Omit when nothing is running. */
  acquisition?: CurrentAcquisition | null;
  onNavigate?: (destination: NavigationDestination) => void;
  onOpenExperiment?: (experimentId: string) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** @deprecated The approved sidebar has no appearance control; appearance lives in Settings. Accepted for compatibility. */
  dark?: boolean;
  /** @deprecated The approved sidebar has no appearance control; appearance lives in Settings. Accepted for compatibility. */
  onAppearanceChange?: () => void;
}

const defaultLabels: Record<NavigationLabelKey, string> = {
  experiments: 'Experiments', presets: 'Presets', routines: 'Routines', instruments: 'Instruments', settings: 'Settings',
  workspace: 'Workspace', recent: 'Recent experiments', collapse: 'Collapse', expand: 'Expand',
};

/* Glyphs drawn for the approved sidebar review (24 px grid, 1.6 stroke). */
const glyphs = {
  flask: <path d="M9 3h6m-5 0v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M7 15h10" />,
  layout: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M10 9v12" /></>,
  routine: <><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M6 8v8h9M12 13l3 3-3 3" /></>,
  instrument: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M6 9h8v5H6zm11 0h1m-1 4h1M6 17h12" /></>,
  history: <path d="M3 11a9 9 0 1 1 3 8M3 5v6h6M12 6v6l4 2" />,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
  sidebar: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m7-13-3 4 3 4" /></>,
  expand: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m4-13 3 4-3 4" /></>,
  measure: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
} satisfies Record<string, ReactNode>;
type GlyphName = keyof typeof glyphs;

function Glyph({ name, strokeWidth = 1.6 }: { name: GlyphName; strokeWidth?: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{glyphs[name]}</svg>;
}

const destinations = [
  { id: 'experiments', icon: 'flask' },
  { id: 'presets', icon: 'layout' },
  { id: 'routines', icon: 'routine' },
  { id: 'instruments', icon: 'instrument' },
] as const;

const recentGlyph: Record<RecentExperimentState, GlyphName> = { live: 'measure', recorded: 'check', opened: 'flask' };
const recentStateWord: Record<RecentExperimentState, string> = { live: 'Live', recorded: 'Recorded', opened: 'Opened recently' };

/** The DVDash wordmark with the approved logo crop at 28 px. Lives in the window bar, and in the drawer head. */
export function Brand() {
  return <span className="dv-navigation-brand">
    <span className="dv-brand-concept" aria-hidden="true"><img src={identityBoard} alt="" /></span>
    <span className="dv-navigation-wordmark">DVDash</span>
  </span>;
}

/** Hamburger glyph for the compact-window menu button. */
export function MenuGlyph() { return <Glyph name="menu" strokeWidth={1.7} />; }

function RecentItem({ recent, onOpen }: { recent: RecentExperiment; onOpen: (id: string) => void }) {
  const live = recent.state === 'live';
  return <button type="button" className="dv-navigation-recent" title={`Open ${recent.subtitle} · ${recent.title}`} onClick={() => onOpen(recent.id)}>
    <span className="dv-navigation-recent-glyph" data-tone={recent.tone ?? 'accent'}><Glyph name={recentGlyph[recent.state]} /></span>
    <span className="dv-navigation-recent-copy"><strong>{recent.title}</strong><small>{recent.subtitle}</small></span>
    <span className="dv-navigation-recent-state" data-live={live || undefined}>
      {live ? 'Live' : <><Glyph name={recent.state === 'opened' ? 'history' : 'check'} /><span className="dv-navigation-sr">{recentStateWord[recent.state]}</span></>}
    </span>
  </button>;
}

/** Sparkline path in a 100 × 32 box, scaled to the trace's own range. */
function sparkPath(trace: readonly number[]) {
  if (trace.length < 2) return '';
  const min = Math.min(...trace), max = Math.max(...trace), span = max - min || 1;
  return trace.map((value, i) => `${i ? 'L' : 'M'}${(i / (trace.length - 1) * 100).toFixed(2)} ${(22 - (value - min) / span * 11).toFixed(2)}`).join(' ');
}

function AcquisitionCard({ acquisition, onOpen }: { acquisition: CurrentAcquisition; onOpen: (id: string) => void }) {
  return <section className="dv-navigation-acquisition" aria-label="Current acquisition">
    <div className="dv-navigation-acquisition-status"><StatusWord tone="accent" icon={<Glyph name="measure" />}>Acquiring</StatusWord><span className="dv-navigation-acquisition-source">{acquisition.source}</span></div>
    <button type="button" className="dv-navigation-acquisition-title" onClick={() => onOpen(acquisition.experimentId)}>{acquisition.title} <Glyph name="arrow" /></button>
    <svg className="dv-navigation-acquisition-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={sparkPath(acquisition.trace ?? [])} fill="none" stroke="var(--dv-blue)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
    <div className="dv-navigation-acquisition-numbers"><span><b>{acquisition.samples.toLocaleString('en-US')}</b> samples</span><span>{acquisition.elapsed}</span></div>
  </section>;
}

function Sidebar({ active = 'experiments', collapsed = false, detail = false, collapsible = true, labels = {}, recents = [], acquisition, inDrawer = false, onNavigate, onOpenExperiment, onCollapsedChange }: SideNavigationProps & { inDrawer?: boolean }) {
  const L = { ...defaultLabels, ...labels };
  const id = useId();
  const navRefs = useRef<Partial<Record<NavigationDestination, HTMLButtonElement | null>>>({});
  const triggerRef = useRef<HTMLButtonElement>(null), flyoutRef = useRef<HTMLDivElement>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false), [flyoutTop, setFlyoutTop] = useState(0);
  const showFlyout = flyoutOpen && collapsed && !inDrawer && recents.length > 0;

  useEffect(() => {
    if (!showFlyout) return;
    flyoutRef.current?.querySelector('button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setFlyoutOpen(false); triggerRef.current?.focus(); } };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!flyoutRef.current?.contains(target) && !triggerRef.current?.contains(target)) setFlyoutOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [showFlyout]);

  const openExperiment = (experimentId: string) => {
    setFlyoutOpen(false);
    onOpenExperiment?.(experimentId);
    if (!inDrawer) navRefs.current.experiments?.focus();
  };
  const navItem = (destination: NavigationDestination, icon: GlyphName) => {
    const current = active === destination;
    return <button key={destination} ref={node => { navRefs.current[destination] = node; }} type="button" className="dv-navigation-item"
      data-tip={L[destination]} aria-current={current ? 'page' : undefined} data-autofocus={inDrawer && current ? true : undefined}
      onClick={() => { setFlyoutOpen(false); onNavigate?.(destination); }}>
      <Glyph name={icon} /><span className="dv-navigation-label">{L[destination]}</span>
    </button>;
  };

  return <aside id={id} className="dv-side-navigation" data-collapsed={collapsed} data-detail={detail || undefined} aria-label="Sidebar">
    <nav className="dv-navigation-section" aria-label="Main navigation">
      <div className="dv-navigation-eyebrow" aria-hidden="true">{L.workspace}</div>
      {destinations.map(({ id: destination, icon }) => navItem(destination, icon))}
    </nav>
    {recents.length > 0 && <section className="dv-navigation-recents" aria-label={L.recent}>
      <div className="dv-navigation-eyebrow" aria-hidden="true">{L.recent}</div>
      {!inDrawer && <button ref={triggerRef} type="button" className="dv-navigation-item dv-navigation-recents-trigger" data-tip={L.recent} aria-label={L.recent}
        aria-haspopup="dialog" aria-expanded={showFlyout}
        onClick={() => { setFlyoutTop(triggerRef.current?.offsetTop ?? 0); setFlyoutOpen(open => !open); }}>
        <Glyph name="history" />
      </button>}
      {recents.map(recent => <RecentItem key={recent.id} recent={recent} onOpen={openExperiment} />)}
    </section>}
    <div className="dv-navigation-bottom">
      {acquisition && <>
        <AcquisitionCard acquisition={acquisition} onOpen={openExperiment} />
        {!inDrawer && <button type="button" className="dv-navigation-item dv-navigation-rail-acquisition" data-tip={`${acquisition.title} · Acquiring`}
          aria-label={`Open current acquisition, ${acquisition.title}`} onClick={() => openExperiment(acquisition.experimentId)}>
          <Glyph name="measure" />
        </button>}
      </>}
      <div className="dv-navigation-section">
        {navItem('settings', 'settings')}
        {collapsible && !inDrawer && <button type="button" className="dv-navigation-item" data-tip={collapsed ? L.expand : L.collapse}
          aria-expanded={!collapsed} aria-controls={id} onClick={() => { setFlyoutOpen(false); onCollapsedChange?.(!collapsed); }}>
          <Glyph name={collapsed ? 'expand' : 'sidebar'} /><span className="dv-navigation-label">{collapsed ? L.expand : L.collapse}</span>
        </button>}
      </div>
    </div>
    {showFlyout && <div ref={flyoutRef} className="dv-navigation-flyout" role="dialog" aria-label={L.recent} style={{ top: flyoutTop }}>
      {recents.map(recent => <RecentItem key={recent.id} recent={recent} onOpen={openExperiment} />)}
    </div>}
  </aside>;
}

/**
 * Controlled main sidebar: 184 px expanded, a 58 px rail when collapsed.
 * Routing, the collapsed state and the recent/acquisition data stay with the host.
 */
export function SideNavigation(props: SideNavigationProps) {
  return <Sidebar {...props} />;
}

export interface NavigationDrawerProps extends Omit<SideNavigationProps, 'collapsed' | 'onCollapsedChange' | 'collapsible'> {
  /** Controlled open state. Omit to let the drawer's own menu button open it. */
  opened?: boolean;
  onOpenedChange?: (opened: boolean) => void;
  /** Render the compact menu bar with its menu button. Hosts with their own window bar pass `false`. */
  withBar?: boolean;
}

/** The same sidebar as a focus-trapped drawer for compact windows. Focus returns to the menu button on close. */
export function NavigationDrawer({ onNavigate, onOpenExperiment, opened: openedProp, onOpenedChange, withBar = true, ...props }: NavigationDrawerProps) {
  const [ownOpened, setOwnOpened] = useState(false);
  const opened = openedProp ?? ownOpened;
  const setOpened = (value: boolean) => { setOwnOpened(value); onOpenedChange?.(value); };
  const reducedMotion = useReducedMotion();
  const close = () => setOpened(false);
  return <>
    {withBar && <header className="dv-mobile-navigation">
      <button type="button" className="dv-navigation-icon-button dv-navigation-menu" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={opened} onClick={() => setOpened(true)}><MenuGlyph /></button>
      <Brand />
    </header>}
    <Drawer.Root opened={opened} onClose={close} size={280} position="left" transitionProps={{ duration: reducedMotion ? 0 : 220, timingFunction: 'cubic-bezier(.22,1,.36,1)' }}>
      <Drawer.Overlay transitionProps={{ duration: reducedMotion ? 0 : 180 }} />
      <Drawer.Content aria-label="Navigation" className="dvdash dv-navigation-drawer">
        <div className="dv-navigation-drawer-head">
          <Brand />
          <button type="button" className="dv-navigation-icon-button dv-navigation-close" aria-label="Close navigation" onClick={close}><Glyph name="close" strokeWidth={1.7} /></button>
        </div>
        <Sidebar {...props} inDrawer collapsed={false} collapsible={false}
          onNavigate={destination => { onNavigate?.(destination); close(); }}
          onOpenExperiment={experimentId => { onOpenExperiment?.(experimentId); close(); }} />
      </Drawer.Content>
    </Drawer.Root>
  </>;
}
