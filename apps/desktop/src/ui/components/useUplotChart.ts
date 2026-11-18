import { useDidUpdate } from '@mantine/hooks';
import { useCallback, useRef } from 'react';
import type uPlot from 'uplot';
import { useKeyedValue } from './useKeyedValue';

export interface UplotChartOptions {
  /**
   * Names every input `create` builds the chart from (series, scales, theme, text size). The chart is destroyed and
   * built again only when it changes, so the canvas survives everything else.
   */
  rebuildKey: string;
  /** Builds the chart into `host`. */
  create: (host: HTMLDivElement) => uPlot;
  /** The chart's size for the host's current size; applied whenever the host resizes. */
  size: (host: HTMLDivElement) => { width: number; height: number };
  /** Pushes cheap changes (data, scales, a repaint) into a built chart. Runs right after each build too. */
  update?: (plot: uPlot) => void;
  /** Values `update` reads. A change runs `update` on the current chart instead of rebuilding it. */
  updateDeps?: readonly unknown[];
}

/**
 * Hosts a uPlot chart: returns a ref callback for the element it draws into. The chart follows the host's size and is
 * destroyed when the host leaves the page or the chart is rebuilt.
 */
export function useUplotChart({
  rebuildKey,
  create,
  size,
  update,
  updateDeps = [],
}: UplotChartOptions) {
  const plot = useRef<uPlot | null>(null);
  const build = useKeyedValue(rebuildKey, { create, size, update });
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host) return;
      const u = build.create(host);
      plot.current = u;
      build.update?.(u);
      const observer = new ResizeObserver(() => u.setSize(build.size(host)));
      observer.observe(host);
      return () => {
        observer.disconnect();
        u.destroy();
        plot.current = null;
      };
    },
    [build],
  );
  // The data comes from the parent; pushing it into the existing chart keeps the canvas and avoids a rebuild.
  useDidUpdate(() => {
    if (plot.current) update?.(plot.current);
  }, updateDeps);
  return attach;
}
