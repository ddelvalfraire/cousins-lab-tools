import { useCallback, useRef } from 'react';
import type uPlot from 'uplot';
import { useKeyedValue } from './useKeyedValue';

export interface UplotChartOptions {
  /**
   * Every primitive `create` and `size` read (series fields, scales, theme, text size), compared one by one. The chart
   * is destroyed and built again only when one changes, so the canvas survives everything else. `create` and `size`
   * are the ones from the render where this last changed, so they must read nothing that is missing here.
   */
  buildFrom: readonly (string | number | boolean | null | undefined)[];
  /** Builds the chart into `host`. */
  create: (host: HTMLDivElement) => uPlot;
  /** The chart's size for the host's current size; applied whenever the host resizes. */
  size: (host: HTMLDivElement) => { width: number; height: number };
  /** Pushes cheap changes (data, scales, a repaint) into a built chart. Runs right after each build too. */
  update?: (plot: uPlot) => void;
  /** Values `update` reads or repaints from, compared with Object.is. A change runs `update` on the current chart. */
  updateFrom?: readonly unknown[];
}

/**
 * Hosts a uPlot chart. `host` is the ref callback for the element it draws into: the chart follows that element's
 * size and is destroyed when it leaves the page or the chart is rebuilt. `follow` goes on an element that mounts and
 * unmounts with the host, such as its parent. Its ref callback changes with `updateFrom`, and React calls it after the
 * commit, so new data reaches the existing chart without rebuilding it. One ref can't do both, because React runs a
 * changed ref's cleanup, which destroys the chart, before calling the new one.
 */
export function useUplotChart({
  buildFrom,
  create,
  size,
  update,
  updateFrom = [],
}: UplotChartOptions) {
  const plot = useRef<uPlot | null>(null);
  const build = useKeyedValue(buildFrom, { create, size, update });
  const host = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const u = build.create(el);
      plot.current = u;
      build.update?.(u);
      const observer = new ResizeObserver(() => u.setSize(build.size(el)));
      observer.observe(el);
      return () => {
        observer.disconnect();
        u.destroy();
        plot.current = null;
      };
    },
    [build],
  );
  const push = useKeyedValue(updateFrom, update);
  const follow = useCallback(
    (el: HTMLElement | null) => {
      if (el && plot.current) push?.(plot.current);
    },
    [push],
  );
  return { host, follow };
}
