import { useCallback, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Chip } from './Chip';
import {
  Announcer,
  InspectorButton,
  InspectorIcon,
  parseNumber,
  UnitInput,
} from './InspectorParts';
import { Presence } from './Motion';
import { type Severity, StatusBanner } from './Primitives';
import { useStateResetByProp } from './useStateResetByProp';
import './CalibrationChecklist.css';

/** A named reading to capture, such as "Standard 100". `known` is the standard's known value, or null for a sample. */
export interface ChecklistStep {
  id: string;
  label: string;
  known: number | null;
}
/** A captured reading keeps the interval it was taken from. */
export interface ChecklistReading {
  start: number;
  end: number;
  mean: number;
}
export type ChecklistReadings = Readonly<Record<string, ChecklistReading>>;
/** Mean of the samples in an interval, or why there is none. */
export type IntervalSummary =
  | { mean: number; count: number }
  | { problem: string; severity: Exclude<Severity, 'success'> };
type Problem = {
  text: string;
  severity: Exclude<Severity, 'success'>;
  range?: boolean;
};

export interface CalibrationChecklistProps {
  title?: string;
  steps: readonly ChecklistStep[];
  /** Signal the readings come from, e.g. "Mass 44". */
  signal: string;
  /** Recording the readings come from. */
  file: string;
  unit?: string;
  knownUnit?: string;
  /** Start and end of the recording, in seconds. */
  recording: readonly [number, number];
  /** Interval shown first, and restored by Reset. */
  defaultInterval: readonly [number, number];
  /** False until an interval has been chosen: capture stays blocked until the interval is edited. */
  intervalChosen?: boolean;
  /** A problem with the signal itself, e.g. it is unavailable or has gaps. Blocks capture. */
  signalProblem?: { text: string; severity: 'warning' | 'error' };
  /** Mean of the samples between start and end. */
  summarize: (start: number, end: number) => IntervalSummary;
  readings?: ChecklistReadings;
  defaultReadings?: ChecklistReadings;
  onReadingsChange?: (readings: ChecklistReadings) => void;
  /** Stores a reading. A rejected promise shows the failure and keeps the saved readings. */
  onCapture?: (
    stepId: string,
    reading: ChecklistReading,
  ) => Promise<void> | void;
  /** Step being captured, when the caller tracks it. */
  pendingStep?: string | null;
  /** Step whose last capture failed, shown with Retry. */
  failedStep?: string | null;
  readOnly?: boolean;
  onIntervalChange?: (interval: { start: string; end: string }) => void;
}

const fmt = (value: number) => value.toFixed(3);

/**
 * Checklist of named calibration readings. Each capture stores the selected interval's mean with that interval.
 * Values from design/dvdash-field-review/calibration-checklist-review.html.
 */
export function CalibrationChecklist({
  title = 'Calibration readings',
  steps,
  signal,
  file,
  unit = 'mV',
  knownUnit = 'nmol/mL',
  recording,
  defaultInterval,
  intervalChosen = true,
  signalProblem,
  summarize,
  readings: controlled,
  defaultReadings = {},
  onReadingsChange,
  onCapture,
  pendingStep,
  failedStep = null,
  readOnly = false,
  onIntervalChange,
}: CalibrationChecklistProps) {
  const id = useId(),
    titleId = `${id}-title`,
    helpId = `${id}-help`,
    messageId = `${id}-message`;
  const root = useRef<HTMLElement>(null),
    epoch = useRef(0);
  // Unmounting moves the epoch on, so a capture that settles afterwards is ignored.
  const attachRoot = useCallback((node: HTMLElement) => {
    root.current = node;
    return () => {
      root.current = null;
      epoch.current++;
    };
  }, []);
  const [own, setOwn] = useState<ChecklistReadings>(defaultReadings);
  const readings = controlled ?? own;
  const [start, setStart] = useState(String(defaultInterval[0])),
    [end, setEnd] = useState(String(defaultInterval[1]));
  const [chosen, setChosen] = useStateResetByProp(intervalChosen);
  const [ownPending, setPending] = useState<string | null>(null),
    [failed, setFailed] = useStateResetByProp<string | null>(failedStep);
  const [confirm, setConfirm] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<ChecklistReadings | null>(null),
    [announcement, setAnnouncement] = useState('');
  const pending = pendingStep ?? ownPending;
  // Renders the updates at once so the focus target exists before the screen updates.
  const focusAfter = (selector: string, updates: () => void) => {
    flushSync(updates);
    // A message or confirmation that is still leaving keeps its buttons but is inert, so it is skipped.
    root.current
      ?.querySelector<HTMLElement>(`${selector}:not([inert] *)`)
      ?.focus();
  };

  const update = (next: ChecklistReadings) => {
    if (controlled === undefined) setOwn(next);
    onReadingsChange?.(next);
  };
  const label = (stepId: string) =>
    steps.find((step) => step.id === stepId)?.label ?? stepId;
  const a = parseNumber(start),
    b = parseNumber(end);
  const summary = (():
    | { problem: Problem }
    | { mean: number; count: number } => {
    if (!chosen)
      return {
        problem: {
          text: 'Choose a start and end time to capture a reading.',
          severity: 'info',
        },
      };
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      a < recording[0] ||
      b > recording[1] ||
      a >= b
    )
      return {
        problem: {
          text: `Use a start before the end, between ${recording[0]} and ${recording[1]} s.`,
          severity: 'error',
          range: true,
        },
      };
    if (signalProblem) return { problem: signalProblem };
    const result = summarize(a, b);
    return 'problem' in result
      ? { problem: { text: result.problem, severity: result.severity } }
      : { mean: result.mean, count: result.count };
  })();
  const problem = 'problem' in summary ? summary.problem : null;
  const mean = 'mean' in summary ? summary.mean : null;
  const count = steps.filter((step) => readings[step.id]).length;
  const blocked = !!problem || pending !== null || readOnly;

  async function capture(stepId: string, force = false) {
    if (blocked || mean === null) return;
    if (readings[stepId] && !force) {
      focusAfter('[data-action="cancel"]', () => setConfirm(stepId));
      return;
    }
    const reading = { start: a, end: b, mean },
      token = ++epoch.current,
      before = readings;
    setConfirm(null);
    setPending(stepId);
    setFailed(null);
    setNotice(null);
    setAnnouncement(`Capturing ${label(stepId).toLowerCase()}`);
    try {
      await onCapture?.(stepId, reading);
    } catch {
      if (token !== epoch.current) return;
      focusAfter('[data-action="retry"]', () => {
        setPending(null);
        setFailed(stepId);
        setAnnouncement('Capture failed. Saved readings are retained.');
      });
      return;
    }
    if (token !== epoch.current) return;
    const text = `${label(stepId)} captured.`;
    focusAfter(`[data-action="capture"][data-step="${stepId}"]`, () => {
      setPending(null);
      setUndo(before);
      update({ ...before, [stepId]: reading });
      setNotice(text);
      setAnnouncement(text);
    });
  }
  function remove(stepId: string) {
    const next = { ...readings };
    delete next[stepId];
    const text = `${label(stepId)} removed.`;
    focusAfter(`[data-action="capture"][data-step="${stepId}"]`, () => {
      setUndo(readings);
      update(next);
      setConfirm(null);
      setFailed(null);
      setNotice(text);
      setAnnouncement(text);
    });
  }
  function restore() {
    if (!undo) return;
    focusAfter('[data-action="capture"]', () => {
      update(undo);
      setUndo(null);
      setNotice('Previous readings restored.');
      setAnnouncement('Previous readings restored.');
    });
  }
  function edit(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    setConfirm(null);
    setNotice(null);
    setChosen(true);
    onIntervalChange?.({ start: nextStart, end: nextEnd });
  }

  const message = readOnly ? (
    <StatusBanner severity="info">
      Read-only recording. Existing readings can be reviewed.
    </StatusBanner>
  ) : failed ? (
    <StatusBanner
      severity="error"
      action={
        <InspectorButton
          className="dv-cal-banner-action"
          data-action="retry"
          disabled={blocked}
          onClick={() => capture(failed, true)}
        >
          Retry
        </InspectorButton>
      }
    >
      Could not capture {label(failed).toLowerCase()}. Saved readings are
      retained.
    </StatusBanner>
  ) : notice ? (
    <StatusBanner
      severity="info"
      action={
        undo ? (
          <InspectorButton
            className="dv-cal-banner-action"
            data-action="undo"
            onClick={restore}
          >
            Undo
          </InspectorButton>
        ) : undefined
      }
    >
      {notice}
    </StatusBanner>
  ) : count === steps.length && steps.length > 0 ? (
    <StatusBanner severity="success">
      All readings captured. Review the calibration fit.
    </StatusBanner>
  ) : null;

  return (
    <section
      ref={attachRoot}
      className="dv-insp dv-cal"
      aria-labelledby={titleId}
    >
      <header className="dv-cal-header">
        <h2 id={titleId}>{title}</h2>
        <div className="dv-cal-progress">
          <span>
            {count} of {steps.length}
          </span>
          <span className="dv-cal-track" aria-hidden="true">
            {steps.map((step) => (
              <i key={step.id} data-filled={!!readings[step.id]} />
            ))}
          </span>
        </div>
      </header>
      <div className="dv-cal-source">
        <Chip icon={<InspectorIcon name="signal" />}>{signal}</Chip>
        <span className="dv-cal-file">{file}</span>
      </div>
      <div className="dv-cal-interval">
        <div className="dv-cal-interval-top">
          <h3>Selected interval mean</h3>
          <output
            className="dv-cal-readout"
            aria-label={
              mean === null
                ? 'Selected interval mean unavailable'
                : `Selected interval mean ${fmt(mean)} ${unit}`
            }
          >
            <strong>{mean === null ? '—' : fmt(mean)}</strong>
            <span className="dv-cal-unit">{unit}</span>
          </output>
        </div>
        <div className="dv-cal-form">
          {(['Start', 'End'] as const).map((name) => (
            <div key={name} className="dv-cal-field">
              <label htmlFor={`${id}-${name}`}>{name}</label>
              <UnitInput
                id={`${id}-${name}`}
                unit="s"
                value={name === 'Start' ? start : end}
                invalid={!!problem?.range}
                disabled={pending !== null || readOnly}
                aria-describedby={`${helpId} ${messageId}`}
                onChange={(event) =>
                  name === 'Start'
                    ? edit(event.currentTarget.value, end)
                    : edit(start, event.currentTarget.value)
                }
              />
            </div>
          ))}
          <InspectorButton
            variant="quiet"
            title="Restore the suggested interval"
            disabled={pending !== null || readOnly}
            onClick={() =>
              edit(String(defaultInterval[0]), String(defaultInterval[1]))
            }
          >
            Reset
          </InspectorButton>
        </div>
        <p id={helpId} className="dv-cal-range-help">
          Recording: {recording[0]}–{recording[1]} s{' '}
          <span aria-hidden="true">·</span>{' '}
          <span>
            {'count' in summary
              ? `${summary.count} samples selected`
              : 'No complete selection'}
          </span>
        </p>
        <div id={messageId}>
          <Presence show={!!problem}>
            <div className="dv-cal-banner-wrap">
              {problem && (
                <StatusBanner severity={problem.severity}>
                  {problem.text}
                </StatusBanner>
              )}
            </div>
          </Presence>
        </div>
      </div>
      <Presence show={!!message}>
        <div className="dv-cal-notice">{message}</div>
      </Presence>
      <ol className="dv-cal-list" aria-label={title}>
        {steps.map((step) => {
          const reading = readings[step.id],
            busy = pending === step.id,
            name = step.label.toLowerCase();
          return (
            <li key={step.id} className="dv-cal-row" data-row={step.id}>
              <span className="dv-cal-mark" data-complete={!!reading}>
                <InspectorIcon
                  name={busy ? 'loader' : reading ? 'check' : 'circle'}
                  className={busy ? 'dv-cal-spinner' : undefined}
                />
                <span className="dv-insp-sr">
                  {busy ? 'Capturing' : reading ? 'Captured' : 'Not captured'}
                </span>
              </span>
              <div className="dv-cal-copy">
                <h3 className="dv-cal-title">{step.label}</h3>
                <div className="dv-cal-meta">
                  {reading ? (
                    <>
                      <InspectorIcon name="clock" />
                      {reading.start}–{reading.end} s
                    </>
                  ) : step.known === null ? (
                    'Not captured'
                  ) : (
                    `Known: ${step.known} ${knownUnit}`
                  )}
                  {reading && step.known !== null && (
                    <span>
                      · {step.known} {knownUnit}
                    </span>
                  )}
                </div>
              </div>
              <div className="dv-cal-value">
                <strong>{reading ? fmt(reading.mean) : '—'}</strong>
                <span>{unit}</span>
              </div>
              <div className="dv-cal-actions">
                <InspectorButton
                  variant={!reading && !busy ? 'primary' : 'default'}
                  data-action="capture"
                  data-step={step.id}
                  disabled={blocked}
                  aria-label={
                    busy
                      ? undefined
                      : `${reading ? 'Replace' : 'Capture'} ${name}`
                  }
                  onClick={() => capture(step.id)}
                >
                  {busy ? (
                    <>
                      Capturing…<span className="dv-insp-sr"> {name}</span>
                    </>
                  ) : reading ? (
                    'Replace'
                  ) : (
                    <>
                      <InspectorIcon name="check" />
                      Capture
                    </>
                  )}
                </InspectorButton>
                {reading && (
                  <InspectorButton
                    variant="quiet"
                    className="dv-cal-icon-button"
                    data-action="remove"
                    disabled={pending !== null || readOnly}
                    aria-label={`Remove ${name}`}
                    title={`Remove ${name}`}
                    onClick={() => remove(step.id)}
                  >
                    <InspectorIcon name="trash" />
                  </InspectorButton>
                )}
              </div>
              <Presence
                show={confirm === step.id && !!reading}
                className="dv-cal-replacement-slot"
              >
                {reading && (
                  <div className="dv-cal-replacement">
                    <span>
                      Replace {fmt(reading.mean)} {unit} with{' '}
                      {mean === null
                        ? 'an unavailable value'
                        : `${fmt(mean)} ${unit}`}
                      ?
                    </span>
                    <div>
                      <InspectorButton
                        small
                        data-action="cancel"
                        onClick={() =>
                          focusAfter(
                            `[data-action="capture"][data-step="${step.id}"]`,
                            () => setConfirm(null),
                          )
                        }
                      >
                        Cancel
                      </InspectorButton>
                      <InspectorButton
                        small
                        variant="primary"
                        disabled={blocked}
                        onClick={() => capture(step.id, true)}
                      >
                        Replace reading
                      </InspectorButton>
                    </div>
                  </div>
                )}
              </Presence>
            </li>
          );
        })}
      </ol>
      <footer className="dv-cal-footer">
        <InspectorIcon name="lock" />
        Readings retain their selected interval. Raw samples stay unchanged.
      </footer>
      <Announcer message={announcement} />
    </section>
  );
}
