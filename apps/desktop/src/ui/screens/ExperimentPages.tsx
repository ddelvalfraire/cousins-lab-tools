import { Tabs } from '@mantine/core';
import { useInterval, useTimeout } from '@mantine/hooks';
import { IconDownload, IconPlayerPlay } from '@tabler/icons-react';
import { type KeyboardEvent, useState } from 'react';
import { usePendingTimeouts } from '@/shared/hooks/usePendingTimeouts';
import { Presence, Swap } from '@/shared/motion/Motion';
import {
  type ExperimentSummary,
  type PresetSpec,
  routines,
} from '@/shared/testing/screen-fixtures';
import { Chip, StatusWord } from '@/shared/ui/Chip';
import { HeaderButton, PageHeader } from '@/shared/ui/PageHeader';
import { StatusBanner } from '@/shared/ui/Primitives';
import { ReviewIcon } from '@/shared/ui/ReviewIcons';
import {
  RightSidebar,
  SidebarFacts,
  SidebarIcon,
  SidebarSection,
  WorkspaceBody,
} from '@/shared/ui/RightSidebar';
import { useAcquisitionControls } from '../components/AcquisitionControls';
import { CalibrationChecklist } from '../components/CalibrationChecklist';
import type { IntervalResult } from '../components/ExperimentPanels';
import {
  DerivedCard,
  DetailsPane,
  DisplayPane,
  type DisplaySettings,
  ExperimentSidebar,
  type ExperimentSidebarTab,
  Flagged,
  LiveSummary,
  PlaybackChartCard,
  PlaybackShortcuts,
  PlaybackTransport,
  RecordedSamples,
  SignalsPane,
  StreamCard,
  sampleIndexAt,
} from '../components/ExperimentWorkspace';
import {
  liveProblems,
  liveStreams,
  recordedChannels,
  recordedProblems,
  recordedSamples,
  recordedSamplesWithGap,
} from '../components/ExperimentWorkspace.fixtures';
import {
  PanelSourceAppliedPane,
  PanelSourceBindingPane,
  PanelSourceChart,
  usePanelSource,
} from '../components/PanelSource';
import {
  type Problem,
  type ProblemActionStatus,
  ProblemsTrigger,
  problemsSummary,
  type ResolvedProblem,
} from '../components/ProblemsPanel';
import {
  AlignmentPreviewChart,
  RecordingAlignmentInspector,
  useAlignmentEditor,
} from '../components/RecordingAlignment';
import {
  type ExportResult,
  RecordingExportDialog,
  type RecordingExportPhase,
  type RecordingExportSettings,
} from '../components/RecordingExport';
import {
  SavedResultInspector,
  SavedResultsTable,
  useSavedResultInspector,
} from '../components/SavedResults';
import {
  alignmentDefaults,
  alignmentEvents,
  alignmentRecordings,
  calibrationSteps,
  exportCsv,
  exportDefaults,
  exportRowCount,
  exportSignals,
  resultQuantity,
  reviewChannels,
  reviewSignalUnit,
  reviewSources,
  savedAlignment,
  savedResultsFor,
  summarizeMass44,
} from './review-fixtures';
import type { Navigate } from './ScreenShell';

/** Starting state of the experiment page, for frozen review stories. Every field is optional. */
export interface ExperimentViewOptions {
  /** Right sidebar tab. Defaults to Details. */
  tab?: ExperimentSidebarTab;
  sidebarCollapsed?: boolean;
  /** Start with the sample problems (live) or the recording gap (recorded). Defaults to none. */
  problems?: 'present' | 'none';
  /** Problem selected in the Problems tab; its panels are flagged. */
  selectedProblem?: string | null;
  /** Live: open the stop confirmation. */
  stopDialogOpen?: boolean;
  /** Live: start in this acquisition state instead of acquiring. */
  acquisition?: 'acquiring' | 'stopping' | 'recorded';
  /** Recorded: start playing. */
  playing?: boolean;
  /** Recorded: playback position in seconds. Defaults to 42 s, or the end of a short recording. */
  position?: number;
  /** Keep timers off: playback doesn't advance, and stops and fixes stay in progress. */
  frozen?: boolean;
}

const STEP = 0.5;
const now = () => new Date().toTimeString().slice(0, 8);
const parse = (text: string) => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(n) ? n : null;
};

/**
 * The experiment page inside the frame: shared header, workspace and right sidebar.
 * Live: acquisition controls in the header and live stream cards (right-sidebar-review.html, start-acquisition-review.html,
 * stop-confirmation-review.html). Recorded: the compact sticky playback transport over the charts (sticky-playback-review.html).
 * Problems: diagnostics-review.html.
 */
export function CapturePage({
  experiment,
  preset,
  navigate,
  unavailable = false,
  onStop,
  view = {},
}: {
  experiment: ExperimentSummary;
  preset: PresetSpec;
  navigate: Navigate;
  unavailable?: boolean;
  rows?: IntervalResult[];
  onResultsChange?: (rows: IntervalResult[]) => void;
  onStop: () => void;
  view?: ExperimentViewOptions;
}) {
  // Fixed at mount: stopping marks the experiment Recorded, but this page still holds the run it acquired.
  const [startedLive] = useState(experiment.status === 'Running');
  const [acquisition, setAcquisition] = useState(
    view.acquisition ?? (startedLive ? 'acquiring' : 'recorded'),
  );
  const live = acquisition !== 'recorded';
  const shortName = experiment.name.split(' · ').pop() ?? experiment.name;
  const liveSamples = experiment.samples,
    liveSeconds = liveSamples * STEP;

  // Recording: a stopped live run keeps the samples it took; a recorded file has its own.
  const rows = startedLive
    ? recordedSamples.slice(0, liveSamples)
    : view.problems === 'present'
      ? recordedSamplesWithGap
      : recordedSamples;
  const duration = rows.length ? rows[rows.length - 1].time : 0;

  const [tab, setTab] = useState<ExperimentSidebarTab>(view.tab ?? 'details');
  const [collapsed, setCollapsed] = useState(view.sidebarCollapsed ?? false);
  const [problems, setProblems] = useState<Problem[]>(
    view.problems === 'present' ? (live ? liveProblems : recordedProblems) : [],
  );
  const [resolved, setResolved] = useState<ResolvedProblem[]>([]);
  const [selected, setSelected] = useState<string | null>(
    view.selectedProblem ?? null,
  );
  const [actionStatus, setActionStatus] = useState<
    Record<string, ProblemActionStatus | undefined>
  >({});
  const [sampleName, setSampleName] = useState(shortName);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [display, setDisplay] = useState<DisplaySettings>({
    scale: 'auto',
    min: '1.8',
    max: '2.9',
    precision: 2,
  });
  const [position, setPosition] = useState(
    Math.min(duration, view.position ?? 42),
  );
  const [playing, setPlaying] = useState(view.playing ?? false);
  const [speed, setSpeed] = useState(1);
  const { schedule, ref: clearOnUnmount } = usePendingTimeouts();
  const later = (fn: () => void, ms: number) => {
    if (!view.frozen) schedule(fn, ms);
  };

  // Playback advances in real time; it stops at the end.
  const canPlay = !view.frozen && !live;
  const playback = useInterval(
    () =>
      setPosition((p) => {
        const next = Math.min(duration, p + 0.1 * speed);
        if (next >= duration) changePlaying(false);
        return next;
      }),
    100,
    { autoInvoke: playing && canPlay },
  );
  const changePlaying = (next: boolean) => {
    setPlaying(next);
    if (next && canPlay) playback.start();
    else playback.stop();
  };

  const stop = () => {
    setAcquisition('stopping');
    later(() => {
      setAcquisition('recorded');
      setPosition(duration);
      changePlaying(false);
      setProblems([]);
      setSelected(null);
      onStop();
    }, 600);
  };
  const acq = useAcquisitionControls({
    state: acquisition,
    experimentName: shortName,
    instrument: 'MS-01',
    samples: live || startedLive ? liveSamples : rows.length,
    elapsedSeconds: live || startedLive ? liveSeconds : duration,
    defaultStopDialogOpen: view.stopDialogOpen,
    onStart: () => {},
    onConnect: () => {},
    onStop: stop,
    recordedAction: (
      <HeaderButton onClick={() => navigate('review', experiment.id)}>
        Review & export
      </HeaderButton>
    ),
  });

  const problemProps = {
    problems,
    resolved,
    selectedId: selected,
    actionStatus,
    lastChecked: '14:05:12',
    onSelect: setSelected,
    onNavigate: (next: string) => setTab(next as ExperimentSidebarTab),
    onDismiss: (id: string) => {
      const problem = problems.find((p) => p.id === id);
      if (!problem) return;
      setProblems((ps) => ps.filter((p) => p.id !== id));
      setResolved((rs) => [
        ...rs,
        { id, title: problem.title, how: 'dismissed', at: now() },
      ]);
      if (selected === id) setSelected(null);
    },
    onAction: (id: string, actionId: string) => {
      const problem = problems.find((p) => p.id === id),
        action = problem?.actions.find((a) => a.id === actionId);
      if (!problem || !action) return;
      if (action.kind === 'locate') {
        document
          .querySelector(`[data-panel="${problem.affects[0]?.id}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      if (action.kind !== 'fix') return;
      setActionStatus((s) => ({ ...s, [id]: 'pending' }));
      later(() => {
        setActionStatus((s) => ({ ...s, [id]: undefined }));
        setProblems((ps) => ps.filter((p) => p.id !== id));
        setResolved((rs) => [
          ...rs,
          { id, title: problem.title, how: 'fixed', at: now() },
        ]);
        setSelected((s) => (s === id ? null : s));
      }, 900);
    },
  };
  const { severity } = problemsSummary(problems);
  const openProblems = () => {
    setTab('problems');
    setCollapsed(false);
  };

  // Display settings apply to Mass 44.
  const min = parse(display.min),
    max = parse(display.max),
    fixedRange =
      display.scale === 'fixed' && min !== null && max !== null && min < max;
  const failing = (panel: string) =>
    problems.some(
      (p) => p.severity === 'error' && p.affects.some((a) => a.id === panel),
    );
  const streams = liveStreams.map((s) =>
    unavailable && s.id === 'mass44'
      ? { ...s, points: s.points.map((p) => ({ ...p, value: null })) }
      : s,
  );
  const mass44 =
    streams[0].points.filter((p) => p.value !== null).pop()?.value ?? null;
  const derivedMissing =
    unavailable ||
    problems.some((p) => p.affects.some((a) => a.id === 'derived'));
  const recordedSignals = recordedChannels.map((c) => ({
    id: c.id,
    title: c.name,
    source: 'MS-01',
    unit: c.unit,
  }));

  const sidebar = (
    <ExperimentSidebar
      tab={tab}
      onTabChange={setTab}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      subtitle={experiment.name.split(' · ')[0]}
      problems={problemProps}
      details={
        <DetailsPane
          sampleName={sampleName}
          onSampleNameChange={setSampleName}
          presetName={preset.name}
          presetRevision={preset.revision}
          facts={
            live
              ? [
                  ['Mode', 'Selected streams'],
                  [
                    'Inputs',
                    `${liveStreams.filter((s) => s.captured).length} of ${liveStreams.length} streams`,
                  ],
                  ['Derived output', 'Dissolved CO₂'],
                ]
              : [
                  ['Mode', 'Recording'],
                  ['Inputs', `${recordedChannels.length} streams`],
                  ['Derived output', 'Dissolved CO₂'],
                ]
          }
        />
      }
      signals={
        <SignalsPane
          signals={live ? liveStreams : recordedSignals}
          hidden={hidden}
          onVisibleChange={(id, visible) =>
            setHidden((h) => {
              const next = new Set(h);
              if (visible) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          derived={[{ title: 'Dissolved CO₂', detail: 'Mass 44 → nmol/mL' }]}
        />
      }
      display={
        <DisplayPane
          signal="Mass 44"
          settings={display}
          onChange={setDisplay}
          axes={[
            ['Horizontal', 'Time · s'],
            ['Vertical', 'Signal · mV'],
          ]}
        />
      }
    />
  );

  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea, [role="tablist"]')) return;
    if (event.key === ' ' && !target.closest('button')) {
      event.preventDefault();
      changePlaying(!playing);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      changePlaying(false);
      setPosition((p) =>
        Math.min(
          duration,
          Math.max(0, p + (event.key === 'ArrowLeft' ? -STEP : STEP)),
        ),
      );
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      changePlaying(false);
      setPosition(event.key === 'Home' ? 0 : duration);
    }
  };

  return (
    <div
      className="dv-xw-page"
      data-problem-severity={severity}
      ref={clearOnUnmount}
    >
      <PageHeader
        title={experiment.name}
        titleId="dv-experiment-title"
        breadcrumbs={[
          { label: 'Workspace', onClick: () => navigate('experiments') },
          { label: 'Experiments', onClick: () => navigate('experiments') },
          { label: shortName },
        ]}
        meta={
          <>
            {acq.meta}
            <ProblemsTrigger
              problems={problems}
              controls="dv-experiment-sidebar-pane"
              onOpen={openProblems}
            />
          </>
        }
        actions={acq.action}
      />
      <WorkspaceBody sidebar={sidebar}>
        <Swap swapKey={live ? 'live' : 'recorded'}>
          {live ? (
            <div className="dv-xw-live">
              <LiveSummary
                items={[
                  { label: 'Live acquisition', value: clock(liveSeconds) },
                  { label: 'Capture duration', value: clock(liveSeconds) },
                  { label: 'Recorded samples', value: liveSamples },
                ]}
              />
              <p className="dv-xw-scope">
                {liveStreams.length} live streams ·{' '}
                {liveStreams.filter((s) => s.captured).length} selected for
                capture · Dissolved CO₂ is a derived component.
              </p>
              <section className="dv-xw-streams" aria-label="Live data streams">
                {streams.map((s) => (
                  <Presence
                    key={s.id}
                    show={!hidden.has(s.id)}
                    variant="fade"
                    className="dv-xw-card-slot"
                  >
                    <Flagged
                      panel={s.id}
                      problems={problems}
                      selectedId={selected}
                    >
                      <StreamCard
                        stream={s}
                        stale={
                          failing(s.id) || (unavailable && s.id === 'mass44')
                        }
                        {...(s.id === 'mass44'
                          ? {
                              precision: display.precision,
                              ...(fixedRange
                                ? { min: min as number, max: max as number }
                                : {}),
                            }
                          : {})}
                      />
                    </Flagged>
                  </Presence>
                ))}
              </section>
              <div className="dv-xw-derived-slot">
                <Flagged
                  panel="derived"
                  problems={problems}
                  selectedId={selected}
                >
                  <DerivedCard
                    title="Dissolved CO₂"
                    description="Derived from Mass 44 · included in the capture while available"
                    value={
                      mass44 === null ? '—' : (mass44 * 5 + 0.88).toFixed(2)
                    }
                    unit="nmol/mL"
                    unavailable={
                      derivedMissing ? 'Can’t be calculated' : undefined
                    }
                  />
                </Flagged>
              </div>
              <p className="dv-xw-caption">
                Simulated live data · 2 samples/s per healthy stream.
              </p>
            </div>
          ) : (
            <div className="dv-xw-recorded" role="none" onKeyDown={onKeys}>
              {startedLive && acq.status}
              <PlaybackTransport
                position={position}
                duration={duration}
                playing={playing}
                speed={speed}
                step={STEP}
                sampleIndex={sampleIndexAt(rows, position)}
                sampleCount={rows.length}
                onSeek={setPosition}
                onPlayingChange={changePlaying}
                onSpeedChange={setSpeed}
              />
              <Flagged panel="charts" problems={problems} selectedId={selected}>
                <section className="dv-xw-charts" aria-label="Recorded signals">
                  {recordedChannels.map((c) => (
                    <Presence
                      key={c.id}
                      show={!hidden.has(c.id)}
                      variant="fade"
                      className="dv-xw-card-slot"
                    >
                      <PlaybackChartCard
                        channel={c}
                        rows={rows}
                        position={position}
                        duration={duration}
                      />
                    </Presence>
                  ))}
                </section>
              </Flagged>
              <CalibrationChecklist
                steps={calibrationSteps}
                signal="Mass 44"
                file={`${experiment.id}.csv`}
                recording={[0, duration]}
                defaultInterval={[
                  Math.round(duration * 0.4),
                  Math.min(duration, Math.round(duration * 0.4) + 20),
                ]}
                summarize={(start, end) => summarizeMass44(rows, start, end)}
                onCapture={() =>
                  new Promise<void>((resolve) =>
                    window.setTimeout(resolve, view.frozen ? 0 : 650),
                  )
                }
              />
              <RecordedSamples
                key={rows.length}
                rows={rows}
                position={position}
              />
              <PlaybackShortcuts />
            </div>
          )}
        </Swap>
      </WorkspaceBody>
      {acq.dialog}
    </div>
  );
}

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export type ReviewTab = 'overview' | 'alignment' | 'results';
const statusWords: Record<
  string,
  { tone: 'neutral' | 'accent' | 'warning'; icon: 'check' | 'signals' | 'warn' }
> = {
  Running: { tone: 'accent', icon: 'signals' },
  Recorded: { tone: 'neutral', icon: 'check' },
  Interrupted: { tone: 'warning', icon: 'warn' },
};
const clockDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));

/**
 * Review & export: the recording's signals and details (Overview), the comparison with a reference (Align & compare)
 * and saved interval results (Results), each beside its inspector in the right sidebar. Export opens the export dialog.
 * Values from source-binding-review.html, alignment-inspector-review.html, saved-result-inspector-review.html and
 * recording-export-review.html.
 */
export function ReviewPage({
  experiment,
  preset,
  navigate,
  rows,
  onDownload,
  initialTab = 'overview',
  initialExport = false,
}: {
  experiment: ExperimentSummary;
  preset: PresetSpec;
  navigate: Navigate;
  rows: IntervalResult[];
  /** Saves an exported file. */
  onDownload: (name: string, text: string, type: string) => void;
  initialTab?: ReviewTab;
  /** Start with the export dialog open, for review stories. */
  initialExport?: boolean;
}) {
  const [tab, setTab] = useState<ReviewTab>(initialTab),
    [tabChanged, setTabChanged] = useState(false);
  const [overviewTab, setOverviewTab] = useState('details');
  const shortName = experiment.name.split(' · ').pop() ?? experiment.name;

  const [sources] = useState(() => reviewSources(experiment));
  const source = usePanelSource({
    sources,
    channels: reviewChannels,
    requires: reviewSignalUnit,
    applied: {
      source: experiment.id,
      signals: reviewChannels.map((c) => c.id),
    },
    interval: [120, 140],
    onApply: () =>
      new Promise<void>((resolve) => window.setTimeout(resolve, 650)),
  });
  const [recordings] = useState(() => alignmentRecordings(experiment));
  const alignment = useAlignmentEditor({
    recordings,
    saved: {
      ...savedAlignment,
      origins: alignmentDefaults(recordings).origins,
    },
    onSave: () =>
      new Promise<void>((resolve) => window.setTimeout(resolve, 650)),
  });
  const results = savedResultsFor(experiment, preset, rows),
    quantity = resultQuantity(preset);
  const inspector = useSavedResultInspector({ results });

  const [exportOpen, setExportOpen] = useState(initialExport),
    [phase, setPhase] = useState<RecordingExportPhase>('ready');
  const [exportValue, setExportValue] = useState<RecordingExportSettings>(() =>
      exportDefaults(experiment),
    ),
    [exported, setExported] = useState<ExportResult>();
  const exportRows = exportRowCount(exportValue);
  const saveExport = () => {
    const name = `${exportValue.fileName.trim()}.${exportValue.format}`;
    const csv = exportCsv(exportValue, sources[0]);
    if (exportValue.format === 'csv') onDownload(name, csv, 'text/csv');
    else {
      const [header, ...lines] = csv.split('\n'),
        keys = header.split(',');
      onDownload(
        name,
        JSON.stringify(
          {
            recording: experiment.name,
            ...(exportValue.includePreset
              ? { preset: { name: preset.name, revision: preset.revision } }
              : {}),
            rows: lines.map((line) =>
              Object.fromEntries(
                line
                  .split(',')
                  .map((v, i) => [keys[i], v === '' ? null : Number(v)]),
              ),
            ),
          },
          null,
          2,
        ),
        'application/json',
      );
    }
    return name;
  };
  const finishExport = () => {
    const fileName = saveExport();
    setExported({
      fileName,
      rows: exportRows,
      signals: exportValue.signals.length,
      duration:
        exportValue.range === 'full'
          ? 300
          : Number(exportValue.end) - Number(exportValue.start),
    });
    setPhase('done');
  };
  const exportTimeout = useTimeout(finishExport, 600);
  const startExport = () => {
    setPhase('preparing');
    exportTimeout.start();
  };
  const closeExport = () => {
    exportTimeout.clear();
    setExportOpen(false);
    setPhase('ready');
  };

  const setup = experiment.setup,
    status = statusWords[experiment.status] ?? statusWords.Recorded;
  const overviewSidebar = (
    <RightSidebar
      label="Recording inspector"
      tabsLabel="Recording tools"
      activeTab={overviewTab}
      onTabChange={setOverviewTab}
      subtitle={overviewTab === 'details' ? shortName : undefined}
      title={
        overviewTab === 'details'
          ? 'Recording details'
          : overviewTab === 'binding'
            ? 'Panel source'
            : 'Applied source'
      }
      tabs={[
        {
          id: 'details',
          label: 'Details',
          icon: <SidebarIcon name="details" />,
        },
        { id: 'binding', label: 'Data', icon: <SidebarIcon name="signals" /> },
        { id: 'context', label: 'Source', icon: <SidebarIcon name="panels" /> },
      ]}
    >
      {overviewTab === 'binding' ? (
        <PanelSourceBindingPane
          editor={source}
          sources={sources}
          channels={reviewChannels}
        />
      ) : overviewTab === 'context' ? (
        <PanelSourceAppliedPane
          editor={source}
          sources={sources}
          channels={reviewChannels}
        />
      ) : (
        <>
          <SidebarSection title="Recording">
            <SidebarFacts
              items={[
                ['Source', `${experiment.id}.csv`],
                ['Preset', `${preset.name} · R${preset.revision}`],
                ['Signals', reviewChannels.map((c) => c.label).join(', ')],
                ['Samples', sources[0].samples],
                ['Time', 'Elapsed time from the recording’s start'],
              ]}
            />
          </SidebarSection>
          {setup && (
            <SidebarSection title="Requested setup">
              <SidebarFacts
                items={[
                  [
                    'Routine',
                    routines.find((r) => r.id === setup.routine)?.name ??
                      'None',
                  ],
                  ['Interval', `${setup.interval} s`],
                  ['Initial delay', `${setup.delay} s`],
                  [
                    'If an instrument fails',
                    setup.failure === 'stop'
                      ? 'Stop the group'
                      : 'Continue other instruments',
                  ],
                ]}
              />
            </SidebarSection>
          )}
          <SidebarSection title="Saved work">
            <SidebarFacts
              items={[
                ['Results', `${rows.length} saved`],
                ['Calibration', 'Saved with each result'],
              ]}
            />
          </SidebarSection>
        </>
      )}
    </RightSidebar>
  );

  return (
    <Tabs
      className="dv-review-page"
      value={tab}
      onChange={(value) => {
        if (value) {
          setTab(value as ReviewTab);
          setTabChanged(true);
        }
      }}
      keepMounted={false}
      data-motion={tabChanged ? 'swap' : undefined}
    >
      <PageHeader
        title={experiment.name}
        titleId="dv-review-title"
        breadcrumbs={[
          { label: 'Workspace', onClick: () => navigate('experiments') },
          { label: 'Experiments', onClick: () => navigate('experiments') },
          { label: shortName },
        ]}
        meta={
          <>
            <StatusWord
              tone={status.tone}
              icon={<ReviewIcon name={status.icon} />}
            >
              {experiment.status}
            </StatusWord>
            <Chip icon={<SidebarIcon name="panels" />}>{preset.name}</Chip>
            <Chip icon={<SidebarIcon name="revisions" />}>
              R{preset.revision}
            </Chip>
          </>
        }
        actions={
          <>
            <HeaderButton
              icon={<IconPlayerPlay aria-hidden />}
              onClick={() => navigate('experiment', experiment.id)}
            >
              Open recording
            </HeaderButton>
            <HeaderButton
              variant="primary"
              icon={<IconDownload aria-hidden />}
              onClick={() => setExportOpen(true)}
            >
              Export recording
            </HeaderButton>
          </>
        }
        navigation={
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="alignment">Align & compare</Tabs.Tab>
            <Tabs.Tab value="results">Results</Tabs.Tab>
          </Tabs.List>
        }
      />
      <Tabs.Panel value="overview">
        <WorkspaceBody sidebar={overviewSidebar}>
          {experiment.status === 'Interrupted' && (
            <div className="dv-review-notice">
              <StatusBanner severity="warning">
                The experiment was interrupted. Samples recorded before then are
                kept.
              </StatusBanner>
            </div>
          )}
          <PanelSourceChart
            editor={source}
            sources={sources}
            channels={reviewChannels}
            title="Mass signals"
          />
        </WorkspaceBody>
      </Tabs.Panel>
      <Tabs.Panel value="alignment">
        <WorkspaceBody
          sidebar={
            <RecordingAlignmentInspector
              editor={alignment}
              recordings={recordings}
              events={alignmentEvents}
            />
          }
        >
          <AlignmentPreviewChart
            editor={alignment}
            recordings={recordings}
            events={alignmentEvents}
            title="Mass 44"
            clockDate={clockDate(experiment.date)}
          />
        </WorkspaceBody>
      </Tabs.Panel>
      <Tabs.Panel value="results">
        <WorkspaceBody
          sidebar={
            <SavedResultInspector
              result={inspector.result}
              phase={inspector.phase}
              quantity={quantity}
              tab={inspector.tab}
              onTabChange={inspector.setTab}
              collapsed={inspector.collapsed}
              onCollapsedChange={inspector.setCollapsed}
              onRetry={inspector.retry}
              onExport={(result) => {
                onDownload(
                  `${result.id}.json`,
                  JSON.stringify(result, null, 2),
                  'application/json',
                );
              }}
            />
          }
        >
          <SavedResultsTable
            results={results}
            quantity={quantity}
            selectedId={inspector.selectedId}
            expanded={!inspector.collapsed}
            onOpen={inspector.open}
          />
        </WorkspaceBody>
      </Tabs.Panel>
      <RecordingExportDialog
        opened={exportOpen}
        phase={phase}
        recording={{
          name: experiment.name,
          duration: 300,
          preset: { name: preset.name, revision: preset.revision },
        }}
        signals={exportSignals}
        value={exportValue}
        onChange={setExportValue}
        rows={exportRows}
        result={exported}
        onExport={startExport}
        onCancelExport={() => {
          exportTimeout.clear();
          setPhase('ready');
        }}
        onDownloadAgain={saveExport}
        onClose={closeExport}
      />
    </Tabs>
  );
}
