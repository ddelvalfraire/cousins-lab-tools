import { useState } from 'react';
import type { Problem, ResolvedProblem } from './problems';

interface ProblemLists {
  problems: readonly Problem[];
  resolved: readonly ResolvedProblem[];
}

/** What to announce when the owner has moved problems to the resolved list, or null when it hasn't. */
export function resolvedAnnouncement(
  before: ProblemLists,
  resolved: readonly ResolvedProblem[],
) {
  const added = resolved.filter(
    (r) => !before.resolved.some((b) => b.id === r.id),
  );
  if (!added.length) return null;
  const last = added[added.length - 1];
  if (last.how === 'dismissed') return 'Notice dismissed.';
  const fix = before.problems
    .find((p) => p.id === last.id)
    ?.actions.find((a) => a.kind === 'fix');
  return fix?.done ?? `${last.title}: fixed.`;
}

/**
 * The Problems panel's live announcement. The panel sets it directly, and it announces a fix or dismissal in the
 * render where the owner moves a problem to the resolved list. `resolved` must not be a new array on every render of
 * the caller, such as a default `[]`, or the comparison never settles.
 */
export function useResolvedAnnouncement(
  problems: readonly Problem[],
  resolved: readonly ResolvedProblem[],
) {
  const [announcement, setAnnouncement] = useState('');
  const [previous, setPrevious] = useState<ProblemLists>({
    problems,
    resolved,
  });
  if (previous.problems !== problems || previous.resolved !== resolved) {
    // Storing information from the previous render: React reruns this component before its children render.
    setPrevious({ problems, resolved });
    const text = resolvedAnnouncement(previous, resolved);
    if (text) setAnnouncement(text);
  }
  return [announcement, setAnnouncement] as const;
}
