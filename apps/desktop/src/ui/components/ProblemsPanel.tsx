import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IconAlertTriangle, IconCheck, IconChevronDown, IconCircleX, IconCurrentLocation, IconHistory,
  IconInfoCircle, IconLayoutBoardSplit, IconRefresh,
} from '@tabler/icons-react';
import { Chip } from './Chip';
import './ProblemsPanel.css';

export type ProblemSeverity = 'error' | 'warning' | 'info';

/**
 * What an action does when pressed:
 * - `fix` runs in place through `onAction`; its progress comes back through `actionStatus`.
 * - `navigate` opens another sidebar tab through `onNavigate(tab)`.
 * - `dismiss` records a notice as dismissed through `onDismiss`.
 * - `locate` selects the problem (highlighting its panels) and calls `onAction` so the workspace can scroll to it.
 */
export type ProblemActionKind = 'fix' | 'navigate' | 'dismiss' | 'locate';

export interface ProblemAction {
  id: string;
  label: string;
  kind: ProblemActionKind;
  /** Sidebar tab opened by a `navigate` action. */
  tab?: string;
  /** Button label while a fix runs, e.g. "Reconnecting…". */
  pending?: string;
  /** One sentence shown under the buttons while a fix runs, e.g. "Waiting for MS-01…". */
  waiting?: string;
  /** One sentence shown when the fix didn't work. */
  failed?: string;
  /** Announced when the fix succeeds and the problem moves to the resolved list. */
  done?: string;
}

export interface AffectedPanel { id: string; title: string }

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  /** One plain sentence. */
  title: string;
  /** When it started, e.g. "Since 14:02:31 · 45 s ago". */
  when: string;
  explanation: string;
  affects: readonly AffectedPanel[];
  actions: readonly ProblemAction[];
}

export interface ResolvedProblem {
  id: string;
  title: string;
  how: 'fixed' | 'dismissed';
  /** Clock time, e.g. "14:05:20". */
  at: string;
}

/** Progress of a problem's `fix` action. Absent means idle. */
export type ProblemActionStatus = 'pending' | 'failed';

export interface ProblemsPanelProps {
  /** Active problems. Fixed or dismissed ones belong in `resolved`. */
  problems: readonly Problem[];
  resolved?: readonly ResolvedProblem[];
  selectedId?: string | null;
  /** Progress of each problem's fix, keyed by problem id. */
  actionStatus?: Readonly<Record<string, ProblemActionStatus | undefined>>;
  /** Clock time of the last check, shown when there are no problems. */
  lastChecked?: string;
  /** Whether the resolved list starts expanded. */
  defaultResolvedOpen?: boolean;
  /** Selecting a problem highlights its affected panels; `null` clears the selection. */
  onSelect: (id: string | null) => void;
  onAction: (problemId: string, actionId: string) => void;
  onNavigate: (tab: string) => void;
  onDismiss: (problemId: string) => void;
}

const SEVERITY_ORDER: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };
const SEVERITY_ICON: Record<ProblemSeverity, ReactNode> = {
  error: <IconCircleX aria-hidden />,
  warning: <IconAlertTriangle aria-hidden />,
  info: <IconInfoCircle aria-hidden />,
};

const needsAttention = (problems: readonly Problem[]) => problems.filter(p => p.severity !== 'info');
const attentionText = (n: number) => `${n} ${n === 1 ? 'problem needs' : 'problems need'} attention`;
const noticeText = (n: number) => `${n} ${n === 1 ? 'notice' : 'notices'}`;

/** One-line summary used by the panel and the header trigger. */
export function problemsSummary(problems: readonly Problem[]) {
  const attention = needsAttention(problems).length;
  const notices = problems.length - attention;
  const severity: 'error' | 'warning' | 'clear' = problems.some(p => p.severity === 'error') ? 'error' : attention ? 'warning' : 'clear';
  return { attention, notices, severity };
}

/** Flag for a workspace panel: the selected problem's severity and title when it affects that panel. */
export function problemFlag(problems: readonly Problem[], selectedId: string | null | undefined, panelId: string) {
  const selected = problems.find(p => p.id === selectedId);
  return selected && selected.affects.some(a => a.id === panelId) ? { severity: selected.severity, label: selected.title } : null;
}

/** Content of the right sidebar's Problems tab. Fixes run in place; no dialogs open. */
export function ProblemsPanel({
  problems, resolved = [], selectedId = null, actionStatus = {}, lastChecked, defaultResolvedOpen = false,
  onSelect, onAction, onNavigate, onDismiss,
}: ProblemsPanelProps) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(selectedId ? [selectedId] : []));
  const [prevSelected, setPrevSelected] = useState(selectedId);
  const [resolvedOpen, setResolvedOpen] = useState(defaultResolvedOpen);
  const [announcement, setAnnouncement] = useState('');
  const actedOn = useRef<string | null>(null);
  const previous = useRef({ problems, resolved });

  // A problem selected from outside (a panel flag, a locate action) opens too.
  if (selectedId !== prevSelected) {
    setPrevSelected(selectedId);
    if (selectedId && !open.has(selectedId)) setOpen(new Set(open).add(selectedId));
  }

  // Announce fixes and dismissals once the owner moves a problem to the resolved list.
  useEffect(() => {
    const before = previous.current;
    previous.current = { problems, resolved };
    const added = resolved.filter(r => !before.resolved.some(b => b.id === r.id));
    if (!added.length) return;
    const last = added[added.length - 1];
    const fix = before.problems.find(p => p.id === last.id)?.actions.find(a => a.kind === 'fix');
    setAnnouncement(last.how === 'dismissed' ? 'Notice dismissed.' : fix?.done ?? `${last.title}: fixed.`);
  }, [problems, resolved]);

  // When the problem the user acted on leaves the list, keep keyboard focus in the panel.
  useLayoutEffect(() => {
    const id = actedOn.current;
    if (!id || problems.some(p => p.id === id)) return;
    actedOn.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    rootRef.current?.querySelector<HTMLElement>('[data-toggle], [data-resolved-toggle]')?.focus();
  }, [problems]);

  const sorted = [...problems].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const { attention, notices } = problemsSummary(problems);
  const groups: [string, Problem[]][] = [
    ['Needs attention', sorted.filter(p => p.severity !== 'info')],
    ['Notices', sorted.filter(p => p.severity === 'info')],
  ];

  function toggle(problem: Problem) {
    const next = new Set(open);
    if (open.has(problem.id) && selectedId === problem.id) {
      next.delete(problem.id);
      setOpen(next);
      onSelect(null);
      return;
    }
    next.add(problem.id);
    setOpen(next);
    onSelect(problem.id);
    const n = problem.affects.length;
    if (n) setAnnouncement(`Highlighted ${n} affected panel${n === 1 ? '' : 's'}.`);
  }

  function act(problem: Problem, action: ProblemAction) {
    if (actionStatus[problem.id] === 'pending') return;
    actedOn.current = problem.id;
    switch (action.kind) {
      case 'navigate': onNavigate(action.tab ?? ''); return;
      case 'dismiss': onDismiss(problem.id); return;
      case 'locate':
        if (selectedId !== problem.id) onSelect(problem.id);
        onAction(problem.id, action.id);
        return;
      case 'fix': onAction(problem.id, action.id);
    }
  }

  function renderProblem(problem: Problem) {
    const expanded = open.has(problem.id);
    const status = actionStatus[problem.id];
    const fix = problem.actions.find(a => a.kind === 'fix');
    const bodyId = `${uid}-${problem.id}`;
    return <div key={problem.id} className="dv-prob-item" data-problem={problem.id} data-selected={selectedId === problem.id}>
      <button type="button" className="dv-prob-head" data-toggle={problem.id} aria-expanded={expanded} aria-controls={bodyId} onClick={() => toggle(problem)}>
        <span className="dv-prob-sev" data-severity={problem.severity}>{SEVERITY_ICON[problem.severity]}</span>
        <span className="dv-prob-copy"><strong>{problem.title}</strong><small>{problem.when}</small></span>
        <IconChevronDown className="dv-prob-chev" aria-hidden />
      </button>
      {expanded && <div className="dv-prob-body" id={bodyId}>
        <p>{problem.explanation}</p>
        {problem.affects.length > 0 && <div className="dv-prob-affects">
          {problem.affects.map(a => <Chip key={a.id} icon={<IconLayoutBoardSplit aria-hidden />}>{a.title}</Chip>)}
        </div>}
        <div className="dv-prob-actions">
          {problem.actions.map(action => {
            const isFix = action.kind === 'fix';
            const label = status === 'pending' && isFix && action.pending ? action.pending : status === 'failed' && isFix ? 'Try again' : action.label;
            const icon = isFix ? (status === 'pending' ? <IconHistory aria-hidden /> : <IconRefresh aria-hidden />) : action.kind === 'locate' ? <IconCurrentLocation aria-hidden /> : null;
            return <button key={action.id} type="button" className="dv-prob-button" data-kind={action.kind} data-action={`${problem.id}:${action.id}`}
              aria-disabled={status === 'pending' || undefined} onClick={() => act(problem, action)}>{icon}{label}</button>;
          })}
        </div>
        {status === 'pending' && fix?.waiting && <p className="dv-prob-result" data-state="pending" role="status"><IconHistory aria-hidden />{fix.waiting}</p>}
        {status === 'failed' && fix?.failed && <p className="dv-prob-result" data-state="failed" role="alert"><IconCircleX aria-hidden />{fix.failed}</p>}
      </div>}
    </div>;
  }

  const resolvedId = `${uid}-resolved`;
  return <div className="dv-prob" ref={rootRef}>
    {sorted.length === 0
      ? <div className="dv-prob-clear">
        <div className="dv-prob-sev" data-severity="resolved"><IconCheck aria-hidden /></div>
        <strong>No problems</strong>
        <p>{lastChecked ? `Last checked ${lastChecked}. ` : ''}New problems appear here as they happen.</p>
      </div>
      : <>
        <p className="dv-prob-summary">{attention ? attentionText(attention) : 'Nothing needs attention'}{notices ? ` · ${noticeText(notices)}` : ''}</p>
        {groups.map(([title, items]) => items.length > 0 && <div key={title}>
          <div className="dv-prob-group">{title}</div>
          {items.map(renderProblem)}
        </div>)}
      </>}
    {resolved.length > 0 && <>
      <button type="button" className="dv-prob-resolved-toggle" data-resolved-toggle aria-expanded={resolvedOpen} aria-controls={resolvedOpen ? resolvedId : undefined} onClick={() => setResolvedOpen(v => !v)}>
        <IconChevronDown aria-hidden />{resolved.length} resolved in this session
      </button>
      {resolvedOpen && <div id={resolvedId}>
        {resolved.map(r => <div key={r.id} className="dv-prob-item">
          <div className="dv-prob-head">
            <span className="dv-prob-sev" data-severity="resolved"><IconCheck aria-hidden /></span>
            <span className="dv-prob-copy"><strong>{r.title}</strong><small>{r.how === 'fixed' ? 'Fixed' : 'Dismissed'} at {r.at}</small></span>
          </div>
        </div>)}
      </div>}
    </>}
    <div className="dv-prob-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  </div>;
}

/** Header chip that summarises active problems and opens the Problems tab. */
export function ProblemsTrigger({ problems, onOpen, controls }: {
  problems: readonly Problem[];
  onOpen: () => void;
  /** Id of the sidebar panel it opens. */
  controls?: string;
}) {
  const { attention, notices, severity } = problemsSummary(problems);
  const icon = severity === 'error' ? <IconCircleX aria-hidden /> : severity === 'warning' ? <IconAlertTriangle aria-hidden /> : <IconCheck aria-hidden />;
  const text = attention ? attentionText(attention) : notices ? noticeText(notices) : 'No problems';
  return <button type="button" className="dv-prob-trigger" data-severity={severity} aria-controls={controls} onClick={onOpen}>{icon}{text}</button>;
}

/** Outline plus label badge around a workspace panel affected by the selected problem. */
export function AffectedPanelFlag({ severity, label, children }: {
  /** Severity of the selected problem; `null` shows the panel unflagged. */
  severity?: ProblemSeverity | null;
  label?: string;
  children: ReactNode;
}) {
  const tone = severity === 'error' ? 'error' : severity ? 'warning' : undefined;
  return <div className="dv-prob-flagged" data-flag={tone}>
    {severity && label && <span className="dv-prob-flag" data-severity={tone} title={label}>{SEVERITY_ICON[severity]}<span>{label}</span></span>}
    {children}
  </div>;
}
