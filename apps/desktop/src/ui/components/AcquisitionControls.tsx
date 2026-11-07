import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { UnstyledButton, VisuallyHidden } from '@mantine/core';
import { IconActivity, IconCheck, IconClock, IconDeviceAnalytics, IconHistory, IconPlayerPlay, IconPlayerStop, IconPlugConnectedX } from '@tabler/icons-react';
import { Chip } from './Chip';
import { StatusBanner, StatusMessages } from './Primitives';
import { GuardDialog, useFocusWhen } from './UnsavedChangesDialog';
import './Approved.css';
import './AcquisitionControls.css';
import './GuardDialog.css';

export type AcquisitionState = 'disconnected' | 'ready' | 'starting' | 'acquiring' | 'stopping' | 'recorded';
export interface RunningRoutine { name: string; remaining: number; total: number }

const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

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
export function StopAcquisitionDialog({ opened, experimentName, instrument, samples, elapsedSeconds, routine, phase = 'idle', onKeepAcquiring, onStop }: StopAcquisitionDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const busy = phase === 'stopping';
  useFocusWhen(phase === 'failed', confirmRef);
  return <GuardDialog
    opened={opened} busy={busy} onKeep={onKeepAcquiring} keepLabel="Keep acquiring" title={`Stop acquisition for ${experimentName}?`}
    actions={<UnstyledButton ref={confirmRef} className="dv-guard-button" data-variant="danger" disabled={busy} onClick={onStop}>{busy ? 'Stopping…' : phase === 'failed' ? 'Try again' : 'Stop acquisition'}</UnstyledButton>}
  >
    <div className="dv-guard-summary" data-testid="guard-summary">
      <p>{instrument} stops sending data. The samples recorded so far are kept as a recording.</p>
      {routine && <p>The {routine.name} routine still has {routine.remaining} of {routine.total} measurements to take. They won’t run.</p>}
    </div>
    <div className="dv-guard-live" data-testid="guard-live" aria-hidden="true">
      <Chip icon={<IconActivity aria-hidden />}>{samples} samples so far</Chip>
      <Chip icon={<IconClock aria-hidden />}>{formatTime(elapsedSeconds)}</Chip>
    </div>
    <p className="dv-guard-note">{busy ? `Waiting for ${instrument} to confirm…` : 'Recording continues until you stop it. A stopped acquisition can’t be resumed.'}</p>
    {phase === 'failed' && <div className="dv-guard-messages" data-testid="guard-messages"><StatusMessages announce messages={[{ severity: 'error', text: `${instrument} didn’t confirm the stop, so it may still be recording. Try again, or check the instrument.` }]} /></div>}
  </GuardDialog>;
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
  onStart: () => void;
  onStop: () => void;
  onConnect: () => void;
}

const tags = {
  disconnected: [IconPlugConnectedX, 'Not ready'], ready: [IconCheck, 'Ready'], starting: [IconHistory, 'Starting'],
  acquiring: [IconActivity, 'Acquiring'], stopping: [IconActivity, 'Acquiring'], recorded: [IconCheck, 'Recorded'],
} as const;

/** The pieces of the acquisition controls, for placing in the shared page header's action bar and the page body. */
export interface AcquisitionControlParts {
  /** Status tag and chips, for the header's meta slot. */
  meta: ReactNode;
  /** Start or Stop button, for the header's actions slot. `null` once recorded. */
  action: ReactNode;
  /** One-sentence status under the header (disconnected, failed start, stopped). `null` when there is none. */
  status: ReactNode;
  /** Stop dialog and the live announcement. Render once anywhere on the page. */
  dialog: ReactNode;
}

/**
 * Acquisition status and Start/Stop as separate parts, so a page can put them in `PageHeader`'s meta and actions.
 * The instrument chip shows until acquisition starts (start-acquisition-review.html); while acquiring and once recorded
 * the meta shows samples and elapsed time only (stop-confirmation-review.html).
 */
export function useAcquisitionControls({ state, experimentName, instrument, samples = 0, elapsedSeconds = 0, routine, startFailed = false, stopFailed = false, defaultStopDialogOpen = false, onStart, onStop, onConnect }: AcquisitionControlsProps): AcquisitionControlParts {
  const statusId = useId();
  const startRef = useRef<HTMLButtonElement>(null), stopRef = useRef<HTMLButtonElement>(null), statusRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(defaultStopDialogOpen || state === 'stopping');
  const previous = useRef(state);
  const running = state === 'acquiring' || state === 'stopping';

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (state === 'stopping') setConfirming(true);
    if (before === state) return;
    if (before === 'starting' && state === 'acquiring') stopRef.current?.focus();
    else if ((before === 'starting' || before === 'disconnected') && state === 'ready') startRef.current?.focus();
    else if (state === 'recorded') { setConfirming(false); statusRef.current?.focus(); }
  }, [state]);

  const [TagIcon, tagLabel] = tags[state];
  const announcement = state === 'starting' ? 'Starting acquisition…' : state === 'acquiring' ? 'Acquiring.' : state === 'stopping' ? 'Stopping acquisition…'
    : state === 'recorded' ? `Acquisition stopped. ${samples} samples saved.` : startFailed ? 'The instrument didn’t start. Nothing was recorded.' : '';

  const meta = <>
    <span className="dv-acq-tag" data-state={state === 'stopping' ? 'acquiring' : state}><TagIcon aria-hidden />{tagLabel}</span>
    {running || state === 'recorded'
      ? <><Chip icon={<IconActivity aria-hidden />}>{samples} samples</Chip><Chip icon={<IconClock aria-hidden />}>{formatTime(elapsedSeconds)}</Chip></>
      : <Chip icon={<IconDeviceAnalytics aria-hidden />}>{instrument} · {state === 'disconnected' ? 'Disconnected' : 'Connected'}</Chip>}
  </>;
  const action = running
    ? <UnstyledButton ref={stopRef} className="dv-acq-button" onClick={() => setConfirming(true)}><IconPlayerStop aria-hidden />Stop acquisition</UnstyledButton>
    : state !== 'recorded' ? <UnstyledButton ref={startRef} className="dv-acq-button" data-variant="primary" disabled={state === 'starting' || state === 'disconnected'} aria-describedby={state === 'disconnected' ? statusId : undefined} onClick={onStart}>
      {state === 'starting' ? <><IconHistory aria-hidden />Starting…</> : <><IconPlayerPlay aria-hidden />{startFailed ? 'Try again' : 'Start acquisition'}</>}
    </UnstyledButton> : null;
  const status = state === 'disconnected'
    ? <div className="dv-acq-status" id={statusId}><StatusBanner severity="warning">{instrument} is disconnected. Connect it to start acquiring. <UnstyledButton className="dv-acq-link" onClick={onConnect}>Connect {instrument}</UnstyledButton></StatusBanner></div>
    : state === 'ready' && startFailed
      ? <div className="dv-acq-status" id={statusId}><StatusMessages messages={[{ severity: 'error', text: `${instrument} didn’t start, so nothing was recorded. Check that it’s ready, then try again.` }]} /></div>
      : state === 'recorded' ? <div className="dv-acq-status" id={statusId} ref={statusRef} tabIndex={-1}><StatusMessages messages={[{ severity: 'info', text: `Acquisition stopped. ${samples} samples saved as a recording.` }]} /></div> : null;
  const dialog = <>
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    <StopAcquisitionDialog
      opened={(confirming && running) || state === 'stopping'} experimentName={experimentName} instrument={instrument}
      samples={samples} elapsedSeconds={elapsedSeconds} routine={routine}
      phase={state === 'stopping' ? 'stopping' : stopFailed ? 'failed' : 'idle'}
      onKeepAcquiring={() => setConfirming(false)} onStop={onStop}
    />
  </>;
  return { meta, action, status, dialog };
}

/** Acquisition status and Start/Stop for the experiment header action bar. Outcomes arrive through props. */
export function AcquisitionControls(props: AcquisitionControlsProps) {
  const { meta, action, status, dialog } = useAcquisitionControls(props);
  return <div className="dv-acq">
    <div className="dv-acq-bar">
      <div className="dv-acq-meta" data-testid="acquisition-meta">{meta}</div>
      {action}
    </div>
    {status}
    {dialog}
  </div>;
}
