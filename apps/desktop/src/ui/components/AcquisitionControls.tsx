import { UnstyledButton, VisuallyHidden } from '@mantine/core';
import {
  IconActivity,
  IconCheck,
  IconClock,
  IconDeviceAnalytics,
  IconHistory,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlugConnectedX,
} from '@tabler/icons-react';
import { type ReactNode, useCallback, useId, useState } from 'react';
import { Chip } from './Chip';
import { Presence, Swap } from './Motion';
import { StatusBanner, StatusMessages } from './Primitives';
import { GuardDialog, useFocusWhen } from './UnsavedChangesDialog';
import './Approved.css';
import './AcquisitionControls.css';
import './GuardDialog.css';

export type AcquisitionState =
  | 'disconnected'
  | 'ready'
  | 'starting'
  | 'acquiring'
  | 'stopping'
  | 'recorded';
export interface RunningRoutine {
  name: string;
  remaining: number;
  total: number;
}

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export interface StopAcquisitionDialogProps {
  opened: boolean;
  experimentName: string;
  instrument: string;
  samples: number;
  elapsedSeconds: number;
  routine?: RunningRoutine | null;
  phase?: 'idle' | 'stopping' | 'failed';
  onKeepAcquiring: () => void;
  onStop: () => void;
}

/** Confirms a stop. Recording continues while it is open; Keep acquiring is the default. */
export function StopAcquisitionDialog({
  opened,
  experimentName,
  instrument,
  samples,
  elapsedSeconds,
  routine,
  phase = 'idle',
  onKeepAcquiring,
  onStop,
}: StopAcquisitionDialogProps) {
  const busy = phase === 'stopping';
  const confirmRef = useFocusWhen(phase === 'failed');
  return (
    <GuardDialog
      opened={opened}
      busy={busy}
      onKeep={onKeepAcquiring}
      keepLabel="Keep acquiring"
      title={`Stop acquisition for ${experimentName}?`}
      actions={
        <UnstyledButton
          ref={confirmRef}
          className="dv-guard-button"
          data-variant="danger"
          disabled={busy}
          onClick={onStop}
        >
          {busy
            ? 'Stopping…'
            : phase === 'failed'
              ? 'Try again'
              : 'Stop acquisition'}
        </UnstyledButton>
      }
    >
      <div className="dv-guard-summary" data-testid="guard-summary">
        <p>
          {instrument} stops sending data. The samples recorded so far are kept
          as a recording.
        </p>
        {routine && (
          <p>
            The {routine.name} routine still has {routine.remaining} of{' '}
            {routine.total} measurements to take. They won’t run.
          </p>
        )}
      </div>
      <div
        className="dv-guard-live"
        data-testid="guard-live"
        aria-hidden="true"
      >
        <Chip icon={<IconActivity aria-hidden />}>
          {samples} samples so far
        </Chip>
        <Chip icon={<IconClock aria-hidden />}>
          {formatTime(elapsedSeconds)}
        </Chip>
      </div>
      <p className="dv-guard-note">
        {busy
          ? `Waiting for ${instrument} to confirm…`
          : 'Recording continues until you stop it. A stopped acquisition can’t be resumed.'}
      </p>
      {phase === 'failed' && (
        <div className="dv-guard-messages" data-testid="guard-messages">
          <StatusMessages
            announce
            messages={[
              {
                severity: 'error',
                text: `${instrument} didn’t confirm the stop, so it may still be recording. Try again, or check the instrument.`,
              },
            ]}
          />
        </div>
      )}
    </GuardDialog>
  );
}

type FocusTarget = 'start' | 'stop' | 'status';

/** Where focus goes when the instrument's outcome moves the controls from `before` to `state`. */
function focusAfter(
  before: AcquisitionState,
  state: AcquisitionState,
): FocusTarget | null {
  if (before === 'starting' && state === 'acquiring') return 'stop';
  if ((before === 'starting' || before === 'disconnected') && state === 'ready')
    return 'start';
  if (state === 'recorded') return 'status';
  return null;
}

export interface AcquisitionControlsProps {
  state: AcquisitionState;
  experimentName: string;
  instrument: string;
  samples?: number;
  elapsedSeconds?: number;
  routine?: RunningRoutine | null;
  /** The last start attempt was rejected; Start reads Try again. */
  startFailed?: boolean;
  /** The last stop wasn't confirmed by the instrument; the dialog offers Try again. */
  stopFailed?: boolean;
  /** Opens the stop dialog on first render (for frozen review states). */
  defaultStopDialogOpen?: boolean;
  /** Takes Start/Stop's place once recorded, for example a link to review the recording. */
  recordedAction?: ReactNode;
  onStart: () => void;
  onStop: () => void;
  onConnect: () => void;
}

const tags = {
  disconnected: [IconPlugConnectedX, 'Not ready'],
  ready: [IconCheck, 'Ready'],
  starting: [IconHistory, 'Starting'],
  acquiring: [IconActivity, 'Acquiring'],
  stopping: [IconActivity, 'Acquiring'],
  recorded: [IconCheck, 'Recorded'],
} as const;

/** The pieces of the acquisition controls, for placing in the shared page header's action bar and the page body. */
export interface AcquisitionControlParts {
  /** Status tag and chips, for the header's meta slot. */
  meta: ReactNode;
  /** Start or Stop button, for the header's actions slot; once recorded, `recordedAction` or nothing. */
  action: ReactNode;
  /** One-sentence status under the header (disconnected, failed start, stopped). Renders nothing when there is none. */
  status: ReactNode;
  /** Stop dialog and the live announcement. Render once anywhere on the page. */
  dialog: ReactNode;
}

/**
 * Acquisition status and Start/Stop as separate parts, so a page can put them in `PageHeader`'s meta and actions.
 * The instrument chip shows until acquisition starts (start-acquisition-review.html); while acquiring and once recorded
 * the meta shows samples and elapsed time only (stop-confirmation-review.html). The meta and action cross-fade between
 * setting up, acquiring and recorded, and the status line collapses in and out.
 */
export function useAcquisitionControls({
  state,
  experimentName,
  instrument,
  samples = 0,
  elapsedSeconds = 0,
  routine,
  startFailed = false,
  stopFailed = false,
  defaultStopDialogOpen = false,
  recordedAction,
  onStart,
  onStop,
  onConnect,
}: AcquisitionControlsProps): AcquisitionControlParts {
  const statusId = useId();
  const [confirming, setConfirming] = useState(
    defaultStopDialogOpen || state === 'stopping',
  );
  const [seenState, setSeenState] = useState(state);
  const [focusTo, setFocusTo] = useState<{ target: FocusTarget } | null>(null);
  if (seenState !== state) {
    setSeenState(state);
    if (state === 'stopping') setConfirming(true);
    if (state === 'recorded') setConfirming(false);
    const target = focusAfter(seenState, state);
    setFocusTo(target && { target });
  }
  const running = state === 'acquiring' || state === 'stopping';
  const phase = running
    ? 'running'
    : state === 'recorded'
      ? 'recorded'
      : 'setup';

  // The parent drives state from the instrument's outcome, so no handler here runs then. React calls a changed ref
  // callback once the change has committed, which is when the new button is there to focus.
  const stopRef = useCallback(
    (node: HTMLElement | null) => {
      if (focusTo?.target === 'stop') node?.focus();
    },
    [focusTo],
  );
  const startRef = useCallback(
    (node: HTMLElement | null) => {
      if (focusTo?.target === 'start') node?.focus();
    },
    [focusTo],
  );
  const statusRef = useCallback(
    (node: HTMLElement | null) => {
      if (focusTo?.target === 'status') node?.focus();
    },
    [focusTo],
  );

  const [TagIcon, tagLabel] = tags[state];
  const announcement =
    state === 'starting'
      ? 'Starting acquisition…'
      : state === 'acquiring'
        ? 'Acquiring.'
        : state === 'stopping'
          ? 'Stopping acquisition…'
          : state === 'recorded'
            ? `Acquisition stopped. ${samples} samples saved.`
            : startFailed
              ? 'The instrument didn’t start. Nothing was recorded.'
              : '';

  const meta = (
    <Swap swapKey={phase} className="dv-acq-swap">
      <span
        className="dv-acq-tag"
        data-state={state === 'stopping' ? 'acquiring' : state}
      >
        <TagIcon aria-hidden />
        {tagLabel}
      </span>
      {running || state === 'recorded' ? (
        <>
          <Chip icon={<IconActivity aria-hidden />}>{samples} samples</Chip>
          <Chip icon={<IconClock aria-hidden />}>
            {formatTime(elapsedSeconds)}
          </Chip>
        </>
      ) : (
        <Chip icon={<IconDeviceAnalytics aria-hidden />}>
          {instrument} ·{' '}
          {state === 'disconnected' ? 'Disconnected' : 'Connected'}
        </Chip>
      )}
    </Swap>
  );
  const button = running ? (
    <UnstyledButton
      ref={stopRef}
      className="dv-acq-button"
      onClick={() => setConfirming(true)}
    >
      <IconPlayerStop aria-hidden />
      Stop acquisition
    </UnstyledButton>
  ) : state !== 'recorded' ? (
    <UnstyledButton
      ref={startRef}
      className="dv-acq-button"
      data-variant="primary"
      disabled={state === 'starting' || state === 'disconnected'}
      aria-describedby={state === 'disconnected' ? statusId : undefined}
      onClick={onStart}
    >
      {state === 'starting' ? (
        <>
          <IconHistory aria-hidden />
          Starting…
        </>
      ) : (
        <>
          <IconPlayerPlay aria-hidden />
          {startFailed ? 'Try again' : 'Start acquisition'}
        </>
      )}
    </UnstyledButton>
  ) : (
    (recordedAction ?? null)
  );
  // Presence fades the button out when nothing replaces it; Swap's leaving copy would be clipped to the empty slot.
  const action = (
    <Presence show={button !== null} variant="fade" className="dv-acq-swap">
      <Swap swapKey={phase} className="dv-acq-swap">
        {button}
      </Swap>
    </Presence>
  );
  const line =
    state === 'disconnected' ? (
      <div className="dv-acq-status" id={statusId}>
        <StatusBanner severity="warning">
          {instrument} is disconnected. Connect it to start acquiring.{' '}
          <UnstyledButton className="dv-acq-link" onClick={onConnect}>
            Connect {instrument}
          </UnstyledButton>
        </StatusBanner>
      </div>
    ) : state === 'ready' && startFailed ? (
      <div className="dv-acq-status" id={statusId}>
        <StatusMessages
          messages={[
            {
              severity: 'error',
              text: `${instrument} didn’t start, so nothing was recorded. Check that it’s ready, then try again.`,
            },
          ]}
        />
      </div>
    ) : state === 'recorded' ? (
      <div
        className="dv-acq-status"
        id={statusId}
        ref={statusRef}
        tabIndex={-1}
      >
        <StatusMessages
          messages={[
            {
              severity: 'info',
              text: `Acquisition stopped. ${samples} samples saved as a recording.`,
            },
          ]}
        />
      </div>
    ) : null;
  const status = <Presence show={line !== null}>{line}</Presence>;
  const dialog = (
    <>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
      <StopAcquisitionDialog
        opened={(confirming && running) || state === 'stopping'}
        experimentName={experimentName}
        instrument={instrument}
        samples={samples}
        elapsedSeconds={elapsedSeconds}
        routine={routine}
        phase={
          state === 'stopping' ? 'stopping' : stopFailed ? 'failed' : 'idle'
        }
        onKeepAcquiring={() => setConfirming(false)}
        onStop={onStop}
      />
    </>
  );
  return { meta, action, status, dialog };
}

/** Acquisition status and Start/Stop for the experiment header action bar. Outcomes arrive through props. */
export function AcquisitionControls(props: AcquisitionControlsProps) {
  const { meta, action, status, dialog } = useAcquisitionControls(props);
  return (
    <div className="dv-acq">
      <div className="dv-acq-bar">
        <div className="dv-acq-meta" data-testid="acquisition-meta">
          {meta}
        </div>
        {action}
      </div>
      {status}
      {dialog}
    </div>
  );
}
