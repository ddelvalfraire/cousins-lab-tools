import { IconHistory } from '@tabler/icons-react';
import { useState } from 'react';
import type { IntervalResult } from '@/features/acquisition';
import {
  ExperimentSetupForm,
  ExperimentsList,
  type PreparedExperiment,
} from '@/features/experiments';
import { PresetEditor } from '@/features/presets';
import { RoutineEditor } from '@/features/routines';
import { savedResults } from '@/shared/testing/fixtures';
import {
  type ExperimentSummary,
  experiments,
  presets,
  routines,
  type SetupPreview,
} from '@/shared/testing/screen-fixtures';
import { useAppearance } from '@/shared/theme/appearance';
import { Chip } from '@/shared/ui/Chip';
import { PageHeader } from '@/shared/ui/PageHeader';
import { PresetImport } from '../components/PresetImport';
import { RecordingImport } from '../components/RecordingImport';
import {
  type AppSettings,
  type FolderState,
  SettingsPage,
} from '../components/SettingsPage';
import {
  buildInfo,
  defaultSettings,
  routineDefinitions,
  setupPresets,
  setupRoutines,
  setupSources,
  toAcquisition,
  toEditablePreset,
  toListExperiment,
  toRecents,
} from './approved-fixtures';
import {
  InstrumentsPage,
  PresetPage,
  PresetsPage,
  RevisionHistoryPage,
  RoutinesPage,
} from './CatalogPages';
import {
  catalogPresetSpec,
  catalogRoutine,
  catalogRoutineDefinitions,
  catalogSetupPresets,
  catalogSetupRoutines,
} from './catalog-fixtures';
import {
  CapturePage,
  type ExperimentViewOptions,
  ReviewPage,
} from './ExperimentPages';
import {
  checkPresetFile,
  readRecordingFile,
  recordingPresetOptions,
} from './import-fixtures';
import { ScreenBody, type ScreenRoute, ScreenShell } from './ScreenShell';
import { searchRecords } from './search-fixtures';
import './screens.css';
import './screen-layouts.css';
import { pages } from '@/shared/config/search-registry';

export interface WorkspaceProps {
  initialPage?: ScreenRoute /** A place on the first page to open, as a search result does. */;
  initialTarget?: string;
  initialPreset?: string;
  initialExperiment?: string;
  empty?: boolean;
  unavailable?: boolean;
  onAppearanceChange?: () => void /** Starting state of the experiment page, for frozen review stories. */;
  experimentView?: ExperimentViewOptions;
}
/** Fixed review time, so "Today" in the Experiments list is stable. */
const REVIEW_NOW = new Date('2026-10-30T18:00:00');
/** Pages whose list the search box can filter. */
const filterablePages: ReadonlySet<ScreenRoute> = new Set([
  'experiments',
  'presets',
  'routines',
  'instruments',
]);
/** A navigable UI fixture. No Tauri calls, acquisition or persistent catalog writes. */
export function DVDashWorkspace({
  initialPage = 'experiments',
  initialTarget,
  initialPreset = 'gas',
  initialExperiment = 'sample-024',
  empty = false,
  unavailable = false,
  onAppearanceChange,
  experimentView,
}: WorkspaceProps) {
  const [routineId, setRoutineId] = useState('measure'),
    [historyRevision, setHistoryRevision] = useState<number | undefined>();
  const [page, setPage] = useState(initialPage),
    [presetId, setPresetId] = useState(initialPreset),
    [experimentId, setExperimentId] = useState(initialExperiment);
  const [rows, setRows] = useState<ExperimentSummary[]>(
      empty ? [] : experiments,
    ),
    [results, setResults] = useState<Record<string, IntervalResult[]>>({
      'sample-024': savedResults,
    });
  const [dialog, setDialog] = useState<'recording' | 'definition' | null>(null);
  const [pageQuery, setPageQuery] = useState(''),
    [catalogSelection, setCatalogSelection] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings),
    [folderState, setFolderState] = useState<FolderState>({ status: 'ready' });
  const appearance = useAppearance();
  const preset =
    presets.find((p) => p.id === presetId) ??
    catalogPresetSpec(presetId) ??
    presets[0];
  const experiment =
    rows.find((row) => row.id === experimentId) ??
    experiments.find((row) => row.id === experimentId) ??
    experiments[0];
  const experimentPreset =
    presets.find((p) => p.id === experiment.presetId) ?? preset;
  const routine =
    routines.find((r) => r.id === routineId) ??
    catalogRoutine(routineId) ??
    routines[0];
  const navigate = (destination: ScreenRoute, id?: string) => {
    setPageQuery('');
    if (destination === 'routines' || destination === 'instruments')
      setCatalogSelection(id ?? null);
    if (id) {
      if (
        ['preset', 'preset-edit', 'preset-history', 'prepare'].includes(
          destination,
        )
      )
        setPresetId(id);
      if (['experiment', 'review'].includes(destination)) setExperimentId(id);
      if (destination === 'routine-edit') setRoutineId(id);
    }
    setPage(destination);
  };
  const openExperiment = (prepared: PreparedExperiment) => {
    const id = `experiment-${rows.length + 1}`,
      parameters = prepared.routine?.parameters ?? {};
    const setup: SetupPreview = {
      source: prepared.roles.massSpectrometer ?? '',
      reference: !!prepared.reference,
      delay: parameters.delay ?? 0,
      routine: prepared.routine?.id ?? null,
      count: parameters.count ?? 0,
      interval: parameters.interval ?? 0,
      failure: 'stop',
    };
    setRows((current) => [
      {
        id,
        name: prepared.name,
        presetId: prepared.preset.id,
        status: prepared.mode === 'live' ? 'Running' : 'Recorded',
        date: '2026-10-30T16:00:00Z',
        samples: 121,
        input:
          prepared.mode === 'live' ? 'Simulated instrument' : 'Recorded file',
        setup,
      },
      ...current,
    ]);
    setResults((current) => ({ ...current, [id]: [] }));
    setExperimentId(id);
    setPage('experiment');
  };
  const changeSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    if (key === 'theme')
      appearance.setPreference(value as AppSettings['theme']);
    else if (key === 'textSize')
      appearance.setTextSize(value as AppSettings['textSize']);
    else setSettings((current) => ({ ...current, [key]: value }));
  };
  const chooseFolder = () => {
    setFolderState({ status: 'choosing' });
    window.setTimeout(() => {
      setSettings((current) => ({
        ...current,
        folder: '~/Lab data/DVDash recordings',
      }));
      setFolderState({ status: 'ready' });
    }, 700);
  };
  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportDefinition = () =>
    download(
      `${preset.id}-r${preset.revision}.json`,
      JSON.stringify(
        { kind: 'dvdash-screen-review', schemaVersion: 1, preset },
        null,
        2,
      ),
      'application/json',
    );
  const home = { label: 'Workspace', onClick: () => navigate('experiments') };
  const presetsCrumb = { label: 'Presets', onClick: () => navigate('presets') };
  const clearQuery = () => setPageQuery('');
  return (
    <ScreenShell
      page={page}
      navigate={navigate}
      initialTarget={initialTarget}
      recents={toRecents(rows)}
      acquisition={toAcquisition(rows)}
      onAppearanceChange={onAppearanceChange}
      searchRecords={searchRecords(rows)}
      pageQuery={pageQuery}
      onPageQueryChange={filterablePages.has(page) ? setPageQuery : undefined}
      onNewExperiment={() => navigate('prepare', 'gas')}
      onImportRecordings={() => setDialog('recording')}
    >
      {page === 'experiments' && (
        <ExperimentsList
          experiments={rows.map(toListExperiment)}
          now={REVIEW_NOW}
          breadcrumbs={[home, { label: 'Experiments' }]}
          onOpen={(id) => navigate('experiment', id)}
          onNewExperiment={() => navigate('prepare', 'gas')}
          onImport={() => setDialog('recording')}
          query={pageQuery}
          onClearQuery={clearQuery}
        />
      )}
      {page === 'presets' && (
        <PresetsPage
          navigate={navigate}
          onImport={() => setDialog('definition')}
          query={pageQuery}
          onClearQuery={clearQuery}
        />
      )}
      {page === 'preset' && (
        <PresetPage
          key={preset.id}
          preset={preset}
          navigate={navigate}
          onExport={exportDefinition}
          onEdit={() => navigate('preset-edit', preset.id)}
          onOpenRevision={(revision) => {
            setHistoryRevision(revision);
            navigate('preset-history', preset.id);
          }}
        />
      )}
      {page === 'preset-history' && (
        <RevisionHistoryPage
          key={`${preset.id}-${historyRevision}`}
          preset={preset}
          navigate={navigate}
          initialRevision={historyRevision}
        />
      )}
      {page === 'preset-edit' && (
        <PresetEditor
          key={preset.id}
          preset={toEditablePreset(preset)}
          breadcrumbs={[home, presetsCrumb, { label: preset.name }]}
          onDiscard={() => navigate('preset', preset.id)}
        />
      )}
      {page === 'prepare' && (
        <>
          <PageHeader
            title="New experiment"
            breadcrumbs={[
              home,
              presetsCrumb,
              {
                label: preset.name,
                onClick: () => navigate('preset', preset.id),
              },
              { label: 'New experiment' },
            ]}
            meta={
              <Chip icon={<IconHistory aria-hidden />}>
                Preset R{preset.revision}
              </Chip>
            }
          />
          <ScreenBody className="dv-screen-prepare">
            <ExperimentSetupForm
              hideHeader
              key={`${preset.id}-${routineId}`}
              presets={[...setupPresets, ...catalogSetupPresets]}
              sources={setupSources}
              routines={[...setupRoutines, ...catalogSetupRoutines]}
              initialValues={{
                name: 'New experiment',
                presetId: preset.id,
                mode: 'recorded',
                sourceId: unavailable ? '' : 'sample-024',
                routineId,
                referenceId: 'sample-023',
              }}
              onOpen={openExperiment}
            />
          </ScreenBody>
        </>
      )}
      {(page === 'experiment' || page === 'review') && (
        <>
          <div className="dv-xw-host" hidden={page !== 'experiment'}>
            <CapturePage
              key={experiment.id}
              view={experimentView}
              experiment={experiment}
              preset={experimentPreset}
              navigate={navigate}
              unavailable={unavailable}
              rows={results[experiment.id] ?? []}
              onResultsChange={(value) =>
                setResults((current) => ({
                  ...current,
                  [experiment.id]: value,
                }))
              }
              onStop={() =>
                setRows((current) =>
                  current.map((row) =>
                    row.id === experiment.id
                      ? { ...row, status: 'Recorded' }
                      : row,
                  ),
                )
              }
            />
          </div>
          {page === 'review' && (
            <ReviewPage
              experiment={experiment}
              preset={experimentPreset}
              navigate={navigate}
              rows={results[experiment.id] ?? []}
              onDownload={download}
            />
          )}
        </>
      )}
      {page === 'routines' && (
        <RoutinesPage
          key={catalogSelection ?? ''}
          initialSelected={catalogSelection}
          query={pageQuery}
          onClearQuery={clearQuery}
          navigate={navigate}
          onUseRoutine={(id) => {
            setRoutineId(id);
            navigate('prepare', 'gas');
          }}
          onEditRoutine={(id) => navigate('routine-edit', id)}
        />
      )}
      {page === 'routine-edit' && (
        <RoutineEditor
          key={routine.id}
          name={routine.name}
          revision={routine.revision}
          routine={
            routineDefinitions[routine.id] ??
            catalogRoutineDefinitions[routine.id]
          }
          breadcrumbs={[
            home,
            { label: 'Routines', onClick: () => navigate('routines') },
            { label: routine.name },
          ]}
          onDiscard={() => navigate('routines')}
        />
      )}
      {page === 'instruments' && (
        <InstrumentsPage
          key={catalogSelection ?? ''}
          initialSelected={catalogSelection}
          query={pageQuery}
          onClearQuery={clearQuery}
          navigate={navigate}
        />
      )}
      {page === 'settings' && (
        <>
          <PageHeader
            title={pages.settings.title}
            breadcrumbs={[home, { label: pages.settings.title }]}
            description="Applies to everyone using DVDash on this computer."
          />
          <ScreenBody>
            <SettingsPage
              hideHeader
              settings={{
                ...settings,
                theme: appearance.preference,
                textSize: appearance.textSize,
              }}
              build={buildInfo}
              folderState={folderState}
              onChange={changeSetting}
              onChooseFolder={chooseFolder}
              onCopyCommit={(commit) => navigator.clipboard?.writeText(commit)}
            />
          </ScreenBody>
        </>
      )}
      <RecordingImport
        opened={dialog === 'recording'}
        onClose={() => setDialog(null)}
        presets={recordingPresetOptions}
        readFile={readRecordingFile}
        importFile={async (file, name, importPreset) => {
          setRows((current) => [
            {
              id: `import-${file.id}`,
              name,
              presetId: importPreset,
              status: 'Recorded',
              date: REVIEW_NOW.toISOString(),
              samples: 0,
              input: 'Recorded file',
            },
            ...current.filter((row) => row.id !== `import-${file.id}`),
          ]);
        }}
      />
      {/* Fixture: the preset catalog is static, so a checked definition is accepted without being added to it. */}
      <PresetImport
        opened={dialog === 'definition'}
        onClose={() => setDialog(null)}
        checkFile={checkPresetFile}
        importPreset={async () => {}}
      />
    </ScreenShell>
  );
}
