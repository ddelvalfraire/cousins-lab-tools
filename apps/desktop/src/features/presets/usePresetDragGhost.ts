import { useWindowEvent } from '@mantine/hooks';
import { useCallback, useRef, useState } from 'react';

/** A drag of one preset panel. Live drags hold viewport pointer coordinates; frozen ones sit on their slot. */
export interface PresetDragState {
  id: string;
  origin: number;
  over: number;
  valid: boolean;
  moved: boolean;
  x: number;
  y: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  frozen: boolean;
}

/** A drag the editor opens in for review: panel `id` over panel `overId`, or outside the builder when null. */
export interface FrozenPresetDrag {
  id: string;
  overId: string | null;
}

type Size = Pick<DOMRect, 'width' | 'height'>;
type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'width' | 'height'>;

/** The frozen drag for a review state, sized like the panel it lifts, or null when the panel is missing. */
export function frozenPresetDrag(
  frozen: FrozenPresetDrag,
  panels: readonly { id: string }[],
  panel: Size,
): PresetDragState | null {
  const origin = panels.findIndex((p) => p.id === frozen.id);
  if (origin < 0) return null;
  const rest = panels.filter((p) => p.id !== frozen.id),
    valid = frozen.overId !== null;
  const over = valid
    ? Math.max(
        0,
        rest.findIndex((p) => p.id === frozen.overId),
      )
    : origin;
  return {
    id: frozen.id,
    origin,
    over,
    valid,
    moved: true,
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
    w: panel.width,
    h: panel.height,
    frozen: true,
  };
}

/**
 * Where the ghost goes, in viewport pixels. A live drag follows the pointer. A frozen drag sits on its slot, or above
 * the builder's top right corner when it would be cancelled; it waits (null) until its slot has rendered.
 */
export function presetGhostBox(
  drag: PresetDragState,
  slot: Box | undefined,
  canvas: Box,
): { left: number; top: number; width: number } | null {
  if (!drag.frozen)
    return { left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w };
  if (!slot) return null;
  const width = slot.width;
  return drag.valid
    ? {
        left: slot.left + slot.width * 0.62 - 12,
        top: slot.top + slot.height * 0.3 - 10,
        width,
      }
    : { left: canvas.right - width * 0.35, top: canvas.top - 28, width };
}

/**
 * Lays out the preset editor's drag ghost. A review drag starts from the canvas ref when the editor mounts, and the
 * ghost is placed from its own ref whenever the drag changes, before paint. A frozen ghost follows window resizes.
 */
export function usePresetDragGhost({
  initial,
  panels,
  drag,
  setDrag,
}: {
  initial: FrozenPresetDrag | undefined;
  panels: readonly { id: string }[];
  drag: PresetDragState | null;
  setDrag: (drag: PresetDragState) => void;
}) {
  // Read once: the review drag is set up when the editor mounts, from the panels it mounts with.
  const [start] = useState(() =>
    initial ? { frozen: initial, panels } : null,
  );
  const started = useRef(false);
  const canvasRef = useRef<HTMLElement>(null),
    layerRef = useRef<HTMLDivElement>(null),
    ghostRef = useRef<HTMLElement>(null);

  const attachCanvas = useCallback(
    (canvas: HTMLElement | null) => {
      canvasRef.current = canvas;
      if (!canvas || !start || started.current) return;
      started.current = true;
      const el = canvas.querySelector<HTMLElement>(
        `:scope > [data-id="${start.frozen.id}"]`,
      );
      const next =
        el &&
        frozenPresetDrag(
          start.frozen,
          start.panels,
          el.getBoundingClientRect(),
        );
      if (next) setDrag(next);
    },
    [start, setDrag],
  );

  const place = useCallback((ghost: HTMLElement, current: PresetDragState) => {
    const layer = layerRef.current,
      canvas = canvasRef.current;
    if (!layer || !canvas) return;
    const box = presetGhostBox(
      current,
      canvas.querySelector('[data-placeholder]')?.getBoundingClientRect(),
      canvas.getBoundingClientRect(),
    );
    if (!box) return;
    const base = layer.getBoundingClientRect();
    ghost.style.width = `${box.width}px`;
    ghost.style.left = `${box.left - base.left}px`;
    ghost.style.top = `${box.top - base.top}px`;
  }, []);
  const attachGhost = useCallback(
    (ghost: HTMLElement | null) => {
      ghostRef.current = ghost;
      if (ghost && drag) place(ghost, drag);
    },
    [drag, place],
  );
  useWindowEvent('resize', () => {
    if (drag?.frozen && ghostRef.current) place(ghostRef.current, drag);
  });

  return { canvasRef, attachCanvas, layerRef, attachGhost };
}
