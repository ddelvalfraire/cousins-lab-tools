import { Modal, UnstyledButton } from '@mantine/core';
import { type ReactNode, type RefObject, useCallback, useRef } from 'react';
import { Banner } from './Banner';
import '@/shared/theme/Approved.css';
import './GuardDialog.css';

/** Approved confirmation dialog shell: title, body, safe action on the left, consequential actions on the right. */
export function GuardDialog({
  opened,
  title,
  busy,
  onKeep,
  keepLabel,
  keepRef,
  actions,
  children,
}: {
  opened: boolean;
  title: string;
  busy: boolean;
  onKeep: () => void;
  keepLabel: string;
  keepRef?: RefObject<HTMLButtonElement | null>;
  actions: ReactNode;
  children: ReactNode;
}) {
  // Compound parts so the header is not a second page banner beside the window bar's <header> (as KeyboardShortcuts).
  return (
    <Modal.Root
      opened={opened}
      onClose={() => {
        if (!busy) onKeep();
      }}
      centered
      size={460}
      padding={0}
      xOffset={16}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      classNames={{
        root: 'dvdash',
        inner: 'dv-guard-inner',
        content: 'dv-guard',
        header: 'dv-guard-header',
        title: 'dv-guard-title',
        body: 'dv-guard-body',
      }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header role="none">
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="dv-guard-main">{children}</div>
          <div className="dv-guard-actions">
            <UnstyledButton
              ref={keepRef}
              className="dv-guard-button"
              data-autofocus
              disabled={busy}
              onClick={onKeep}
            >
              {keepLabel}
            </UnstyledButton>
            <span className="dv-guard-spacer" />
            {actions}
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

/**
 * A ref callback that focuses its element when `when` turns true, e.g. the Retry button after an attempt fails. The
 * owner decides when an attempt has failed, often after an await, so no event handler here can move focus then. React
 * calls a changed ref callback once the change has committed, so focus moves to the updated button.
 */
export function useFocusWhen(when: boolean) {
  const was = useRef(when);
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      if (when && !was.current) node.focus();
      was.current = when;
    },
    [when],
  );
}

export interface UnsavedChange {
  /** Short form for the list, e.g. "Sample interval: 0.5 s → 0.25 s". */
  short: string;
  /** Full sentence when it's the only change, e.g. "Sample interval changed from 0.5 s to 0.25 s." */
  sentence: string;
}
export type UnsavedChangesPhase =
  | 'idle'
  | 'saving'
  | 'checking'
  | 'failed'
  | 'unknown';

export interface UnsavedChangesDialogProps {
  opened: boolean;
  /** Leaving the editor, or closing the app window. */
  intent?: 'leave' | 'close';
  changes: UnsavedChange[];
  /** Reasons the draft can't be saved. Any problem disables saving. */
  problems?: string[];
  /** Last saved revision; saving creates the next one. */
  revision: number;
  phase?: UnsavedChangesPhase;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
  /** Unknown outcome: asks whether the earlier save landed instead of saving a second time. */
  onCheckStatus: () => void;
}

/** Asks before leaving or closing an editor with unsaved changes. */
export function UnsavedChangesDialog({
  opened,
  intent = 'leave',
  changes,
  problems = [],
  revision,
  phase = 'idle',
  onKeepEditing,
  onDiscard,
  onSave,
  onCheckStatus,
}: UnsavedChangesDialogProps) {
  const busy = phase === 'saving' || phase === 'checking';
  const closing = intent === 'close';
  const next = `R${revision + 1}`;
  const confirmRef = useFocusWhen(phase === 'failed' || phase === 'unknown');

  const message: { severity: 'error' | 'warning'; texts: string[] } | null =
    problems.length
      ? { severity: 'error', texts: problems }
      : phase === 'failed'
        ? {
            severity: 'error',
            texts: [`Couldn’t save ${next}. Your changes are still here.`],
          }
        : phase === 'unknown'
          ? {
              severity: 'warning',
              texts: [
                `Couldn’t confirm whether ${next} was saved. Your changes are still here. Check the status before saving again, so a second revision isn’t created.`,
              ],
            }
          : null;
  const confirmLabel =
    phase === 'saving'
      ? 'Saving…'
      : phase === 'checking'
        ? 'Checking…'
        : phase === 'failed'
          ? 'Retry save'
          : phase === 'unknown'
            ? 'Check status'
            : closing
              ? 'Save and close'
              : 'Save and leave';

  return (
    <GuardDialog
      opened={opened && (changes.length > 0 || phase !== 'idle')}
      busy={busy}
      onKeep={onKeepEditing}
      keepLabel="Keep editing"
      title={`Save changes before ${closing ? 'closing' : 'leaving'}?`}
      actions={
        <>
          <UnstyledButton
            className="dv-guard-button"
            data-variant="danger"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard changes
          </UnstyledButton>
          <UnstyledButton
            ref={confirmRef}
            className="dv-guard-button"
            data-variant="primary"
            disabled={busy || problems.length > 0}
            onClick={phase === 'unknown' ? onCheckStatus : onSave}
          >
            {confirmLabel}
          </UnstyledButton>
        </>
      }
    >
      <div className="dv-guard-summary" data-testid="guard-summary">
        {changes.length === 1 ? (
          <p>{changes[0].sentence}</p>
        ) : (
          <>
            <p>
              {changes.length} changes since R{revision}:
            </p>
            <ul>
              {changes.map((change) => (
                <li key={change.short}>{change.short}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="dv-guard-note">
        {problems.length
          ? 'This draft can’t be saved yet. Keep editing to fix it, or discard your changes.'
          : `Saving creates ${next}. Discarding keeps R${revision} as it is.`}
      </p>
      {message && (
        <div className="dv-guard-messages" data-testid="guard-messages">
          <Banner
            severity={message.severity}
            messages={message.texts}
            announce
          />
        </div>
      )}
    </GuardDialog>
  );
}
