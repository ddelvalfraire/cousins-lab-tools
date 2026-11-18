import { useCallback, useRef, useState } from 'react';

/** Rounding room, so a strip within a couple of pixels of its end counts as at the end. */
const SLACK = 2;

/**
 * Whether a sideways scroller shows its last item. Give `ref` to the scroller: it measures when the scroller mounts
 * and whenever the scroller or its content box changes size, which covers items being added or removed. Call
 * `measure` from the scroller's scroll handler.
 */
export function useAtScrollEnd<T extends HTMLElement>() {
  const element = useRef<T>(null);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = element.current;
    if (el) setAtEnd(el.scrollWidth <= el.clientWidth + el.scrollLeft + SLACK);
  }, []);

  const ref = useCallback(
    (el: T | null) => {
      if (!el) return;
      element.current = el;
      measure();
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(measure);
      observer?.observe(el);
      if (el.firstElementChild) observer?.observe(el.firstElementChild);
      return () => {
        observer?.disconnect();
        element.current = null;
      };
    },
    [measure],
  );

  return { ref, element, atEnd, measure };
}
