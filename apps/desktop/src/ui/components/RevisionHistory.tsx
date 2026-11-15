import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Presence, Swap } from './Motion';
import { Chip } from './Chip';
import { formatClockTime } from '../time';
import { StatusBanner } from './Primitives';
import { SidebarIcon } from './RightSidebar';
import { ImportIcon } from './ImportDialog';
import './RevisionHistory.css';

export interface PresetRevision {
  number: number;
  /** What this save changed, e.g. "Adjusted signal scaling". */
  note: string;
  /** Local date and time of the save, as an ISO string. */
  savedAt: string;
  panels: number;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
/** "2 Nov 2026 · 10:42:00", "2 Nov · 10:42:00" and "Saved 2 Nov 2026 at 10:42:00", in local time. */
export function formatSavedAt(savedAt: string) {
  const date = new Date(savedAt), time = formatClockTime(date), day = dateFormat.format(date);
  return { full: `${day} · ${time}`, short: `${dayFormat.format(date)} · ${time}`, label: `Saved ${day} at ${time}` };
}

export interface RevisionHistoryListProps {
  /** Newest first. */
  revisions: readonly PresetRevision[];
  /** Number of the current revision. */
  current: number;
  /** Number of the revision shown in the page. */
  selected: number;
  onSelect: (revision: number) => void;
  /** A restore is in progress: choosing another revision waits. */
  busy?: boolean;
  label?: string;
}

/**
 * Saved revisions for the right sidebar's Revisions tab: borderless R labels, Current and selected marks,
 * and date and panel chips, separated by inset rules.
 * Values from design/dvdash-field-review/revision-chips-review.html (.saved-history-*).
 */
export function RevisionHistoryList({ revisions, current, selected, onSelect, busy = false, label = 'Saved preset versions' }: RevisionHistoryListProps) {
  const initial = useRef(new Set(revisions.map(revision => revision.number)));
  return <nav className="dv-revision-list" aria-label={label}>
    {revisions.map(revision => {
      const saved = formatSavedAt(revision.savedAt), isSelected = revision.number === selected;
      return <RevisionEntry key={revision.number} animate={!initial.current.has(revision.number)}><button type="button" className="dv-revision-entry" aria-current={isSelected} disabled={busy} onClick={() => onSelect(revision.number)}>
        <div className="dv-revision-entry-top">
          <Chip icon={<SidebarIcon name="revisions" />}>R{revision.number}</Chip>
          <Swap className="dv-revision-entry-state" swapKey={`${revision.number === current}-${isSelected}`}>
            {revision.number === current && <span className="dv-revision-current">Current</span>}
            {isSelected && <span className="dv-revision-check"><SidebarIcon name="check" /><span className="dv-revision-sr">Selected</span></span>}
          </Swap>
        </div>
        <span className="dv-revision-entry-title">{revision.note}</span>
        <span className="dv-revision-entry-meta">
          <Chip icon={<ImportIcon name="calendar" />}><time dateTime={revision.savedAt} aria-label={saved.label}>{saved.short}</time></Chip>
          <Chip icon={<SidebarIcon name="panels" />}>{revision.panels} {revision.panels === 1 ? 'panel' : 'panels'}</Chip>
        </span>
      </button></RevisionEntry>;
    })}
  </nav>;
}

function RevisionEntry({ animate, children }: { animate: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(!animate);
  useEffect(() => setShown(true), []);
  return <Presence show={shown} className="dv-revision-entry-slot">{children}</Presence>;
}

export interface RevisionChange {
  /** Panel or signal the change belongs to, e.g. "Mass 44". */
  item: string;
  /** Signal settings use the signal icon; layout changes use the panel icon. */
  itemKind?: 'signal' | 'panel';
  field: string;
  before: string;
  after: string;
  /** Shown beside the field for added, removed or moved panels. */
  kind?: 'changed' | 'added' | 'removed' | 'moved';
}

/** Setting changes grouped by panel: previous value, arrow, highlighted new value (.revision-diff-group). */
export function RevisionChanges({ changes }: { changes: readonly RevisionChange[] }) {
  const items = [...new Set(changes.map(change => change.item))];
  return <>{items.map(item => {
    const group = changes.filter(change => change.item === item);
    return <section key={item} className="dv-revision-diff">
      <header className="dv-revision-diff-heading"><SidebarIcon name={group[0].itemKind === 'panel' ? 'panels' : 'signals'} /><h3>{item}</h3></header>
      <dl className="dv-revision-diff-rows">
        {group.map(change => <div key={change.field} className="dv-revision-diff-row">
          <dt>{change.field}{change.kind && change.kind !== 'changed' && <small>{change.kind[0].toUpperCase() + change.kind.slice(1)}</small>}</dt>
          <dd>
            <span className="dv-revision-before"><span className="dv-revision-sr">Previous: </span>{change.before}</span>
            <span className="dv-revision-arrow" aria-hidden="true">→</span>
            <span className="dv-revision-after"><span className="dv-revision-sr">Selected: </span>{change.after}</span>
          </dd>
        </div>)}
      </dl>
    </section>;
  })}</>;
}

/** Stage of restoring an earlier revision as a new one. */
export type RestorePhase = 'idle' | 'confirm' | 'restoring' | 'failed' | 'restored';

/**
 * Confirmation above the saved version: restoring copies the selected revision into a new revision.
 * Values from design/dvdash-field-review/revision-history-review.html (the restore confirmation above the saved version).
 */
export function RevisionRestoreConfirm({ phase, selected, next, onCancel, onConfirm }: {
  /** `restored`: `next` was created from `selected`. */
  phase: RestorePhase; selected: number; next: number; onCancel: () => void; onConfirm: () => void;
}) {
  const busy = phase === 'restoring';
  return <Presence show={phase !== 'idle'} className="dv-revision-restore-slot"><div className="dv-revision-restore">
    <Swap swapKey={phase === 'restored' ? 'restored' : 'confirmation'}>{phase === 'restored'
      ? <div role="status"><StatusBanner>R{next} created from R{selected}.</StatusBanner></div>
      : <>
    <Swap swapKey={phase === 'failed' ? 'failed' : 'confirm'}><StatusBanner severity={phase === 'failed' ? 'error' : 'info'} announce={phase === 'failed'}>
      {phase === 'failed' ? 'Could not create the revision. Try again.' : `Restore R${selected} as R${next}? Existing experiments keep their pinned revisions.`}
    </StatusBanner></Swap>
    <div className="dv-revision-restore-buttons">
      <button type="button" className="dv-revision-text-button" disabled={busy} onClick={onCancel}>Cancel</button>
      <RevisionButton disabled={busy} onClick={onConfirm} autoFocus><Swap swapKey={phase}>{busy ? `Creating R${next}…` : phase === 'failed' ? 'Try again' : `Create R${next}`}</Swap></RevisionButton>
    </div>
    </>}</Swap>
  </div></Presence>;
}

/** Filled accent action used for Restore and Create (.revision-confirm). */
export function RevisionButton({ children, ...props }: React.ComponentPropsWithRef<'button'> & { children: ReactNode }) {
  return <button type="button" className="dv-revision-button" {...props}>{children}</button>;
}
