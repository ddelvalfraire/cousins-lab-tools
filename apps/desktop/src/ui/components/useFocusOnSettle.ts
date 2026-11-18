import { useDidUpdate } from '@mantine/hooks';
import { type RefObject, useRef } from 'react';

export interface SettleStatuses<S> {
  pending: S;
  failed: S;
  succeeded: S;
}

function focusWithin(root: HTMLElement | null, selector: string) {
  root?.querySelector<HTMLElement>(selector)?.focus();
}

/**
 * Moves focus inside `root` when a pending action settles: to the Retry button when it fails, to the first select
 * when it succeeds. The pane's controls are disabled while the action runs, so focus would otherwise be lost.
 */
export function useFocusOnSettle<S>(
  status: S,
  root: RefObject<HTMLElement | null>,
  { pending, failed, succeeded }: SettleStatuses<S>,
) {
  const previous = useRef(status);
  // The status comes from the editor once its async action settles, after the click that started it has returned.
  useDidUpdate(() => {
    const settledFrom = previous.current;
    previous.current = status;
    if (settledFrom !== pending) return;
    if (status === failed) focusWithin(root.current, '[data-action="retry"]');
    if (status === succeeded) focusWithin(root.current, '.dv-select-input');
  }, [status]);
}
