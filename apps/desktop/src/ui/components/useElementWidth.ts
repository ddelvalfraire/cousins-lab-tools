import { useEffect, useRef, useState } from 'react';

/** The element's rendered width in px, kept current with a ResizeObserver; `fallback` until the first measurement. */
export function useElementWidth<T extends Element>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setWidth(w); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
