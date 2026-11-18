import { Select, useComputedColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import { Chip } from './Chip';
import {
  Announcer,
  InspectorButton,
  InspectorIcon,
  InspectorPane,
  parseNumber,
  UnitInput,
} from './InspectorParts';
import { Presence } from './Motion';
import { type Severity, StatusBanner } from './Primitives';
import { RightSidebar, type RightSidebarTab } from './RightSidebar';
import { ScientificPlot } from './SignalChart';
import { chosen } from './select';
import { useKeyedValue } from './useKeyedValue';
import './RecordingAlignment.css';

export type AlignmentMethod = 'event' | 'elapsed' | 'clock';
export interface AlignmentEvent {
  id: string;
  label: string;
}
export interface AlignmentRecording {
  id: string;
  name: string;
  file: string;
  /** Line style shared by the chart, legend and swatch. */
  line: 'solid' | 'dashed';
  signal: string;
  unit: string;
  duration: number;
  /** Number of samples. */
  samples: number;
  /** False when the recording could not be loaded. */
  available: boolean;
  /** UTC clock time of the first sample (hh:mm:ss), or null when the recording has none. */
  clockStart: string | null;
  /** When each shared event happened, in seconds since this recording started. */
  events: Readonly<Record<string, number>>;
  data: readonly { t: number; y: number }[];
}
/** What "time zero" means. Event times are kept as typed so invalid entries stay visible. */
export interface AlignmentSettings {
  method: AlignmentMethod;
  event: string;
  origins: Readonly<Record<string, string>>;
}
export type AlignmentStatus = 'idle' | 'saving' | 'failed' | 'saved';
export type AlignmentProblem = {
  text: string;
  severity: Exclude<Severity, 'success'>;
  kind: 'unavailable' | 'clock' | 'event';
};

const methods: { value: AlignmentMethod; label: string; help: string }[] = [
  {
    value: 'event',
    label: 'Shared event',
    help: 'Set the same event to 0 s in both recordings.',
  },
  {
    value: 'elapsed',
    label: 'Elapsed since each start',
    help: 'Compare time since each recording began.',
  },
  {
    value: 'clock',
    label: 'Clock time',
    help: 'Compare using recorded clock timestamps.',
  },
];
const clockSeconds = (clock: string) => {
  const [h, m, s] = clock.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};
const outside = (text: string | undefined, duration: number) => {
  const v = parseNumber(text ?? '');
  return !Number.isFinite(v) || v < 0 || v > duration;
};

/** Why the alignment can't be shown or applied, or null. */
export function alignmentProblem(
  settings: AlignmentSettings,
  recordings: readonly AlignmentRecording[],
): AlignmentProblem | null {
  const missing = recordings.find((r) => !r.available),
    other = recordings.find((r) => r.available);
  if (missing)
    return {
      kind: 'unavailable',
      severity: 'error',
      text: `${missing.name} could not be loaded.${other ? ` ${other.name} is still available.` : ''}`,
    };
  if (
    settings.method === 'clock' &&
    recordings.some((r) => r.clockStart === null)
  )
    return {
      kind: 'clock',
      severity: 'warning',
      text: 'Comparable clock timestamps are missing. Use elapsed time or a shared event.',
    };
  if (
    settings.method === 'event' &&
    recordings.some((r) => outside(settings.origins[r.id], r.duration))
  )
    return {
      kind: 'event',
      severity: 'error',
      text: `Enter each event time between 0 and ${Math.min(...recordings.map((r) => r.duration))} s.`,
    };
  return null;
}

/** Display time of each recording's first sample: subtract it from the recorded time to get the aligned time. */
export function alignmentOrigins(
  settings: AlignmentSettings,
  recordings: readonly AlignmentRecording[],
): number[] {
  if (settings.method === 'event')
    return recordings.map((r) => parseNumber(settings.origins[r.id] ?? ''));
  if (settings.method === 'clock' && recordings.every((r) => r.clockStart)) {
    const first = Math.min(
      ...recordings.map((r) => clockSeconds(r.clockStart!)),
    );
    return recordings.map((r) => first - clockSeconds(r.clockStart!));
  }
  return recordings.map(() => 0);
}

export interface AlignmentEditor {
  settings: AlignmentSettings;
  saved: AlignmentSettings;
  dirty: boolean;
  problem: AlignmentProblem | null;
  status: AlignmentStatus;
  announcement: string;
  setMethod: (method: AlignmentMethod) => void;
  setEvent: (event: string) => void;
  setOrigin: (recording: string, value: string) => void;
  apply: () => void;
  discard: () => void;
}

/**
 * Draft alignment shared by the inspector and the chart: the chart previews the draft at once;
 * Apply stores it through `onSave`. A failed save keeps the preview.
 */
export function useAlignmentEditor({
  recordings,
  saved: initialSaved,
  initialSettings,
  initialStatus = 'idle',
  onSave,
}: {
  recordings: readonly AlignmentRecording[];
  /** The stored alignment. */
  saved: AlignmentSettings;
  /** Draft shown first. Defaults to the stored alignment. */
  initialSettings?: AlignmentSettings;
  initialStatus?: AlignmentStatus;
  onSave?: (settings: AlignmentSettings) => Promise<void> | void;
}): AlignmentEditor {
  const [saved, setSaved] = useState(initialSaved),
    [settings, setSettings] = useState(initialSettings ?? initialSaved);
  const [status, setStatus] = useState<AlignmentStatus>(initialStatus),
    [announcement, setAnnouncement] = useState('');
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const problem = alignmentProblem(settings, recordings);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const edit = (next: AlignmentSettings) => {
    setSettings(next);
    if (status !== 'saving') setStatus('idle');
  };
  return {
    settings,
    saved,
    dirty,
    problem,
    status,
    announcement,
    setMethod: (method) => edit({ ...settings, method }),
    setEvent: (event) =>
      edit({
        ...settings,
        event,
        origins: Object.fromEntries(
          recordings.map((r) => [
            r.id,
            r.events[event] === undefined ? '' : String(r.events[event]),
          ]),
        ),
      }),
    setOrigin: (recording, value) =>
      edit({
        ...settings,
        origins: { ...settings.origins, [recording]: value },
      }),
    apply: async () => {
      if (problem || status === 'saving' || !dirty) return;
      const target = settings,
        token = ++epoch.current;
      setStatus('saving');
      try {
        await onSave?.(target);
      } catch {
        if (token === epoch.current) {
          setStatus('failed');
          setAnnouncement('Alignment could not be saved. Retry available.');
        }
        return;
      }
      if (token !== epoch.current) return;
      setSaved(target);
      setStatus('saved');
      setAnnouncement('Alignment saved.');
    },
    discard: () => {
      epoch.current++;
      setSettings(saved);
      setStatus('idle');
    },
  };
}

const FIELD = { method: 'Align recordings by', event: 'Event' };
const tabs: RightSidebarTab[] = [
  { id: 'align', label: 'Align', icon: <InspectorIcon name="align" /> },
  { id: 'sources', label: 'Sources', icon: <InspectorIcon name="file" /> },
];

/**
 * Right-sidebar inspector for comparing recordings: Align (reference mode, event, origins, Apply) and Sources.
 * Values from design/dvdash-field-review/alignment-inspector-review.html.
 */
export function RecordingAlignmentInspector({
  editor,
  recordings,
  events,
  tab: controlledTab,
  defaultTab = 'align',
  onTabChange,
  collapsed,
  onCollapsedChange,
}: {
  editor: AlignmentEditor;
  recordings: readonly AlignmentRecording[];
  events: readonly AlignmentEvent[];
  tab?: 'align' | 'sources';
  defaultTab?: 'align' | 'sources';
  onTabChange?: (tab: 'align' | 'sources') => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [ownTab, setOwnTab] = useState(defaultTab),
    tab = controlledTab ?? ownTab;
  return (
    <RightSidebar
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => {
        setOwnTab(id as 'align');
        onTabChange?.(id as 'align');
      }}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      title={tab === 'align' ? 'Alignment' : 'Sources'}
      label="Recording inspector"
      tabsLabel="Recording tools"
    >
      {tab === 'align' ? (
        <AlignmentPane
          editor={editor}
          recordings={recordings}
          events={events}
        />
      ) : (
        <AlignmentSourcesPane recordings={recordings} />
      )}
    </RightSidebar>
  );
}

function AlignmentPane({
  editor,
  recordings,
  events,
}: {
  editor: AlignmentEditor;
  recordings: readonly AlignmentRecording[];
  events: readonly AlignmentEvent[];
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    messageId = `${id}-message`;
  const { settings, problem, status, dirty } = editor,
    saving = status === 'saving',
    event = settings.method === 'event';
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === 'saving' && status === 'failed')
      root.current
        ?.querySelector<HTMLElement>('[data-action="retry"]')
        ?.focus();
    if (previous.current === 'saving' && status === 'saved')
      root.current?.querySelector<HTMLElement>('.dv-select-input')?.focus();
    previous.current = status;
  }, [status]);
  const discard = () => {
    editor.discard();
    root.current?.querySelector<HTMLElement>('.dv-select-input')?.focus();
  };
  const origins = alignmentOrigins(settings, recordings);
  return (
    <InspectorPane
      ref={root}
      label="Alignment settings"
      actions={
        <>
          <div className="dv-insp-action-row">
            <InspectorButton
              variant="primary"
              disabled={!!problem || saving || !dirty}
              onClick={editor.apply}
            >
              {saving ? 'Applying…' : 'Apply alignment'}
            </InspectorButton>
            <InspectorButton
              variant="quiet"
              disabled={saving || !dirty}
              onClick={discard}
            >
              Discard
            </InspectorButton>
          </div>
          <Presence show={status === 'failed'}>
            <div className="dv-insp-status">
              <StatusBanner severity="error">
                Could not save the alignment. Your preview is retained.{' '}
                <button
                  type="button"
                  className="dv-insp-link"
                  data-action="retry"
                  onClick={editor.apply}
                >
                  Retry
                </button>
              </StatusBanner>
            </div>
          </Presence>
          <Presence show={status === 'saved'}>
            <div className="dv-insp-status">
              <StatusBanner severity="info">Alignment saved.</StatusBanner>
            </div>
          </Presence>
          <Announcer message={editor.announcement} />
        </>
      }
    >
      <div className="dv-insp-field">
        <label htmlFor={`${id}-method`}>{FIELD.method}</label>
        <Select
          id={`${id}-method`}
          aria-label={FIELD.method}
          value={settings.method}
          disabled={saving}
          data={methods}
          onChange={chosen((value) =>
            editor.setMethod(value as AlignmentMethod),
          )}
        />
      </div>
      <p className="dv-insp-help">
        {methods.find((m) => m.value === settings.method)!.help}
      </p>
      <Presence show={event}>
        <div className="dv-align-section">
          <div className="dv-insp-field">
            <label htmlFor={`${id}-event`}>{FIELD.event}</label>
            <Select
              id={`${id}-event`}
              aria-label={FIELD.event}
              value={settings.event}
              disabled={saving}
              data={events.map((e) => ({ value: e.id, label: e.label }))}
              onChange={chosen(editor.setEvent)}
            />
          </div>
        </div>
      </Presence>
      <section className="dv-align-section" aria-label="Recording origins">
        <h3>
          {event
            ? 'Event time in each recording'
            : settings.method === 'clock'
              ? 'Recording start times'
              : 'Recording origins'}
        </h3>
        {recordings.map((r, i) => {
          const text = settings.origins[r.id] ?? '',
            invalid = event && outside(text, r.duration),
            zeroId = `${id}-${r.id}-zero`;
          const shift = origins[i];
          return (
            <div key={r.id} className="dv-align-source" data-line={r.line}>
              <div className="dv-align-source-name">
                <i className="dv-align-swatch" />
                {r.name}
              </div>
              <p className="dv-align-source-meta">{r.file}</p>
              <Presence show={event}>
                <label
                  className="dv-align-input-label"
                  htmlFor={`${id}-${r.id}`}
                >
                  Time since recording start
                </label>
                <UnitInput
                  id={`${id}-${r.id}`}
                  unit="s"
                  value={text}
                  invalid={invalid}
                  disabled={saving}
                  aria-describedby={`${zeroId} ${messageId}`}
                  onChange={(e) =>
                    editor.setOrigin(r.id, e.currentTarget.value)
                  }
                />
              </Presence>
              <div className="dv-align-zero" id={zeroId}>
                {event ? (
                  <>
                    <span>Display shift</span>
                    <strong>
                      {invalid ? '—' : `${shift === 0 ? '0' : `−${shift}`} s`}
                    </strong>
                  </>
                ) : settings.method === 'elapsed' ? (
                  <>
                    <span>Recording start</span>
                    <strong>0 s</strong>
                  </>
                ) : (
                  <>
                    <span>UTC start</span>
                    <strong>{r.clockStart ?? 'Unavailable'}</strong>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <div id={messageId}>
        <Presence show={!!problem}>
          <div className="dv-insp-status">
            {problem && (
              <StatusBanner severity={problem.severity}>
                {problem.text}
              </StatusBanner>
            )}
          </div>
        </Presence>
      </div>
      <p className="dv-insp-lock">
        <InspectorIcon name="lock" />
        Only the display time changes. Raw samples and timestamps stay
        unchanged.
      </p>
    </InspectorPane>
  );
}

function AlignmentSourcesPane({
  recordings,
}: {
  recordings: readonly AlignmentRecording[];
}) {
  return (
    <InspectorPane label="Recording sources">
      {recordings.map((r) => (
        <section key={r.id} className="dv-align-detail" aria-label={r.name}>
          <h3>{r.name}</h3>
          <dl>
            <dt>Recording</dt>
            <dd>{r.file}</dd>
            <dt>Signal</dt>
            <dd>
              {r.signal} · {r.unit}
            </dd>
            <dt>Duration</dt>
            <dd>{r.duration} s</dd>
            <dt>Samples</dt>
            <dd>{r.available ? r.samples : 'Unavailable'}</dd>
            <dt>Clock timestamps</dt>
            <dd>{r.clockStart ? 'UTC' : 'Missing'}</dd>
          </dl>
        </section>
      ))}
    </InspectorPane>
  );
}

const lineColors = {
  light: { solid: '#326db1', dashed: '#7850a1' },
  dark: { solid: '#91b8eb', dashed: '#c69bdf' },
} as const;

/**
 * Chart card that previews the draft alignment immediately. Original timestamps are not changed.
 * Values from design/dvdash-field-review/alignment-inspector-review.html (.chart-card).
 */
export function AlignmentPreviewChart({
  editor,
  recordings,
  events,
  title,
  clockDate,
  yLimits = [0, 1.4],
}: {
  editor: AlignmentEditor;
  recordings: readonly AlignmentRecording[];
  events: readonly AlignmentEvent[];
  title: string;
  /** Date shown with clock times, e.g. "14 Apr 2026". */
  clockDate?: string;
  yLimits?: [number, number];
}) {
  const scheme = useComputedColorScheme('light'),
    narrow = useMediaQuery('(max-width: 650px)', false, {
      getInitialValueInEffect: false,
    });
  const { settings, problem, dirty } = editor;
  const visible = !problem || problem.kind === 'unavailable';
  const origins = alignmentOrigins(settings, recordings);
  const longest = Math.max(...recordings.map((r) => r.duration));
  const range: [number, number] =
    settings.method === 'event' && visible
      ? [
          -Math.ceil(Math.max(...origins) / 60) * 60,
          Math.ceil((longest - Math.min(...origins)) / 60) * 60,
        ]
      : [
          0,
          settings.method === 'clock'
            ? longest - Math.min(...origins)
            : longest,
        ];
  const aligned = useKeyedValue(
    JSON.stringify([settings, visible, recordings.map((r) => r.available)]),
    { recordings, origins },
  );
  const data = useMemo(
    () => alignedData(aligned.recordings, visible ? aligned.origins : null),
    [aligned, visible],
  );
  const eventLabel =
    events.find((e) => e.id === settings.event)?.label.toLowerCase() ?? 'event';
  const clockMissing = recordings.some((r) => r.clockStart === null);
  const xLabel =
    settings.method === 'event'
      ? `Time from ${eventLabel} (s)`
      : settings.method === 'clock'
        ? clockMissing
          ? 'Clock time unavailable'
          : `Clock time · UTC${clockDate ? `, ${clockDate}` : ''}`
        : 'Time since each recording’s start (s)';
  // Clock ticks count from the earliest recording start.
  const clock =
    settings.method !== 'clock'
      ? undefined
      : clockMissing
        ? null
        : Math.min(...recordings.map((r) => clockSeconds(r.clockStart!)));
  return (
    <div className="dv-insp dv-align-main">
      <section className="dv-insp-card" aria-label={`${title} comparison`}>
        <div className="dv-insp-card-heading">
          <h2>{title}</h2>
          <Presence show={dirty} variant="fade">
            <Chip icon={<InspectorIcon name="align" />}>Preview</Chip>
          </Presence>
        </div>
        <div className="dv-insp-legend">
          {recordings.map((r) => (
            <span key={r.id}>
              <i data-line={r.line} />
              {r.name}
            </span>
          ))}
        </div>
        <div className="dv-insp-plot">
          <ScientificPlot
            data={data}
            range={range}
            limits={yLimits}
            xLabel={xLabel}
            yLabel={`Signal (${recordings[0]?.unit ?? ''})`}
            height={narrow ? 210 : 252}
            minimumWidth={240}
            sparse
            unit={recordings[0]?.unit}
            marker={settings.method === 'event' && visible ? 0 : undefined}
            clock={clock}
            series={recordings.map((r) => ({
              label: r.name,
              unit: r.unit,
              color: lineColors[scheme][r.line],
              dash: r.line,
            }))}
          />
        </div>
      </section>
      <div className="dv-insp-summary">
        <Presence show={!!problem || settings.method === 'elapsed'}>
          {problem ? (
            <StatusBanner severity={problem.severity}>
              {problem.text}
            </StatusBanner>
          ) : settings.method === 'elapsed' ? (
            <StatusBanner severity="info">
              Each recording starts at 0 s. This does not imply simultaneous
              acquisition.
            </StatusBanner>
          ) : null}
        </Presence>
      </div>
    </div>
  );
}

/** One x array for all recordings. Each recording keeps its own samples; other times are left undefined so lines are not broken. */
function alignedData(
  recordings: readonly AlignmentRecording[],
  origins: number[] | null,
): uPlot.AlignedData {
  const shifted = recordings.map((r, i) =>
    origins && r.available
      ? r.data.map((p) => [p.t - origins[i], p.y] as const)
      : [],
  );
  const xs = [
    ...new Set(shifted.flatMap((points) => points.map((p) => p[0]))),
  ].sort((a, b) => a - b);
  if (!xs.length) return [[0], ...recordings.map(() => [null])];
  return [
    xs,
    ...shifted.map((points) => {
      const at = new Map(points);
      return xs.map((x) => at.get(x));
    }),
  ];
}
