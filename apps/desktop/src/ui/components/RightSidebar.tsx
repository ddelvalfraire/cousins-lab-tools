import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { keyedBy } from './keyedBy';
import './Approved.css';
import './RightSidebar.css';
import { Swap } from './Motion';
import { ScrollFrame } from './ScrollFrame';

export interface RightSidebarTab {
  id: string;
  label: string;
  /** Shorter rail label for windows 600 px wide or less; the tab's name stays `label`. */
  shortLabel?: string;
  icon: ReactNode;
  /** Optional count, e.g. issues on this tab. */
  badge?: number | string;
  disabled?: boolean;
}

export interface RightSidebarProps {
  tabs: readonly RightSidebarTab[];
  /** Controlled selected tab. */
  activeTab?: string;
  defaultTab?: string;
  onTabChange?: (id: string) => void;
  /** Controlled collapsed state. Collapsed keeps only the tab rail. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Pane heading. Defaults to the selected tab's label. */
  title?: ReactNode;
  /** Context under the heading, e.g. the page or selection it applies to. */
  subtitle?: ReactNode;
  /** Name of the sidebar region. */
  label?: string;
  /** Name of the tab list. */
  tabsLabel?: string;
  /** Prefix for the tab and pane ids. */
  id?: string;
  /** Hide the collapse button. */
  collapsible?: boolean;
  /** A new value opens the sheet in a narrow page, e.g. when the page selects another item for the pane. */
  revealKey?: string | number;
  /** Pane content for the selected tab. */
  children?: ReactNode;
}

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;
/** The mockup's sidebar glyphs (right-sidebar-review.html, sideIcons). */
const glyphs = {
  details: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  signals: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  display: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  parameters: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </>
  ),
  panels: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M11 10v10" />
    </>
  ),
  revisions: <path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2" />,
  collapse: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16m-7-11 3 3-3 3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
} as const;
export type SidebarIconName = keyof typeof glyphs;
export function SidebarIcon({ name }: { name: SidebarIconName }) {
  return <svg {...stroke}>{glyphs[name]}</svg>;
}
const CollapseGlyph = () => <SidebarIcon name="collapse" />;

/** Below this page width the pane opens as a sheet over the content instead of taking width from it. */
export const RIGHT_SIDEBAR_SHEET_BELOW = 800;

/**
 * True while the page holding the sidebar is narrower than `RIGHT_SIDEBAR_SHEET_BELOW`: the frame's page card, or
 * the WorkspaceBody outside the frame. A sidebar on its own stays docked.
 * The card is measured whole, padding included, because its padding follows the sidebar's own width.
 */
function useSheetMode(ref: RefObject<HTMLElement | null>) {
  const [sheet, setSheet] = useState(false);
  useLayoutEffect(() => {
    const grid = ref.current?.parentElement;
    if (!grid?.classList.contains('dv-workspace-grid')) return;
    const host = grid.closest<HTMLElement>('.dv-shell-page') ?? grid;
    const update = () => setSheet(host.clientWidth < RIGHT_SIDEBAR_SHEET_BELOW);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [ref]);
  return sheet;
}

/**
 * Page tools docked to the right edge of the page: in the application frame at the page card's full height beside
 * the header, elsewhere beneath it. A pane with a title, subtitle and
 * collapse button, then a labelled vertical tab rail. Collapsing slides the pane away and keeps only the rail.
 * In a page narrower than 800 px the rail stays and the pane opens as a sheet over the content;
 * Escape, the collapse button or a click outside closes it.
 * Values from design/dvdash-field-review/right-sidebar-review.html.
 */
export function RightSidebar({
  tabs,
  activeTab,
  defaultTab,
  onTabChange,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  title,
  subtitle,
  label = 'Page tools',
  tabsLabel,
  id,
  collapsible = true,
  revealKey,
  children,
}: RightSidebarProps) {
  const autoId = useId(),
    base = id ?? autoId;
  const [ownTab, setOwnTab] = useState(
    defaultTab ?? tabs.find((tab) => !tab.disabled)?.id ?? tabs[0]?.id,
  );
  const [ownCollapsed, setOwnCollapsed] = useState(defaultCollapsed);
  const selected = activeTab ?? ownTab,
    isCollapsed = collapsed ?? ownCollapsed;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const asideRef = useRef<HTMLElement>(null),
    sheet = useSheetMode(asideRef);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet starts closed whenever the page becomes narrow.
  useEffect(() => {
    if (!sheet) setSheetOpen(false);
  }, [sheet]);
  // A page that opens the sidebar itself (another tab, or expanded) opens the sheet too.
  const requested = useRef({ activeTab, collapsed, revealKey });
  useEffect(() => {
    const before = requested.current;
    requested.current = { activeTab, collapsed, revealKey };
    if (
      sheet &&
      collapsed !== true &&
      (before.activeTab !== activeTab ||
        before.collapsed !== collapsed ||
        before.revealKey !== revealKey)
    )
      setSheetOpen(true);
  }, [sheet, activeTab, collapsed, revealKey]);
  const open = sheet ? sheetOpen : !isCollapsed;
  const tabId = (tab: string) => `${base}-tab-${tab}`,
    paneId = `${base}-pane`;
  const current = tabs.find((tab) => tab.id === selected);

  const setCollapsed = (value: boolean) => {
    setOwnCollapsed(value);
    onCollapsedChange?.(value);
  };
  const select = (tab: string, focus = false) => {
    setOwnTab(tab);
    onTabChange?.(tab);
    if (sheet) setSheetOpen(true);
    else if (isCollapsed) setCollapsed(false);
    if (focus) tabRefs.current[tab]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const i = enabled.findIndex((tab) => tab.id === selected);
    const next =
      event.key === 'ArrowDown'
        ? (i + 1) % enabled.length
        : event.key === 'ArrowUp'
          ? (i + enabled.length - 1) % enabled.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? enabled.length - 1
              : null;
    if (next === null || !enabled.length) return;
    event.preventDefault();
    select(enabled[next].id, true);
  };
  const focusSelected = () => {
    if (selected)
      requestAnimationFrame(() => tabRefs.current[selected]?.focus());
  };
  const collapse = () => {
    if (sheet) setSheetOpen(false);
    else setCollapsed(true);
    focusSelected();
  };
  const onSidebarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !sheet || !sheetOpen) return;
    event.stopPropagation();
    setSheetOpen(false);
    focusSelected();
  };

  // The sheet closes on a click outside the sidebar.
  useEffect(() => {
    if (!sheet || !sheetOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!asideRef.current?.contains(event.target as Node))
        setSheetOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [sheet, sheetOpen]);

  return (
    <aside
      ref={asideRef}
      className="dv-right-sidebar"
      data-mode={sheet ? 'sheet' : 'docked'}
      data-collapsed={!open}
      aria-label={label}
      onKeyDown={onSidebarKeyDown}
    >
      <section
        className="dv-right-sidebar-pane"
        id={paneId}
        role="tabpanel"
        aria-labelledby={selected ? tabId(selected) : undefined}
        tabIndex={open ? 0 : -1}
        inert={!open}
        aria-hidden={!open || undefined}
      >
        <div className="dv-right-sidebar-title">
          <div>
            <h2>{title ?? current?.label}</h2>
            {subtitle && <small>{subtitle}</small>}
          </div>
          {collapsible && (
            <button
              type="button"
              className="dv-right-sidebar-collapse"
              aria-label="Collapse right sidebar"
              title="Collapse sidebar"
              onClick={collapse}
            >
              <CollapseGlyph />
            </button>
          )}
        </div>
        <ScrollFrame
          axes="y"
          overscroll="contain"
          rootClassName="dv-right-sidebar-content-root"
          className="dv-right-sidebar-content"
        >
          <Swap swapKey={selected ?? ''}>{children}</Swap>
        </ScrollFrame>
      </section>
      <ScrollFrame
        axes="y"
        rootClassName="dv-right-sidebar-tabs-root"
        contentClassName="dv-right-sidebar-tabs-list"
        className="dv-right-sidebar-tabs"
        role="tablist"
        aria-label={tabsLabel ?? label}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              data-tab={tab.id}
              aria-controls={paneId}
              aria-selected={isSelected}
              aria-expanded={open && isSelected}
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabled}
              title={tab.label}
              onClick={() => select(tab.id)}
            >
              {tab.icon}
              <span className="dv-right-sidebar-label">{tab.label}</span>
              {tab.shortLabel && (
                <span className="dv-right-sidebar-short" aria-hidden="true">
                  {tab.shortLabel}
                </span>
              )}
              {tab.badge !== undefined && (
                <>
                  <span className="dv-right-sidebar-badge" aria-hidden="true">
                    {tab.badge}
                  </span>
                  <span className="dv-right-sidebar-sr">, {tab.badge}</span>
                </>
              )}
            </button>
          );
        })}
      </ScrollFrame>
    </aside>
  );
}

export interface WorkspaceBodyProps {
  /** The sidebar, usually a `RightSidebar`. The grid shrinks to the rail when it collapses. */
  sidebar: ReactNode;
  /** Name of the main column, which scrolls on its own and so is a focusable region. */
  label?: string;
  children: ReactNode;
}

/**
 * Page body with the main column and the right sidebar docked to the page's right edge.
 * Inside the frame the body fills the page below the header and the sidebar docks to the card's right edge at full
 * height; the card makes room for it, so the header and the main column centre in the rest.
 * Outside the frame the main column follows the shared page width (--dv-page-gutter) and the sidebar takes width
 * from its right margin only where needed. The main column and the sidebar scroll on their own.
 */
export function WorkspaceBody({
  sidebar,
  label = 'Page content',
  children,
}: WorkspaceBodyProps) {
  return (
    <div className="dv-workspace-body">
      <div className="dv-workspace-grid">
        <ScrollFrame
          rootClassName="dv-workspace-main-root"
          className="dv-workspace-main"
          role="region"
          aria-label={label}
          tabIndex={0}
        >
          {children}
        </ScrollFrame>
        {sidebar}
      </div>
    </div>
  );
}

/** A titled section of sidebar content, separated by a rule (.sidebar-section). */
export function SidebarSection({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dv-sidebar-section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

/** Label–value pairs (.side-facts). */
export function SidebarFacts({
  items,
}: {
  items: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <dl className="dv-sidebar-facts">
      {keyedBy(items, ([term]) => term).map(({ key, item: [term, value] }) => (
        <div key={key}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
