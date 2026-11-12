import { useEffect, useState } from 'react';
import { Chip } from './Chip';
import { StatusBanner } from './Primitives';
import { formatDuration, ImportButton, ImportDialog, ImportFooterNote, ImportIcon, ImportProgressNote } from './ImportDialog';
import './RecordingExport.css';

export interface ExportSignal {
  id: string;
  name: string;
  unit: string;
  /** Instrument the signal comes from, e.g. `MS-01`. */
  source?: string;
  kind: 'raw' | 'derived';
}
export type ExportFormat = 'csv' | 'json';
export interface RecordingExportSettings {
  range: 'full' | 'interval';
  /** Interval start and end in seconds from the recording start, as typed. */
  start: string;
  end: string;
  signals: readonly string[];
  /** File name without its extension. */
  fileName: string;
  format: ExportFormat;
  includePreset: boolean;
}
export interface ExportRecording {
  name: string;
  /** Recording length in seconds. */
  duration: number;
  preset: { name: string; revision: number };
}
export interface ExportResult { fileName: string; rows: number; signals: number; duration: number }
export type RecordingExportPhase = 'ready' | 'preparing' | 'done' | 'failed';

export interface RecordingExportDialogProps {
  opened: boolean;
  phase: RecordingExportPhase;
  recording: ExportRecording;
  signals: readonly ExportSignal[];
  value: RecordingExportSettings;
  onChange: (value: RecordingExportSettings) => void;
  /** Rows the current settings export. */
  rows: number;
  /** The interval comes from a selection on the chart. Otherwise it's a custom interval. */
  hasSelection?: boolean;
  /** Some selected signals have missing samples in the range. */
  gaps?: boolean;
  /** The recording has no samples at all. */
  empty?: boolean;
  /** The prepared file (`done`). */
  result?: ExportResult;
  onExport: () => void;
  onCancelExport: () => void;
  onDownloadAgain: () => void;
  onClose: () => void;
}

const time = (value: string) => { const text = value.trim(); return text ? Number(text.replace(',', '.')) : NaN; };
/** "5:00" for the full recording caption. */
const shortClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Why the interval can't be exported, or null. */
export function exportRangeProblem(value: Pick<RecordingExportSettings, 'range' | 'start' | 'end'>, duration: number): { field: 'start' | 'end'; message: string } | null {
  if (value.range !== 'interval') return null;
  const start = time(value.start), end = time(value.end), max = Math.round(duration);
  if (!Number.isFinite(start)) return { field: 'start', message: 'Enter a start time in seconds.' };
  if (!Number.isFinite(end)) return { field: 'end', message: 'Enter an end time in seconds.' };
  if (start < 0 || start > duration) return { field: 'start', message: `Start must be between 0 and ${max} s.` };
  if (end < 0 || end > duration) return { field: 'end', message: `End must be between 0 and ${max} s.` };
  if (end <= start) return { field: 'end', message: 'End must be after start.' };
  return null;
}
/** Why the file name can't be used, or an empty string. */
export function exportFileNameProblem(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a file name.';
  if ([...name].some(c => '<>:"/\\|?*'.includes(c) || c.charCodeAt(0) < 32) || name.endsWith('.') || name.endsWith(' ')) return 'Remove characters that aren’t allowed in file names.';
  const root = trimmed.toUpperCase().split('.')[0];
  if (['CON', 'PRN', 'AUX', 'NUL'].includes(root) || /^(COM|LPT)[1-9]$/.test(root)) return 'Choose a different file name.';
  return '';
}

/**
 * Exports a recording's signals as CSV or JSON: the full recording or a configurable interval,
 * the signals to include, and the file name. Gaps are reported without blocking the export.
 * Values from design/dvdash-field-review/recording-export-review.html.
 */
export function RecordingExportDialog({ opened, phase, recording, signals, value, onChange, rows, hasSelection = true, gaps = false, empty = false, result, onExport, onCancelExport, onDownloadAgain, onClose }: RecordingExportDialogProps) {
  const [touched, setTouched] = useState(false), [attempted, setAttempted] = useState(false);
  useEffect(() => { if (!opened) { setTouched(false); setAttempted(false); } }, [opened]);
  const set = (patch: Partial<RecordingExportSettings>) => onChange({ ...value, ...patch });
  const rangeProblem = exportRangeProblem(value, recording.duration);
  const nameProblem = exportFileNameProblem(value.fileName);
  const showRange = !!rangeProblem && (touched || attempted);
  const selected = signals.filter(signal => value.signals.includes(signal.id)).length;
  const intervalSeconds = rangeProblem ? null : time(value.end) - time(value.start);
  const intervalCaption = rangeProblem ? 'Set start and end times' : `${formatDuration(time(value.start))}–${formatDuration(time(value.end))}`;
  const label = value.format.toUpperCase();
  const toggleSignal = (id: string, on: boolean) => set({ signals: on ? [...value.signals, id] : value.signals.filter(item => item !== id) });
  const exportNow = () => {
    if (rangeProblem || nameProblem || !selected) { setAttempted(true); return; }
    onExport();
  };
  const timeField = (field: 'start' | 'end', name: string) => {
    const invalid = showRange && rangeProblem?.field === field;
    return <label className="dv-export-time-field">{name}<span className="dv-export-time-input">
      <input type="text" inputMode="decimal" value={value[field]} disabled={value.range === 'full'} aria-label={`${name} time in seconds`}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? 'dv-export-range-error' : 'dv-export-range-hint'}
        onChange={event => { setTouched(true); set({ [field]: event.currentTarget.value }); }} />
      <span>s</span>
    </span></label>;
  };

  const footerStart = phase === 'done' ? <ImportButton variant="quiet" onClick={onDownloadAgain}>Download again</ImportButton>
    : phase === 'preparing' ? undefined : <ImportFooterNote>{rows} rows · {selected} signals</ImportFooterNote>;
  const actions = phase === 'preparing' ? <ImportButton variant="quiet" onClick={onCancelExport}>Cancel export</ImportButton>
    : phase === 'done' ? <ImportButton onClick={onClose}>Done</ImportButton>
    : <><ImportButton variant="quiet" onClick={onClose}>Cancel</ImportButton><ImportButton disabled={empty || (!rangeProblem && rows === 0)} onClick={exportNow}>{phase === 'failed' ? 'Try again' : `Export ${label}`}</ImportButton></>;

  return <ImportDialog opened={opened} onClose={onClose} closeLabel="Close export dialog" bodyMaxHeight={720} className="dv-export-dialog"
    title={phase === 'done' ? 'Export prepared' : 'Export recording'} description="Save recorded signals for analysis elsewhere." footerStart={footerStart} actions={actions}>
    <div className="dv-export-identity">
      <ImportIcon name="details" /><strong>{recording.name}</strong>
      <Chip icon={<ImportIcon name="revisions" />}>Preset R{recording.preset.revision}</Chip>
    </div>
    {phase === 'preparing' && <ImportProgressNote variant="export" title="Preparing export…" detail={`${rows} rows · ${selected} signals`} />}
    {phase === 'done' && result && <>
      <div className="dv-export-feedback"><StatusBanner announce>Export file prepared.</StatusBanner></div>
      <div className="dv-export-result">
        <ImportIcon name="file" />
        <div><strong>{result.fileName}</strong><div className="dv-export-summary">
          <Chip icon={<ImportIcon name="details" />}>{result.rows} rows</Chip>
          <Chip icon={<ImportIcon name="signals" />}>{result.signals} signals</Chip>
          <Chip icon={<ImportIcon name="clock" />}>{formatDuration(result.duration)}</Chip>
        </div></div>
      </div>
    </>}
    {(phase === 'ready' || phase === 'failed') && <>
      {phase === 'failed' && <div className="dv-export-feedback"><StatusBanner severity="error" announce>The export couldn’t be prepared. Try again.</StatusBanner></div>}
      {empty && <div className="dv-export-feedback"><StatusBanner>No recorded samples are available to export.</StatusBanner></div>}
      {gaps && !empty && <div className="dv-export-feedback"><StatusBanner severity="warning">Selected signals contain gaps. Missing samples will be {value.format === 'csv' ? 'blank' : 'null'}.</StatusBanner></div>}
      {attempted && !selected && <div className="dv-export-feedback"><StatusBanner severity="error" announce>Select at least one signal.</StatusBanner></div>}
      <fieldset className="dv-export-section">
        <legend>Time range</legend>
        <label className="dv-export-scope">
          <input type="radio" name="dv-export-range" value="full" checked={value.range === 'full'} onChange={() => set({ range: 'full' })} />
          <span className="dv-export-scope-copy"><strong>Full recording</strong><small>{shortClock(0)}–{shortClock(recording.duration)}</small></span>
          <Chip icon={<ImportIcon name="clock" />}>{formatDuration(recording.duration)}</Chip>
        </label>
        <label className="dv-export-scope">
          <input type="radio" name="dv-export-range" value="interval" checked={value.range === 'interval'} onChange={() => set({ range: 'interval' })} />
          <span className="dv-export-scope-copy"><strong>{hasSelection ? 'Selected interval' : 'Custom interval'}</strong><small>{intervalCaption}</small></span>
          {intervalSeconds !== null && <Chip icon={<ImportIcon name="clock" />}>{formatDuration(intervalSeconds)}</Chip>}
        </label>
        <div className="dv-export-interval">{timeField('start', 'Start')}{timeField('end', 'End')}</div>
        <p className="dv-export-interval-hint" id="dv-export-range-hint">Seconds from recording start · 0–{Math.round(recording.duration)} s</p>
        {showRange && rangeProblem && <div className="dv-export-interval-feedback" id="dv-export-range-error"><StatusBanner severity="error" announce>{rangeProblem.message}</StatusBanner></div>}
        {value.range === 'interval' && !rangeProblem && !empty && rows === 0 && <div className="dv-export-interval-feedback"><StatusBanner>No samples fall in this interval.</StatusBanner></div>}
      </fieldset>
      <div className="dv-export-divider" />
      <div className="dv-export-group-heading"><h3>Signals</h3><span>{selected} selected</span></div>
      <div className="dv-export-signal-groups">
        {(['raw', 'derived'] as const).map(kind => {
          const group = signals.filter(signal => signal.kind === kind);
          return group.length > 0 && <fieldset key={kind} className="dv-export-signal-group">
            <legend>{kind === 'raw' ? 'Raw signals' : 'Derived values'}</legend>
            {group.map(signal => <label key={signal.id} className="dv-export-signal">
              <input type="checkbox" checked={value.signals.includes(signal.id)} aria-label={`Include ${signal.name}`} onChange={event => toggleSignal(signal.id, event.currentTarget.checked)} />
              <span className="dv-export-signal-name">{signal.name}{signal.source && <span className="dv-export-source">{signal.source}</span>}</span>
              <span className="dv-export-unit">{signal.unit}</span>
            </label>)}
          </fieldset>;
        })}
      </div>
      <div className="dv-export-divider" />
      <div className="dv-export-field-row">
        <label className="dv-export-field">File name<span className="dv-export-filename" data-invalid={attempted && !!nameProblem}>
          <input value={value.fileName} title={value.fileName} aria-invalid={(attempted && !!nameProblem) || undefined} aria-describedby={attempted && nameProblem ? 'dv-export-name-error' : undefined} onChange={event => set({ fileName: event.currentTarget.value })} />
          <span className="dv-export-extension">.{value.format}</span>
        </span></label>
        <label className="dv-export-field">Format<select value={value.format} onChange={event => set({ format: event.currentTarget.value as ExportFormat })}><option value="csv">CSV</option><option value="json">JSON</option></select></label>
      </div>
      {attempted && nameProblem && <div className="dv-export-name-feedback" id="dv-export-name-error"><StatusBanner severity="error" announce>{nameProblem}</StatusBanner></div>}
      <label className="dv-export-context" data-disabled={value.format !== 'json'}>
        <input type="checkbox" checked={value.format === 'json' && value.includePreset} disabled={value.format !== 'json'} onChange={event => set({ includePreset: event.currentTarget.checked })} />Include preset reference
      </label>
      <p className="dv-export-context-note">{value.format === 'json' ? `${recording.preset.name} · R${recording.preset.revision}` : 'Available in JSON. Signal units are included in both formats.'}</p>
    </>}
  </ImportDialog>;
}
