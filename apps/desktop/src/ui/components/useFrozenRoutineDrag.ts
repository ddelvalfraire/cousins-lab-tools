import { type RefObject, useCallback, useRef, useState } from 'react';

/** A pointer drag of one routine step, in pixels relative to the editor root. */
export interface RoutineDragState {
  id: string;
  origin: number;
  over: number;
  valid: boolean;
  x: number;
  y: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  moved: boolean;
}

/** A drag the editor opens in for review: over a slot, or outside the builder. */
export type FrozenRoutineDrag =
  | { type: 'dragging'; stepId: string; afterStepId: string }
  | { type: 'outside'; stepId: string };

type Size = Pick<DOMRect, 'width' | 'height'>;
type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>;

/** The drag a frozen review state starts from, sized like the step it picks up. */
export function frozenDragStart(
  freeze: FrozenRoutineDrag,
  steps: readonly { id: string }[],
  step: Size,
): RoutineDragState {
  const origin = steps.findIndex((s) => s.id === freeze.stepId),
    rest = steps.filter((s) => s.id !== freeze.stepId);
  const valid = freeze.type === 'dragging',
    over = valid
      ? rest.findIndex((s) => s.id === freeze.afterStepId) + 1
      : origin;
  return {
    id: freeze.stepId,
    origin,
    over,
    valid,
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
    w: step.width,
    h: step.height,
    moved: true,
  };
}

/** Places the ghost beside its slot when it can drop there, otherwise above the builder's top right corner. */
export function frozenGhostPlacement(
  drag: RoutineDragState,
  slot: Box,
  canvas: Box,
  root: Box,
): RoutineDragState {
  if (drag.valid)
    return {
      ...drag,
      x: slot.left + slot.width * 0.38 - root.left,
      y: slot.bottom + 18 - root.top,
      ox: 12,
      oy: 10,
    };
  return {
    ...drag,
    x: canvas.right - drag.w * 0.4 - root.left,
    y: canvas.top - 70 - root.top,
  };
}

/**
 * Opens the editor in a frozen drag for review. The steps have to be measured before the slot can render, and the
 * slot before the ghost can be placed, so each measurement runs from the ref of the element it needs.
 */
export function useFrozenRoutineDrag({
  initial,
  draft,
  drag,
  root,
  setDrag,
}: {
  initial: FrozenRoutineDrag | null;
  /** Latest rendered routine. */
  draft: RefObject<{ steps: readonly { id: string }[] }>;
  /** Latest rendered drag. */
  drag: RefObject<RoutineDragState | null>;
  root: RefObject<HTMLElement | null>;
  setDrag: (drag: RoutineDragState) => void;
}) {
  const [freeze, setFreeze] = useState(initial);
  const canvasRef = useRef<HTMLFieldSetElement>(null);
  const attachCanvas = useCallback(
    (canvas: HTMLFieldSetElement | null) => {
      canvasRef.current = canvas;
      if (!canvas || !freeze || drag.current) return;
      const step = canvas
        .querySelector(`[data-step="${freeze.stepId}"]`)
        ?.getBoundingClientRect();
      if (step) setDrag(frozenDragStart(freeze, draft.current.steps, step));
      else setFreeze(null);
    },
    [freeze, drag, draft, setDrag],
  );
  const attachSlot = useCallback(
    (slot: HTMLElement | null) => {
      const current = drag.current,
        canvas = canvasRef.current,
        base = root.current;
      if (!slot || !freeze || !current || !canvas || !base) return;
      setDrag(
        frozenGhostPlacement(
          current,
          slot.getBoundingClientRect(),
          canvas.getBoundingClientRect(),
          base.getBoundingClientRect(),
        ),
      );
      setFreeze(null);
    },
    [freeze, drag, root, setDrag],
  );
  return { frozen: freeze !== null, canvasRef, attachCanvas, attachSlot };
}
