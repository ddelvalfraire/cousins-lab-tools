import { type ReactNode, useId, useMemo, useState } from 'react';
import { pages } from '@/shared/config/search-registry';
import { MotionList, Presence, Swap } from '@/shared/motion/Motion';
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
import { type PageBreadcrumb, PageHeader } from './PageHeader';
import {
  RightSidebar,
  SidebarFacts,
  SidebarIcon,
  SidebarSection,
  WorkspaceBody,
} from './RightSidebar';
import { usePendingTimeouts } from './usePendingTimeouts';
import { useResettingCopy } from './useResettingCopy';

export type InstrumentState =
  | 'receiving'
  | 'ready'
  | 'connecting'
  | 'offline'
  | 'error';
export interface InstrumentChannel {
  name: string;
  value: string;
  unit: string;
  rate: string;
}
export interface CatalogInstrument {
  id: string;
  name: string;
  kind: 'mass' | 'temperature';
  transport: string;
  port: string;
  state: InstrumentState;
  /** Second line of the connection column, e.g. "Last sample just now". */
  note: string;
  channels: readonly InstrumentChannel[];
}
export type InstrumentSortKey = 'name' | 'channels' | 'status';
export type InstrumentSidebarTab = 'details' | 'channels' | 'connect';

export interface InstrumentCatalogProps {
  instruments: readonly CatalogInstrument[];
  /** Search text from the window bar. Filters names, identifiers, transports and channels. */
  query?: string;
  onClearQuery?: () => void;
  breadcrumbs?: readonly PageBreadcrumb[];
  /** Connection attempts are simulated: Connect moves to Connecting, then Connected. */
  connectDelay?: number;
  initialSort?: CatalogSort<InstrumentSortKey>;
  initialSelected?: string | null;
  initialTab?: InstrumentSidebarTab;
  initialCollapsed?: boolean;
}

const STATE_LABEL: Record<InstrumentState, string> = {
  receiving: 'Receiving',
  ready: 'Connected',
  offline: 'Disconnected',
  connecting: 'Connecting',
  error: 'Connection error',
};
const STATE_ORDER: Record<InstrumentState, number> = {
  receiving: 0,
  ready: 1,
  connecting: 2,
  offline: 3,
  error: 4,
};
const noun = (n: number) => `${n} ${n === 1 ? 'instrument' : 'instruments'}`;

/** Instrument glyphs from instrument-catalog-review.html (stroke 1.5). */
export function InstrumentGlyph({ kind }: { kind: CatalogInstrument['kind'] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'temperature' ? (
        <>
          <path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z" />
          <path d="M12 7v10" />
          <circle cx="12" cy="18" r="1" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M6 14h3l2-5 3 8 2-4h2M7 7h1" />
        </>
      )}
    </svg>
  );
}
const warnGlyph = (
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
    <path d="m12 3 10 18H2L12 3Z" />
    <path d="M12 9v5m0 3h.01" />
  </svg>
);

/** Connection state: icon plus word. */
export function InstrumentStatus({ state }: { state: InstrumentState }) {
  const glyph =
    state === 'receiving' ? (
      <SidebarIcon name="signals" />
    ) : state === 'ready' ? (
      <SidebarIcon name="check" />
    ) : state === 'error' ? (
      warnGlyph
    ) : state === 'connecting' ? (
      <SidebarIcon name="revisions" />
    ) : (
      <InstrumentGlyph kind="mass" />
    );
  return (
    <span className="dv-cat-status" data-state={state}>
      {glyph}
      {STATE_LABEL[state]}
    </span>
  );
}

function compare(
  key: InstrumentSortKey,
  a: CatalogInstrument,
  b: CatalogInstrument,
) {
  return key === 'name'
    ? a.name.localeCompare(b.name)
    : key === 'channels'
      ? a.channels.length - b.channels.length
      : STATE_ORDER[a.state] - STATE_ORDER[b.state];
}

/**
 * Instruments catalog: identity, channel count and connection health in separate columns, with channels and
 * connection details in the right sidebar. Values from design/dvdash-field-review/instrument-catalog-review.html.
 */
export function InstrumentCatalog({
  instruments,
  query = '',
  onClearQuery,
  breadcrumbs = [{ label: 'Workspace' }, { label: 'Instruments' }],
  connectDelay = 1000,
  initialSort = { key: 'name', ascending: true },
  initialSelected = null,
  initialTab = 'details',
  initialCollapsed,
}: InstrumentCatalogProps) {
  const sidebarId = useId().replace(/:/g, '');
  const [search, clearSearch] = useCatalogQuery(query, onClearQuery);
  const [sort, sortBy] = useCatalogSort<InstrumentSortKey>(initialSort);
  const [items, setItems] = useResettingCopy(instruments);
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [tab, setTab] = useState<string>(initialTab);
  const [collapsed, setCollapsed] = useState(
    initialCollapsed ?? !initialSelected,
  );
  const [reveal, setReveal] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const timeouts = usePendingTimeouts();

  const rows = useMemo(
    () =>
      items
        .filter(
          (i) =>
            !search ||
            normalize(
              `${i.name} ${i.id} ${i.transport} ${i.channels.map((c) => c.name).join(' ')}`,
            ).includes(normalize(search)),
        )
        .sort((a, b) => compare(sort.key, a, b) * (sort.ascending ? 1 : -1)),
    [items, search, sort],
  );
  const pager = useCatalogPage(rows.length);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const open = (id: string, next: InstrumentSidebarTab = 'details') => {
    setSelectedId(id);
    setTab(next);
    setCollapsed(false);
    setReveal((n) => n + 1);
    focusPane(sidebarId);
  };
  const update = (id: string, patch: Partial<CatalogInstrument>) =>
    setItems((current) =>
      current.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const connect = (i: CatalogInstrument) => {
    update(i.id, { state: 'connecting' });
    setAnnouncement(`Connecting to ${i.name}.`);
    timeouts.schedule(() => {
      if (
        document.activeElement?.getAttribute('aria-label') === 'Connecting…' &&
        document.activeElement.closest('.dv-right-sidebar')
      )
        focusPane(sidebarId);
      update(i.id, { state: 'ready', note: 'Connected · not acquiring' });
      setAnnouncement(`${i.name} connected. Acquisition has not started.`);
    }, connectDelay);
  };
  const action = (i: CatalogInstrument) => {
    if (i.state === 'receiving' || i.state === 'ready')
      return (
        <CatalogAction
          label={`View channels: ${i.name}`}
          onClick={() => open(i.id, 'channels')}
        >
          <Swap sequential swapKey={i.state}>
            View channels
          </Swap>
        </CatalogAction>
      );
    if (i.state === 'connecting')
      return (
        <CatalogAction unavailable label="Connecting…" arrow={false}>
          <Swap sequential swapKey={i.state}>
            Connecting…
          </Swap>
        </CatalogAction>
      );
    return (
      <CatalogAction
        label={`${i.state === 'error' ? 'Retry' : 'Connect'}: ${i.name}`}
        onClick={() => connect(i)}
      >
        <Swap sequential swapKey={i.state}>
          {i.state === 'error' ? 'Retry' : 'Connect'}
        </Swap>
      </CatalogAction>
    );
  };
  const instrumentId = (value: string) => (
    <span className="dv-cat-instrument-id">{value}</span>
  );
  const facts = (i: CatalogInstrument, last: [string, string]) => (
    <SidebarFacts
      items={[
        ['Transport', i.transport],
        ['Port', instrumentId(i.port)],
        last[0] === 'Identifier' ? ['Identifier', instrumentId(last[1])] : last,
      ]}
    />
  );

  let body: ReactNode;
  if (!instruments.length)
    body = (
      <CatalogState
        icon={<InstrumentGlyph kind="mass" />}
        title="No instruments configured"
        message="Configured instruments will appear here."
      />
    );
  else if (!rows.length)
    body = (
      <CatalogState
        icon={<InstrumentGlyph kind="mass" />}
        title="No matching instruments"
        message="Try an instrument name, identifier or channel."
        action={
          <CatalogAction arrow={false} onClick={clearSearch}>
            Clear search
          </CatalogAction>
        }
      />
    );
  else
    body = (
      <CatalogFrame label="Instrument catalog">
        <table className="dv-cat-table" data-catalog="instruments">
          <caption className="dv-cat-sr">
            Configured instruments and their connection state
          </caption>
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <SortHeader
                sortKey="name"
                label="Instrument"
                sort={sort}
                onSort={sortBy}
              />
              <SortHeader
                sortKey="channels"
                label="Channels"
                sort={sort}
                onSort={sortBy}
              />
              <SortHeader
                sortKey="status"
                label="Connection"
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
              {rows.slice(pager.start, pager.end).map((i) => (
                <tr key={i.id} data-selected={selected?.id === i.id}>
                  <td>
                    <div className="dv-cat-identity">
                      <span className="dv-cat-mark" data-kind={i.kind}>
                        <InstrumentGlyph kind={i.kind} />
                      </span>
                      <div>
                        <button
                          type="button"
                          className="dv-cat-name"
                          onClick={() => open(i.id)}
                        >
                          {i.name}
                        </button>
                        <div className="dv-cat-instrument-meta">
                          <span className="dv-cat-instrument-id">{i.id}</span>
                          <span
                            className="dv-cat-separator"
                            aria-hidden="true"
                          />
                          <span>{i.transport}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="dv-cat-count-button"
                      aria-label={`${i.channels.length} channels: ${i.name}`}
                      onClick={() => open(i.id, 'channels')}
                    >
                      <CatalogChip icon="signals">
                        {i.channels.length}
                      </CatalogChip>
                    </button>
                  </td>
                  <td>
                    <Swap sequential swapKey={i.state}>
                      <InstrumentStatus state={i.state} />
                      <span className="dv-cat-connection-note">
                        {i.state === 'connecting'
                          ? 'Waiting for instrument…'
                          : i.note}
                      </span>
                    </Swap>
                  </td>
                  <td>{action(i)}</td>
                </tr>
              ))}
            </MotionList>
          </tbody>
        </table>
      </CatalogFrame>
    );

  let pane: ReactNode;
  if (!selected)
    pane = (
      <SidebarEmpty
        icon={<InstrumentGlyph kind="mass" />}
        title="Select an instrument"
        message="Open an instrument to inspect its channels and connection."
      />
    );
  else if (tab === 'channels')
    pane = (
      <SidebarSection title={`${selected.channels.length} channels`}>
        {selected.channels.map((c) => (
          <div key={c.name} className="dv-cat-channel">
            <div className="dv-cat-channel-top">
              <strong>{c.name}</strong>
              <span className="dv-cat-channel-value">
                {selected.state === 'receiving' ? c.value : '—'}
                <small>{c.unit}</small>
              </span>
            </div>
            <div className="dv-cat-channel-meta">
              <span className="dv-cat-legend" aria-hidden="true" />
              {selected.state === 'receiving'
                ? c.rate
                : selected.state === 'ready'
                  ? 'Ready · not acquiring'
                  : 'No live samples'}
            </div>
          </div>
        ))}
      </SidebarSection>
    );
  else if (tab === 'connect')
    pane = (
      <>
        <SidebarSection>
          <InstrumentStatus state={selected.state} />
          <p className="dv-cat-note">{selected.note}</p>
        </SidebarSection>
        <Presence
          show={
            selected.state === 'offline' ||
            selected.state === 'connecting' ||
            selected.state === 'error'
          }
        >
          <SidebarSection>
            <div className="dv-cat-actions">{action(selected)}</div>
          </SidebarSection>
        </Presence>
        <SidebarSection title="Connection">
          {facts(selected, ['Identifier', selected.id])}
        </SidebarSection>
      </>
    );
  else
    pane = (
      <>
        <SidebarSection>
          <div className="dv-cat-detail-identity">
            <span className="dv-cat-mark" data-kind={selected.kind}>
              <InstrumentGlyph kind={selected.kind} />
            </span>
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.id}</small>
            </div>
          </div>
          <InstrumentStatus state={selected.state} />
        </SidebarSection>
        <SidebarSection title="Source">
          {facts(selected, ['Channels', String(selected.channels.length)])}
          <div className="dv-cat-actions">
            <CatalogAction onClick={() => open(selected.id, 'channels')}>
              View channels
            </CatalogAction>
          </div>
        </SidebarSection>
      </>
    );

  const sidebar = (
    <RightSidebar
      id={sidebarId}
      tabsLabel="Instrument tools"
      activeTab={tab}
      onTabChange={setTab}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      revealKey={reveal}
      subtitle={selected?.id ?? 'Instruments'}
      tabs={[
        {
          id: 'details',
          label: 'Details',
          icon: <SidebarIcon name="details" />,
        },
        {
          id: 'channels',
          label: 'Channels',
          icon: <SidebarIcon name="signals" />,
        },
        {
          id: 'connect',
          label: 'Connect',
          icon: <SidebarIcon name="display" />,
        },
      ]}
    >
      {pane}
    </RightSidebar>
  );

  return (
    <CatalogRoot label="Instruments">
      <PageHeader
        title={pages.instruments.title}
        breadcrumbs={breadcrumbs}
        count={rows.length}
      />
      <WorkspaceBody sidebar={sidebar}>
        <Presence show={!!search} className="dv-cat-filter-presence">
          <CatalogFilter query={search} onClear={clearSearch} />
        </Presence>
        <CatalogToolbar count={noun(rows.length)} />
        <Swap swapKey={rows.length ? 'list' : 'empty'}>{body}</Swap>
        <Presence show={rows.length > 0}>
          <CatalogPagination noun={noun} total={rows.length} pager={pager} />
        </Presence>
      </WorkspaceBody>
      <div
        ref={timeouts.ref}
        className="dv-cat-sr"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </CatalogRoot>
  );
}
