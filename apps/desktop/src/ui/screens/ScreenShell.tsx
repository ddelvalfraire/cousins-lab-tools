import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useOs } from '@mantine/hooks';
import identityBoard from '../../../../../design/dvdash-field-review/identity-review.png';
export { PageHeader as ScreenHeading } from '../components/PageHeader';
import { MenuGlyph, NavigationDrawer, SideNavigation, type CurrentAcquisition, type NavigationDestination, type RecentExperiment } from '../components/SideNavigation';
import { CommandGlyph, type CommandItem } from '../components/CommandCenter';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { ShellSearch, type ShellCommand, type ShellSearchHandle } from './ShellSearch';
import './screens.css';
import { ScrollFrame } from '../components/ScrollFrame';
import { useAppearance } from '../appearance';
import { appearanceTitle, commands as registryCommands, glyphOf, matchShortcut, sequenceHint, settingsRecords, shortcutSectionsFor, titleOf, type CommandId, type SequenceStart } from '../search-registry';

export type ScreenRoute = 'experiments'|'presets'|'preset'|'preset-edit'|'preset-history'|'prepare'|'experiment'|'review'|'routines'|'routine-edit'|'instruments'|'settings';
export type Navigate = (page:ScreenRoute, id?:string) => void;

/** Lists and dense pages use the wide content width, so their tables fill the card; forms and editors keep the standard width (Approved.css). */
const widePages:ReadonlySet<ScreenRoute> = new Set(['experiments','presets','routines','instruments','preset-edit','experiment','review']);

const parentOf = (page:ScreenRoute):NavigationDestination => ['preset','preset-edit','preset-history','prepare'].includes(page) ? 'presets' : ['experiment','review'].includes(page) ? 'experiments' : page==='routine-edit' ? 'routines' : page as NavigationDestination;
const pageScope:Record<ScreenRoute,string> = { experiments:'Experiments', presets:'Presets', preset:'This preset', 'preset-edit':'This preset', 'preset-history':'This preset', prepare:'This preset', experiment:'This experiment', review:'This experiment', routines:'Routines', 'routine-edit':'This routine', instruments:'Instruments', settings:'Settings' };

/* Window-bar glyphs from right-sidebar-review.html (24 px grid, 1.7 stroke). */
const glyph = (path:ReactNode) => <svg className="dv-shell-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{path}</svg>;
const icons = {
  moon: glyph(<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>),
  sun: glyph(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>),
  keyboard: glyph(<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/></>),
};

export interface ScreenShellProps {
  page:ScreenRoute;
  navigate:Navigate;
  recents?:readonly RecentExperiment[];
  acquisition?:CurrentAcquisition|null;
  /** Start with the sidebar collapsed to its rail. The collapsed state then belongs to the shell. */
  defaultCollapsed?:boolean;
  /** Switch appearance from the window bar and the command center. Defaults to the app's appearance toggle. */
  onAppearanceChange?:()=>void;
  /** Catalog records the command center finds. Choosing one navigates to its page. */
  searchRecords?:readonly SearchRecord[];
  /** The page's filter text from the search box. Pages without onPageQueryChange can't be filtered. */
  pageQuery?:string;
  onPageQueryChange?:(query:string)=>void;
  /** "New experiment…" and "Import recordings…" commands, also N and I. Hidden without a handler. */
  onNewExperiment?:()=>void;
  onImportRecordings?:()=>void;
  children:ReactNode;
}

/** A catalog record in the command center and the page it opens. */
export type SearchRecord = CommandItem & { page:ScreenRoute; pageId?:string };

/**
 * The application frame: a window bar (wordmark, search, tools) across the top; below it, on the frame
 * colour, the main sidebar and the page as a bordered, rounded card.
 * Values from design/dvdash-field-review/main-sidebar-review.html and right-sidebar-review.html (top bar).
 */
export function ScreenShell({ page, navigate, recents, acquisition, defaultCollapsed=false, onAppearanceChange, searchRecords=[], pageQuery, onPageQueryChange, onNewExperiment, onImportRecordings, children }:ScreenShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed), [drawer, setDrawer] = useState(false);
  const [shortcuts, setShortcuts] = useState(false), [announcement, setAnnouncement] = useState('');
  const appearance = useAppearance(), dark = appearance.scheme==='dark';
  const os = useOs(), mac = os==='macos' || os==='ios';
  const search = useRef<ShellSearchHandle>(null), main = useRef<HTMLDivElement>(null), sequenceStart = useRef<SequenceStart|null>(null);
  const toggleAppearance = (from?:Element) => onAppearanceChange ? onAppearanceChange() : appearance.toggle(from);
  /** Navigate from search or a shortcut, then move focus to the new page. */
  const go = (to:ScreenRoute, id?:string) => { navigate(to, id); requestAnimationFrame(()=>main.current?.focus()); };
  const context = { dark, appearance:appearance.preference };
  /** What each command does in this window. A command without a handler is left out of search, the shortcuts dialog and the keys. */
  const handlers:Record<CommandId,(()=>void)|undefined> = {
    'new-experiment':onNewExperiment, 'import-recordings':onImportRecordings,
    'command-center':()=>search.current?.openCommandCenter(), 'filter-page':()=>search.current?.focusPageSearch(),
    'go-settings':()=>go('settings'), shortcuts:()=>setShortcuts(true),
    appearance:()=>{ toggleAppearance(); setAnnouncement(`${dark?'Light':'Dark'} appearance applied.`); },
    'go-experiments':()=>go('experiments'), 'go-presets':()=>go('presets'), 'go-routines':()=>go('routines'), 'go-instruments':()=>go('instruments'),
  };
  const available = registryCommands.filter(entry => handlers[entry.id]);
  /* Commands and settings from command-center-review.html. Stop acquisition stays on the experiment page. */
  const commands:ShellCommand[] = [
    ...available.filter(entry => entry.inSearch!==false).map((entry):ShellCommand => ({ id:entry.id, kind:'actions', title:titleOf(entry, context), icon:<CommandGlyph name={glyphOf(entry, context)}/>,
      keys:entry.keys, sequence:entry.sequence, keywords:entry.keywords, featured:entry.featured, run:handlers[entry.id]! })),
    ...settingsRecords(context).map(({ glyph, page:to, target, ...record }):ShellCommand => ({ ...record, kind:'settings', icon:<CommandGlyph name={glyph}/>, run:()=>go(to) })),
    ...searchRecords.map(record => ({ ...record, run:()=>go(record.page, record.pageId) })),
  ];

  /* Window-wide shortcuts (command-center-review.html). Single keys and "G then" run outside text fields. */
  const onKey = (event:KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || shortcuts) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[role="dialog"]')) return;
    const mod = (event.metaKey || event.ctrlKey) && !event.altKey;
    const match = matchShortcut(available, {
      key:event.key, mod, otherModifier:event.altKey || event.metaKey || event.ctrlKey || event.getModifierState('AltGraph'),
      inTextField:!!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    }, sequenceStart.current, performance.now());
    if (!mod) sequenceStart.current = match && 'sequence' in match ? match.sequence : null;
    if (!match) return;
    if ('sequence' in match) { setAnnouncement(sequenceHint(available, match.sequence.key)); return; }
    event.preventDefault();
    handlers[match.command as CommandId]?.();
  };
  const keyHandler = useRef(onKey);
  useEffect(() => { keyHandler.current = onKey; });
  useEffect(() => {
    const listener = (event:KeyboardEvent) => keyHandler.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const active = parentOf(page), detail = active !== page;
  const openExperiment = (id:string) => navigate('experiment', id);
  return <div className="dv-shell" data-navigation-collapsed={collapsed}>
    <header className="dv-shell-topbar">
      <a href="#dvdash-screen-main" className="dv-skip-link">Skip to content</a>
      <button type="button" className="dv-shell-icon-button dv-shell-menu" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={drawer} onClick={()=>setDrawer(true)}><MenuGlyph/></button>
      <button type="button" className="dv-shell-wordmark" aria-label="DVDash experiments home" onClick={()=>navigate('experiments')}>
        <span className="dv-brand-concept" aria-hidden="true"><img src={identityBoard} alt=""/></span><span>DVDash</span>
      </button>
      <ShellSearch key={page} ref={search} pageLabel={pageScope[page]} pagePlaceholder={pageScope[page]==='This experiment' ? 'Find a panel, signal or setting…' : 'Search…'}
        pageQuery={pageQuery} onPageQueryChange={onPageQueryChange} commands={commands} mac={mac} onShortcuts={()=>setShortcuts(true)} onAnnounce={setAnnouncement}/>
      <div className="dv-shell-tools">
        <button type="button" className="dv-shell-icon-button" aria-label={appearanceTitle(context)} title={appearanceTitle(context)} onClick={event=>toggleAppearance(event.currentTarget)}>{dark?icons.sun:icons.moon}</button>
        <button type="button" className="dv-shell-icon-button dv-shell-shortcuts" aria-label="Show keyboard shortcuts" title="Show keyboard shortcuts · ?" onClick={()=>setShortcuts(true)}>{icons.keyboard}</button>
      </div>
    </header>
    <div className="dv-shell-workspace">
      <div className="dv-shell-sidebar"><SideNavigation active={active} detail={detail} collapsed={collapsed} onCollapsedChange={setCollapsed} onNavigate={navigate} recents={recents} acquisition={acquisition} onOpenExperiment={openExperiment}/></div>
      <div className="dv-shell-page-frame"><ScrollFrame component="main" show="scroll" ref={main} id="dvdash-screen-main" className="dv-shell-page" data-width={widePages.has(page)?'wide':'standard'} tabIndex={-1}
        rootClassName="dv-shell-page-root" contentClassName="dv-shell-page-content">{children}</ScrollFrame></div>
    </div>
    <NavigationDrawer withBar={false} opened={drawer} onOpenedChange={setDrawer} active={active} detail={detail} onNavigate={navigate} recents={recents} acquisition={acquisition} onOpenExperiment={openExperiment}/>
    <KeyboardShortcuts opened={shortcuts} onClose={()=>setShortcuts(false)} mac={mac} sections={shortcutSectionsFor(available, context)}/>
    <span className="dv-shell-sr" role="status" aria-atomic="true">{announcement}</span>
  </div>;
}

/** Page body under the shared header (.header-body padding). */
export function ScreenBody({ children, className }:{ children:ReactNode; className?:string }) {
  return <div className={className ? `dv-screen-body ${className}` : 'dv-screen-body'}>{children}</div>;
}

