import { type RefObject, useCallback, useRef } from 'react';

export interface SettleStatuses<S> {
  pending: S;
  failed: S;
  succeeded: S;
}

/** Selectors, within the pane, of the elements that get focus. */
export interface SettleTargets {
  failed: string;
  succeeded: string;
}

function focusWithin(root: HTMLElement, selector: string) {
  root.querySelector<HTMLElement>(selector)?.focus();
}

/**
 * A ref callback for the pane's root that moves focus inside it when a pending action settles: to the failed target
 * (the Retry button) when it fails, to the succeeded target (the first select) when it succeeds. The pane's controls
 * are disabled while the action runs, so focus would otherwise be lost. The status comes from the editor once its async
 * action settles, after the click that started it has returned, so the callback changes with it and React calls it once
 * the settled pane has committed. It also keeps `root` pointing at the element.
 */
export function useFocusOnSettle<S>(
  status: S,
  root: RefObject<HTMLElement | null>,
  { pending, failed, succeeded }: SettleStatuses<S>,
  { failed: failedTarget, succeeded: succeededTarget }: SettleTargets,
) {
  const previous = useRef(status);
  return useCallback(
    (node: HTMLElement | null) => {
      root.current = node;
      if (!node) return;
      const settledFrom = previous.current;
      previous.current = status;
      if (settledFrom !== pending) return;
      if (status === failed) focusWithin(node, failedTarget);
      if (status === succeeded) focusWithin(node, succeededTarget);
    },
    [status, root, pending, failed, succeeded, failedTarget, succeededTarget],
  );
}
