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
 * Any number of timeouts that are all cleared once the element given `ref` leaves the page, so a callback never runs
 * after the component that started it is gone. Give `ref` to an element that stays mounted as long as the component.
 */
export function usePendingTimeouts() {
  const [timeouts] = useState(createTimeoutSet);
  const ref = useCallback(() => timeouts.clearAll, [timeouts]);
  return { schedule: timeouts.add, ref };
}
