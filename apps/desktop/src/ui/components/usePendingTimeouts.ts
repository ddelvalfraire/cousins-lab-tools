import { useCallback, useState } from 'react';

/**
 * Any number of timeouts that are all cleared once the element given `ref` leaves the page, so a callback never runs
 * after the component that started it is gone. Give `ref` to an element that stays mounted as long as the component.
 */
export function usePendingTimeouts() {
  const [pending] = useState(() => new Set<number>());

  const schedule = useCallback(
    (run: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        pending.delete(timer);
        run();
      }, delay);
      pending.add(timer);
    },
    [pending],
  );

  const ref = useCallback(
    () => () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    },
    [pending],
  );

  return { schedule, ref };
}
