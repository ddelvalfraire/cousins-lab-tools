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

export interface AffectedPanel {
  id: string;
  title: string;
}

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
