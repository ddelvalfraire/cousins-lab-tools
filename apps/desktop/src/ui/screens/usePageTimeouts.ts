import { useCallback, useState } from 'react';

export interface TimeoutSet {
  /** Runs `fn` after `ms` milliseconds unless cleared first. */
  add: (fn: () => void, ms: number) => void;
  /** Cancels every timeout that hasn't run yet. */
  clearAll: () => void;
}

export function createTimeoutSet(): TimeoutSet {
  const pending = new Set<ReturnType<typeof setTimeout>>();
  return {
    add(fn, ms) {
      const id = setTimeout(() => {
        pending.delete(id);
        fn();
      }, ms);
      pending.add(id);
    },
    clearAll() {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    },
  };
}

/**
 * Timeouts for a page's simulated outcomes, cancelled when the page goes away so a late one can't update it.
 * Attach `clearOnUnmount` to the page's root element, which lives exactly as long as the page.
 */
export function usePageTimeouts() {
  const [timeouts] = useState(createTimeoutSet);
  const clearOnUnmount = useCallback(() => timeouts.clearAll, [timeouts]);
  return { later: timeouts.add, clearOnUnmount };
}
