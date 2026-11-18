import { IconDownload, IconPencil, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { CatalogChip, CatalogRoot } from '../components/CatalogTable';
import { Chip } from '../components/Chip';
import {
  InstrumentCatalog,
  type InstrumentCatalogProps,
} from '../components/InstrumentCatalog';
import { keyedBy } from '../components/keyedBy';
import { HeaderButton, PageHeader } from '../components/PageHeader';
import {
  PresetCatalog,
  type PresetCatalogProps,
} from '../components/PresetCatalog';
import {
  type PresetRevision,
  type RestorePhase,
  RevisionHistoryList,
} from '../components/RevisionHistory';
import {
  RightSidebar,
  SidebarFacts,
  SidebarIcon,
  SidebarSection,
  WorkspaceBody,
} from '../components/RightSidebar';
import {
  RoutineCatalog,
  type RoutineCatalogProps,
} from '../components/RoutineCatalog';
import {
  SavedVersionPreview,
  type SavedVersionTab,
  SavedVersionView,
} from '../components/SavedVersions';
import {
  catalogInstruments,
  catalogPresets,
  catalogRoutines,
} from './catalog-fixtures';
import {
  presetChanges,
  presetPanels,
  presetPreview,
  presetRevisionList,
} from './revision-fixtures';
import type { Navigate } from './ScreenShell';
import type { PresetSpec } from './screen-fixtures';

const workspace = (navigate?: Navigate) => ({
  label: 'Workspace',
  onClick: navigate && (() => navigate('experiments')),
});

/** Presets catalog in the frame: opening a name shows it in the sidebar; Open preset goes to its page, Use preset to setup. */
export function PresetsPage({
  navigate,
  onImport,
  onNewPreset,
  ...state
}: {
  navigate: Navigate;
  onImport: () => void;
  onNewPreset?: () => void;
} & Partial<
  Omit<
    PresetCatalogProps,
    'onUse' | 'onOpen' | 'onImport' | 'onNewPreset' | 'breadcrumbs'
  >
>) {
  return (
    <PresetCatalog
      presets={catalogPresets}
      {...state}
      breadcrumbs={[workspace(navigate), { label: 'Presets' }]}
      onImport={onImport}
      onNewPreset={onNewPreset}
      onOpen={(id) => navigate('preset', id)}
      onUse={(id) => navigate('prepare', id)}
    />
  );
}

export type PresetPageTab = 'details' | 'panels' | 'revisions';
const presetTabs = [
  { id: 'details', label: 'Details', icon: <SidebarIcon name="details" /> },
  { id: 'panels', label: 'Panels', icon: <SidebarIcon name="panels" /> },
  {
    id: 'revisions',
    label: 'Revisions',
    icon: <SidebarIcon name="revisions" />,
  },
];

/** The preset sidebar's Details and Panels panes, shared by the preset page and its revision history. */
function PresetDetailsPane({ preset }: { preset: PresetSpec }) {
  const panels = presetPanels(preset);
  return (
    <>
      <SidebarSection>
        <h3 className="dv-cat-side-heading">{preset.name}</h3>
        <p className="dv-cat-side-description">{preset.summary}</p>
        <div className="dv-cat-meta">
          <CatalogChip icon="panels">{panels.length} panels</CatalogChip>
          <CatalogChip icon="revisions">R{preset.revision}</CatalogChip>
        </div>
      </SidebarSection>
      <SidebarSection title="Instrument roles">
        <SidebarFacts
          items={[
            ['Mass spectrometer', 'Required'],
            ['Signals', preset.signals.join(', ')],
          ]}
        />
      </SidebarSection>
      <SidebarSection title="Definition">
        <SidebarFacts
          items={[
            ['Views', preset.views],
            ['Clock', 'Elapsed time'],
            ['Scope', 'This installation'],
          ]}
        />
      </SidebarSection>
    </>
  );
}
function PresetPanelsPane({ preset }: { preset: PresetSpec }) {
  const panels = presetPanels(preset);
  return (
    <SidebarSection title={`${panels.length} panels`}>
      {keyedBy(panels, (panel) => panel.name).map(({ key, item }) => (
        <div key={key} className="dv-cat-side-signal">
          <SidebarIcon name={item.signal ? 'signals' : 'panels'} />
          <div>
            <strong>{item.name}</strong>
            <small>
              {item.kind}
              {item.unit && ` · ${item.unit}`}
            </small>
          </div>
        </div>
      ))}
    </SidebarSection>
  );
}

/**
 * A preset's own page: its current layout, read-only, beside Details, Panels and Revisions in the right sidebar.
 * Choosing a revision opens the revision history. Values from preset-catalog-review.html and revision-chips-review.html.
 */
export function PresetPage({
  preset,
  navigate,
  onExport,
  onEdit,
  onOpenRevision,
  initialTab = 'details',
}: {
  preset: PresetSpec;
  navigate: Navigate;
  onExport: () => void;
  onEdit: () => void;
  /** Opens the revision history with this revision selected. */
  onOpenRevision: (revision: number) => void;
  initialTab?: PresetPageTab;
}) {
  const [tab, setTab] = useState<string>(initialTab);
  const revisions = presetRevisionList(preset),
    panels = presetPanels(preset);
  const sidebar = (
    <RightSidebar
      tabsLabel="Preset tools"
      activeTab={tab}
      onTabChange={setTab}
      subtitle={preset.name}
      tabs={presetTabs}
    >
      {tab === 'revisions' ? (
        <RevisionHistoryList
          revisions={revisions}
          current={preset.revision}
          selected={preset.revision}
          onSelect={onOpenRevision}
        />
      ) : tab === 'panels' ? (
        <PresetPanelsPane preset={preset} />
      ) : (
        <PresetDetailsPane preset={preset} />
      )}
    </RightSidebar>
  );
  return (
    <CatalogRoot label={preset.name}>
      <PageHeader
        title={preset.name}
        breadcrumbs={[
          workspace(navigate),
          { label: 'Presets', onClick: () => navigate('presets') },
          { label: preset.name },
        ]}
        meta={
          <>
            <Chip icon={<SidebarIcon name="panels" />}>
              {panels.length} panels
            </Chip>
            <Chip icon={<SidebarIcon name="revisions" />}>
              R{preset.revision}
            </Chip>
          </>
        }
        actions={
          <>
            <HeaderButton
              icon={<IconDownload aria-hidden />}
              onClick={onExport}
            >
              Export definition
            </HeaderButton>
            <HeaderButton icon={<IconPencil aria-hidden />} onClick={onEdit}>
              Edit preset
            </HeaderButton>
            <HeaderButton
              variant="primary"
              icon={<IconPlayerPlay aria-hidden />}
              onClick={() => navigate('prepare', preset.id)}
            >
              Use preset
            </HeaderButton>
          </>
        }
      />
      <WorkspaceBody sidebar={sidebar}>
        <h2 className="dv-revision-sr">Layout of R{preset.revision}</h2>
        <SavedVersionPreview {...presetPreview(preset, preset.revision)} />
      </WorkspaceBody>
    </CatalogRoot>
  );
}

type HistoryRevision = PresetRevision & { restoredFrom?: number };
/**
 * Revision history: the selected saved revision with Preview and Changes, and the saved revisions in the sidebar's
 * Revisions tab. Restoring an earlier revision appends a new one after confirmation.
 * Values from design/dvdash-field-review/revision-chips-review.html; restore confirmation from revision-history-review.html.
 */
export function RevisionHistoryPage({
  preset,
  navigate,
  initialRevision = preset.revision,
  initialTab = 'preview',
  initialRestore = 'idle',
}: {
  preset: PresetSpec;
  navigate: Navigate;
  initialRevision?: number;
  initialTab?: SavedVersionTab;
  initialRestore?: RestorePhase;
}) {
  const [revisions, setRevisions] = useState<readonly HistoryRevision[]>(() =>
    presetRevisionList(preset),
  );
  const [selected, setSelected] = useState(initialRevision),
    [tab, setTab] = useState(initialTab),
    [sideTab, setSideTab] = useState<string>('revisions');
  const [restore, setRestore] = useState<RestorePhase>(initialRestore),
    [restoredFrom, setRestoredFrom] = useState<number>();
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const current = revisions[0].number;
  const revision =
    revisions.find((item) => item.number === selected) ?? revisions[0];
  const previous = revisions[revisions.indexOf(revision) + 1];
  const source = revision.restoredFrom ?? revision.number;
  // A restored copy undoes the changes saved after its source.
  const changes = revision.restoredFrom
    ? presetChanges(preset, revision.restoredFrom + 1).map((c) => ({
        ...c,
        before: c.after,
        after: c.before,
      }))
    : presetChanges(preset, revision.number);
  const confirm = () => {
    setRestore('restoring');
    timer.current = window.setTimeout(() => {
      const created: HistoryRevision = {
        ...revision,
        number: current + 1,
        note: `Restored from R${revision.number}`,
        savedAt: new Date().toISOString(),
        restoredFrom: source,
      };
      setRevisions((list) => [created, ...list]);
      setRestoredFrom(revision.number);
      setSelected(created.number);
      setTab('preview');
      setRestore('restored');
    }, 600);
  };
  const sidebar = (
    <RightSidebar
      tabsLabel="Preset tools"
      activeTab={sideTab}
      onTabChange={setSideTab}
      title={sideTab === 'revisions' ? 'Revisions' : undefined}
      subtitle={preset.name}
      tabs={presetTabs}
    >
      {sideTab === 'revisions' ? (
        <RevisionHistoryList
          revisions={revisions}
          current={current}
          selected={selected}
          busy={restore === 'restoring'}
          onSelect={(number) => {
            setSelected(number);
            setRestore('idle');
          }}
        />
      ) : sideTab === 'panels' ? (
        <PresetPanelsPane preset={preset} />
      ) : (
        <PresetDetailsPane preset={preset} />
      )}
    </RightSidebar>
  );
  return (
    <CatalogRoot label="Revision history">
      <PageHeader
        title="Revision history"
        breadcrumbs={[
          workspace(navigate),
          { label: 'Presets', onClick: () => navigate('presets') },
          { label: preset.name, onClick: () => navigate('preset', preset.id) },
          { label: 'Revision history' },
        ]}
        metadata={
          <>
            <SidebarIcon name="panels" />
            {preset.name}
          </>
        }
        actions={
          <HeaderButton
            icon={<SidebarIcon name="panels" />}
            onClick={() => navigate('preset', preset.id)}
          >
            View current preset
          </HeaderButton>
        }
      />
      <WorkspaceBody sidebar={sidebar}>
        <SavedVersionView
          title={preset.name}
          revision={revision}
          current={current}
          tab={tab}
          onTabChange={setTab}
          preview={<SavedVersionPreview {...presetPreview(preset, source)} />}
          changes={changes}
          comparedWith={previous?.number}
          restore={restore}
          restoredFrom={restoredFrom}
          onRestore={() => setRestore('confirm')}
          onCancelRestore={() => setRestore('idle')}
          onConfirmRestore={confirm}
        />
      </WorkspaceBody>
    </CatalogRoot>
  );
}

/** Routines catalog in the frame: Use routine opens setup with it selected; Edit routine opens the editor. */
export function RoutinesPage({
  navigate,
  onUseRoutine,
  onEditRoutine,
  ...state
}: {
  navigate?: Navigate;
  onUseRoutine: (id: string) => void;
  onEditRoutine: (id: string) => void;
} & Partial<Omit<RoutineCatalogProps, 'onUse' | 'onEdit' | 'breadcrumbs'>>) {
  return (
    <RoutineCatalog
      routines={catalogRoutines}
      {...state}
      breadcrumbs={[workspace(navigate), { label: 'Routines' }]}
      onUse={onUseRoutine}
      onEdit={onEditRoutine}
    />
  );
}

/** Instruments catalog in the frame. Connection attempts are simulated and never start acquisition. */
export function InstrumentsPage({
  navigate,
  ...state
}: { navigate?: Navigate } & Partial<
  Omit<InstrumentCatalogProps, 'breadcrumbs'>
> = {}) {
  return (
    <InstrumentCatalog
      instruments={catalogInstruments}
      {...state}
      breadcrumbs={[workspace(navigate), { label: 'Instruments' }]}
    />
  );
}
