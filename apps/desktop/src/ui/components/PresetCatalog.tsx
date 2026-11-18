import { type ReactNode, useId, useMemo, useState } from 'react';
import { pages } from '../search-registry';
import { formatClockTime } from '../time';
import {
  CatalogAction,
  CatalogChip,
  CatalogFilter,
  CatalogFrame,
  CatalogPagination,
  CatalogRoot,
  type CatalogSort,
  CatalogState,
  CatalogToolbar,
  focusPane,
  normalize,
  SidebarEmpty,
  SortHeader,
  useCatalogPage,
  useCatalogQuery,
  useCatalogSort,
} from './CatalogTable';
import { keyedBy } from './keyedBy';
import { MotionList, Presence, Swap } from './Motion';
import { HeaderButton, type PageBreadcrumb, PageHeader } from './PageHeader';
import {
  RightSidebar,
  SidebarFacts,
  SidebarIcon,
  SidebarSection,
  WorkspaceBody,
} from './RightSidebar';

export interface CatalogPresetPanel {
  kind: 'line' | 'multi' | 'scatter' | 'readout' | 'input' | 'table';
  /** Position and size in percent of the layout (0–100). */
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  unit: string;
}
export interface CatalogPreset {
  id: string;
  name: string;
  description: string;
  revision: number;
  /** Local ISO date-time of the current revision. */
  updated: string;
  panels: readonly CatalogPresetPanel[];
}
export type PresetSortKey = 'name' | 'panels' | 'revision' | 'updated';
export type PresetSidebarTab = 'details' | 'panels' | 'revisions';

export interface PresetCatalogProps {
  presets: readonly CatalogPreset[];
  /** Search text from the window bar. Filters names and descriptions. */
  query?: string;
  onClearQuery?: () => void;
  /** Use the preset for a new experiment. */
  onUse: (id: string) => void;
  /** Open the preset's own page. */
  onOpen?: (id: string) => void;
  onImport?: () => void;
  /** Shows the New preset header button. */
  onNewPreset?: () => void;
  breadcrumbs?: readonly PageBreadcrumb[];
  initialSort?: CatalogSort<PresetSortKey>;
  initialView?: 'list' | 'grid';
  /** Preset shown in the sidebar. Opens the sidebar unless `initialCollapsed`. */
  initialSelected?: string | null;
  initialTab?: PresetSidebarTab;
  initialCollapsed?: boolean;
}

const MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', MONTH);
const fullDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { ...MONTH, year: 'numeric' });
const time = (iso: string) => formatClockTime(iso);
const noun = (n: number) => `${n} ${n === 1 ? 'preset' : 'presets'}`;
const KIND_LABEL: Record<CatalogPresetPanel['kind'], string> = {
  line: 'Line chart',
  multi: 'Multi-series chart',
  scatter: 'Scatter plot',
  readout: 'Readout',
  input: 'Input',
  table: 'Table',
};

const presetGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 10h18M10 10v11" />
  </svg>
);
const importGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" />
  </svg>
);

/** Panels never overlap, so a panel's corner names it. */
const tilePlace = (tile: { x: number; y: number }) => `${tile.x},${tile.y}`;
const panelName = (panel: CatalogPresetPanel) => panel.name;

/** Panel geometry on a 100 × 70 canvas, never a screenshot (.preset-thumb). */
export function PresetThumb({
  panels,
}: {
  panels: readonly CatalogPresetPanel[];
}) {
  const tiles = keyedBy(panels, tilePlace);
  return (
    <span className="dv-cat-thumb" aria-hidden="true">
      <svg
        viewBox="0 0 100 70"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
      >
        {tiles.map(({ key, item: { kind, x, y, w, h } }) => {
          const height = h * 0.7;
          let inner: ReactNode;
          if (kind === 'line' || kind === 'multi')
            inner = (
              <>
                <path
                  className="dv-cat-trace"
                  d={`M4 ${height * 0.6} Q ${w * 0.2} ${height * 0.2} ${w * 0.35} ${height * 0.5} T ${w * 0.65} ${height * 0.55} T ${w - 4} ${height * 0.35}`}
                />
                {kind === 'multi' && (
                  <path
                    className="dv-cat-trace-alt"
                    d={`M4 ${height * 0.35} Q ${w * 0.35} ${height * 0.8} ${w - 4} ${height * 0.55}`}
                  />
                )}
              </>
            );
          else if (kind === 'scatter')
            inner = (
              <>
                <path
                  className="dv-cat-trace-alt"
                  d={`M5 ${height - 5} L${w - 5} 5`}
                />
                {[
                  [0.2, 0.7],
                  [0.35, 0.63],
                  [0.5, 0.47],
                  [0.68, 0.3],
                  [0.83, 0.24],
                ].map(([a, b]) => (
                  <circle
                    key={a}
                    cx={w * a}
                    cy={height * b}
                    r={1.2}
                    fill="var(--dv-blue)"
                  />
                ))}
              </>
            );
          else if (kind === 'table')
            inner = (
              <path
                d={`M3 7h${w - 6}m-${w - 6} 6h${w - 6}m-${w - 6} 6h${w - 6}`}
                stroke="var(--dv-line)"
                strokeWidth={1}
              />
            );
          else if (kind === 'readout')
            inner = (
              <>
                <rect
                  x={5}
                  y={height * 0.35}
                  width={w * 0.35}
                  height={3}
                  rx={1}
                  fill="var(--dv-ink)"
                  opacity={0.45}
                />
                <rect
                  x={5}
                  y={height * 0.62}
                  width={w * 0.6}
                  height={1}
                  fill="var(--dv-line)"
                />
              </>
            );
          else
            inner = (
              <rect
                x={4}
                y={height * 0.3}
                width={w - 8}
                height={height * 0.45}
                rx={1.5}
                fill="var(--dv-soft)"
                stroke="var(--dv-line)"
                strokeWidth={0.5}
              />
            );
          return (
            <g key={key} transform={`translate(${x} ${y * 0.7})`}>
              <rect
                className="dv-cat-tile"
                x={0.5}
                y={0.5}
                width={w - 1}
                height={height - 1}
                rx={2}
              />
              {inner}
            </g>
          );
        })}
      </svg>
    </span>
  );
}

function compare(key: PresetSortKey, a: CatalogPreset, b: CatalogPreset) {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'panels':
      return a.panels.length - b.panels.length;
    case 'revision':
      return a.revision - b.revision;
    case 'updated':
      return new Date(a.updated).getTime() - new Date(b.updated).getTime();
  }
}

/**
 * Presets catalog: sortable list (or grid) of preset definitions with layout thumbnails, a quiet "Use preset" action,
 * and the selected preset in the right sidebar. Values from design/dvdash-field-review/preset-catalog-review.html.
 */
export function PresetCatalog({
  presets,
  query = '',
  onClearQuery,
  onUse,
  onOpen,
  onImport,
  onNewPreset,
  breadcrumbs = [{ label: 'Workspace' }, { label: 'Presets' }],
  initialSort = { key: 'name', ascending: true },
  initialView = 'list',
  initialSelected = null,
  initialTab = 'details',
  initialCollapsed,
}: PresetCatalogProps) {
  const sidebarId = useId().replace(/:/g, '');
  const [search, clearSearch] = useCatalogQuery(query, onClearQuery);
  const [sort, sortBy] = useCatalogSort<PresetSortKey>(initialSort);
  const [view, setView] = useState(initialView);
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [tab, setTab] = useState<string>(initialTab);
  const [collapsed, setCollapsed] = useState(
    initialCollapsed ?? !initialSelected,
  );
  const [reveal, setReveal] = useState(0);

  const rows = useMemo(
    () =>
      presets
        .filter(
          (p) =>
            !search ||
            normalize(`${p.name} ${p.description}`).includes(normalize(search)),
        )
        .sort((a, b) => compare(sort.key, a, b) * (sort.ascending ? 1 : -1)),
    [presets, search, sort],
  );
  const pager = useCatalogPage(rows.length);
  const visible = rows.slice(pager.start, pager.end);
  const selected = presets.find((p) => p.id === selectedId) ?? null;

  const open = (id: string) => {
    setSelectedId(id);
    setTab('details');
    setCollapsed(false);
    setReveal((n) => n + 1);
    focusPane(sidebarId);
  };
  const use = (p: CatalogPreset) => (
    <CatalogAction label={`Use preset: ${p.name}`} onClick={() => onUse(p.id)}>
      Use preset
    </CatalogAction>
  );
  const name = (p: CatalogPreset) => (
    <button
      type="button"
      className="dv-cat-name"
      data-preset-open={p.id}
      onClick={() => open(p.id)}
    >
      {p.name}
    </button>
  );

  let body: ReactNode;
  if (!presets.length)
    body = (
      <CatalogState
        icon={<SidebarIcon name="panels" />}
        title="No presets yet"
        message="Import a definition or create your first preset."
      />
    );
  else if (!rows.length)
    body = (
      <CatalogState
        icon={<SidebarIcon name="panels" />}
        title="No matching presets"
        message="Try another name in the search above."
        action={
          <button type="button" className="dv-cat-plain" onClick={clearSearch}>
            Clear search
          </button>
        }
      />
    );
  else if (view === 'list')
    body = (
      <CatalogFrame label="Preset catalog">
        <table className="dv-cat-table" data-catalog="presets">
          <caption className="dv-cat-sr">Reusable experiment layouts</caption>
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortHeader
                sortKey="name"
                label="Preset"
                sort={sort}
                onSort={sortBy}
              />
              <SortHeader
                sortKey="panels"
                label="Panels"
                sort={sort}
                onSort={sortBy}
              />
              <SortHeader
                sortKey="revision"
                label="Revision"
                sort={sort}
                onSort={sortBy}
              />
              <SortHeader
                sortKey="updated"
                label="Updated"
                sort={sort}
                onSort={sortBy}
              />
              <th scope="col">
                <span className="dv-cat-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <MotionList resetKey={pager.start}>
              {visible.map((p) => (
                <tr key={p.id} data-selected={selected?.id === p.id}>
                  <td>
                    <div className="dv-cat-identity">
                      <PresetThumb panels={p.panels} />
                      <div>
                        {name(p)}
                        <p className="dv-cat-description">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <CatalogChip
                      icon="panels"
                      title={`${p.panels.length} panels`}
                    >
                      {p.panels.length}
                    </CatalogChip>
                  </td>
                  <td>
                    <CatalogChip
                      icon="revisions"
                      title={`Revision ${p.revision}`}
                    >
                      R{p.revision}
                    </CatalogChip>
                  </td>
                  <td>
                    <span className="dv-cat-date">
                      {day(p.updated)}
                      <small>{time(p.updated)}</small>
                    </span>
                  </td>
                  <td>{use(p)}</td>
                </tr>
              ))}
            </MotionList>
          </tbody>
        </table>
      </CatalogFrame>
    );
  else
    body = (
      <div className="dv-cat-grid">
        <MotionList resetKey={pager.start}>
          {visible.map((p) => (
            <article key={p.id} className="dv-cat-tile-card">
              <button
                type="button"
                className="dv-cat-tile-preview"
                aria-label={`Preview ${p.name}`}
                onClick={() => open(p.id)}
              >
                <PresetThumb panels={p.panels} />
              </button>
              <div className="dv-cat-tile-body">
                {name(p)}
                <p className="dv-cat-description">{p.description}</p>
                <div className="dv-cat-meta">
                  <CatalogChip icon="panels">
                    {p.panels.length} panels
                  </CatalogChip>
                  <CatalogChip icon="revisions">R{p.revision}</CatalogChip>
                </div>
                <div className="dv-cat-tile-bottom">
                  <span className="dv-cat-description">
                    Updated {day(p.updated)}
                  </span>
                  {use(p)}
                </div>
              </div>
            </article>
          ))}
        </MotionList>
      </div>
    );

  let pane: ReactNode;
  if (!selected)
    pane = (
      <SidebarEmpty
        icon={<SidebarIcon name="panels" />}
        title="Select a preset"
        message="Open a preset name to inspect its layout and definition."
      />
    );
  else if (tab === 'panels')
    pane = (
      <SidebarSection title={`${selected.panels.length} panels`}>
        {keyedBy(selected.panels, panelName).map(({ key, item }) => (
          <div key={key} className="dv-cat-side-signal">
            <SidebarIcon
              name={
                item.kind === 'line' ||
                item.kind === 'multi' ||
                item.kind === 'scatter'
                  ? 'signals'
                  : 'panels'
              }
            />
            <div>
              <strong>{item.name}</strong>
              <small>
                {KIND_LABEL[item.kind]}
                {item.unit && ` · ${item.unit}`}
              </small>
            </div>
          </div>
        ))}
      </SidebarSection>
    );
  else if (tab === 'revisions')
    pane = (
      <>
        <article className="dv-cat-side-revision">
          <header>
            <strong>R{selected.revision}</strong>
            <CatalogChip tone="accent">Current</CatalogChip>
          </header>
          <p>Saved preset definition</p>
          <small>
            {fullDay(selected.updated)} · {time(selected.updated)}
          </small>
        </article>
        <p className="dv-cat-side-description">
          Open the preset to see earlier revisions.
        </p>
      </>
    );
  else
    pane = (
      <>
        <SidebarSection>
          <div className="dv-cat-side-preview">
            <PresetThumb panels={selected.panels} />
          </div>
          <h3 className="dv-cat-side-heading">{selected.name}</h3>
          <p className="dv-cat-side-description">{selected.description}</p>
          <div className="dv-cat-meta">
            <CatalogChip icon="panels">
              {selected.panels.length} panels
            </CatalogChip>
            <CatalogChip icon="revisions">R{selected.revision}</CatalogChip>
          </div>
          <div className="dv-cat-actions">
            {use(selected)}
            {onOpen && (
              <CatalogAction
                label={`Open preset: ${selected.name}`}
                onClick={() => onOpen(selected.id)}
              >
                Open preset
              </CatalogAction>
            )}
          </div>
        </SidebarSection>
        <SidebarSection title="Definition">
          <SidebarFacts
            items={[
              [
                'Updated',
                <>
                  {fullDay(selected.updated)}
                  <br />
                  {time(selected.updated)}
                </>,
              ],
              ['Scope', 'This installation'],
            ]}
          />
        </SidebarSection>
      </>
    );

  const sidebar = (
    <RightSidebar
      id={sidebarId}
      tabsLabel="Preset tools"
      activeTab={tab}
      onTabChange={setTab}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      revealKey={reveal}
      subtitle={selected?.name ?? 'Presets'}
      tabs={[
        {
          id: 'details',
          label: 'Details',
          icon: <SidebarIcon name="details" />,
        },
        { id: 'panels', label: 'Panels', icon: <SidebarIcon name="panels" /> },
        {
          id: 'revisions',
          label: 'Revisions',
          icon: <SidebarIcon name="revisions" />,
        },
      ]}
    >
      {pane}
    </RightSidebar>
  );

  const actions = (onImport || onNewPreset) && (
    <>
      {onImport && (
        <HeaderButton icon={importGlyph} onClick={onImport}>
          Import preset
        </HeaderButton>
      )}
      {onNewPreset && (
        <HeaderButton
          variant="primary"
          icon={presetGlyph}
          onClick={onNewPreset}
        >
          New preset
        </HeaderButton>
      )}
    </>
  );

  return (
    <CatalogRoot label="Presets">
      <PageHeader
        title={pages.presets.title}
        breadcrumbs={breadcrumbs}
        count={rows.length}
        actions={actions || undefined}
      />
      <WorkspaceBody sidebar={sidebar}>
        <Presence show={!!search} className="dv-cat-filter-presence">
          <CatalogFilter query={search} onClear={clearSearch} />
        </Presence>
        <CatalogToolbar count={noun(rows.length)}>
          <fieldset className="dv-cat-views" aria-label="Preset view">
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <SidebarIcon name="details" />
              List
            </button>
            <button
              type="button"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <SidebarIcon name="panels" />
              Grid
            </button>
          </fieldset>
        </CatalogToolbar>
        <Swap swapKey={rows.length ? 'list' : 'empty'}>{body}</Swap>
        <Presence show={rows.length > 0}>
          <CatalogPagination noun={noun} total={rows.length} pager={pager} />
        </Presence>
      </WorkspaceBody>
    </CatalogRoot>
  );
}
