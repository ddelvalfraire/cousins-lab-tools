import { useState, type ReactNode } from 'react';
import { Kbd, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import identityBoard from '../../../../../design/dvdash-field-review/identity-review.png';
export { PageHeader as ScreenHeading } from '../components/PageHeader';
import { MenuGlyph, NavigationDrawer, SideNavigation, type CurrentAcquisition, type NavigationDestination, type RecentExperiment } from '../components/SideNavigation';
import './screens.css';

export type ScreenRoute = 'experiments'|'presets'|'preset'|'preset-edit'|'preset-history'|'prepare'|'experiment'|'review'|'routines'|'routine-edit'|'instruments'|'settings';
export type Navigate = (page:ScreenRoute, id?:string) => void;

/** Dense pages that need the wide content width; every other page uses the standard width (Approved.css). */
const widePages:ReadonlySet<ScreenRoute> = new Set(['preset-edit','experiment','review']);

const parentOf = (page:ScreenRoute):NavigationDestination => ['preset','preset-edit','preset-history','prepare'].includes(page) ? 'presets' : ['experiment','review'].includes(page) ? 'experiments' : page==='routine-edit' ? 'routines' : page as NavigationDestination;
const pageScope:Record<ScreenRoute,string> = { experiments:'Experiments', presets:'Presets', preset:'This preset', 'preset-edit':'This preset', 'preset-history':'This preset', prepare:'This preset', experiment:'This experiment', review:'This experiment', routines:'Routines', 'routine-edit':'This routine', instruments:'Instruments', settings:'Settings' };

/* Window-bar glyphs from right-sidebar-review.html (24 px grid, 1.7 stroke). */
const glyph = (path:ReactNode) => <svg className="dv-shell-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{path}</svg>;
const icons = {
  search: glyph(<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>),
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
  /** Switch appearance from the window bar. Defaults to Mantine's colour-scheme toggle. */
  onAppearanceChange?:()=>void;
  /** Open the keyboard shortcuts list. */
  onShortcuts?:()=>void;
  children:ReactNode;
}

/**
 * The application frame: a window bar (wordmark, search, tools) across the top; below it, on the frame
 * colour, the main sidebar and the page as a bordered, rounded card.
 * Values from design/dvdash-field-review/main-sidebar-review.html and right-sidebar-review.html (top bar).
 */
export function ScreenShell({ page, navigate, recents, acquisition, defaultCollapsed=false, onAppearanceChange, onShortcuts, children }:ScreenShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed), [drawer, setDrawer] = useState(false), [scope, setScope] = useState<'page'|'all'>('page');
  const dark = useComputedColorScheme('light')==='dark', { toggleColorScheme } = useMantineColorScheme();
  const active = parentOf(page), detail = active !== page;
  const openExperiment = (id:string) => navigate('experiment', id);
  const placeholder = scope==='all' ? 'Search DVDash…' : pageScope[page]==='This experiment' ? 'Find a panel, signal or setting…' : 'Search…';
  return <div className="dv-shell" data-navigation-collapsed={collapsed}>
    <a href="#dvdash-screen-main" className="dv-skip-link">Skip to content</a>
    <header className="dv-shell-topbar">
      <button type="button" className="dv-shell-icon-button dv-shell-menu" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={drawer} onClick={()=>setDrawer(true)}><MenuGlyph/></button>
      <button type="button" className="dv-shell-wordmark" aria-label="DVDash experiments home" onClick={()=>navigate('experiments')}>
        <span className="dv-brand-concept" aria-hidden="true"><img src={identityBoard} alt=""/></span><span>DVDash</span>
      </button>
      <div className="dv-shell-search-anchor">
        <div className="dv-shell-searchbox" role="search" aria-label="DVDash search">
          {icons.search}
          <select aria-label="Search scope" value={scope} onChange={event=>setScope(event.currentTarget.value as 'page'|'all')}><option value="page">{pageScope[page]}</option><option value="all">All DVDash</option></select>
          <input type="search" autoComplete="off" spellCheck={false} aria-label={scope==='all'?'Search all DVDash':`Search ${pageScope[page].toLowerCase()}`} placeholder={placeholder}/>
          <span className="dv-shell-shortcut" title="Open command center · ⌘ K" aria-hidden="true"><Kbd size="xs">⌘</Kbd><Kbd size="xs">K</Kbd></span>
        </div>
      </div>
      <div className="dv-shell-tools">
        <button type="button" className="dv-shell-icon-button" aria-label={`Use ${dark?'light':'dark'} appearance`} title={`Use ${dark?'light':'dark'} appearance`} onClick={onAppearanceChange??toggleColorScheme}>{dark?icons.sun:icons.moon}</button>
        <button type="button" className="dv-shell-icon-button dv-shell-shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts · ?" onClick={onShortcuts}>{icons.keyboard}</button>
      </div>
    </header>
    <div className="dv-shell-workspace">
      <div className="dv-shell-sidebar"><SideNavigation active={active} detail={detail} collapsed={collapsed} onCollapsedChange={setCollapsed} onNavigate={navigate} recents={recents} acquisition={acquisition} onOpenExperiment={openExperiment}/></div>
      <div className="dv-shell-page-frame"><main id="dvdash-screen-main" className="dv-shell-page" data-width={widePages.has(page)?'wide':'standard'} tabIndex={-1}>{children}</main></div>
    </div>
    <NavigationDrawer withBar={false} opened={drawer} onOpenedChange={setDrawer} active={active} detail={detail} onNavigate={navigate} recents={recents} acquisition={acquisition} onOpenExperiment={openExperiment}/>
  </div>;
}

/** Page body under the shared header (.header-body padding). */
export function ScreenBody({ children, className }:{ children:ReactNode; className?:string }) {
  return <div className={className ? `dv-screen-body ${className}` : 'dv-screen-body'}>{children}</div>;
}

