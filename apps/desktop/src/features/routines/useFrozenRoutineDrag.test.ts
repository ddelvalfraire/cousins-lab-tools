import { describe, expect, test } from 'vitest';
import {
  frozenDragStart,
  frozenGhostPlacement,
  type RoutineDragState,
} from './useFrozenRoutineDrag';

const steps = ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id }));
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  right: left + width,
  bottom: top + height,
});

describe('frozenDragStart', () => {
  test('a drag over a slot drops after the named step', () => {
    expect(
      frozenDragStart(
        { type: 'dragging', stepId: 's4', afterStepId: 's1' },
        steps,
        { width: 320, height: 56 },
      ),
    ).toEqual({
      id: 's4',
      origin: 3,
      over: 1,
      valid: true,
      x: 0,
      y: 0,
      ox: 0,
      oy: 0,
      w: 320,
      h: 56,
      moved: true,
    });
  });

  test('a drag outside the builder returns to where it started', () => {
    const drag = frozenDragStart({ type: 'outside', stepId: 's4' }, steps, {
      width: 320,
      height: 56,
    });
    expect(drag).toMatchObject({ valid: false, origin: 3, over: 3 });
  });
});

describe('frozenGhostPlacement', () => {
  const drag: RoutineDragState = {
    id: 's4',
    origin: 3,
    over: 1,
    valid: true,
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
    w: 300,
    h: 56,
    moved: true,
  };
  const root = box(100, 50, 900, 700),
    canvas = box(140, 200, 600, 400),
    slot = box(140, 260, 600, 56);

  test('sits beside the slot it can drop into', () => {
    expect(frozenGhostPlacement(drag, slot, canvas, root)).toMatchObject({
      x: 140 + 600 * 0.38 - 100,
      y: 316 + 18 - 50,
      ox: 12,
      oy: 10,
    });
  });

  test('sits above the builder corner when it would be cancelled', () => {
    expect(
      frozenGhostPlacement({ ...drag, valid: false }, slot, canvas, root),
    ).toMatchObject({
      x: 740 - 300 * 0.4 - 100,
      y: 200 - 70 - 50,
      ox: 0,
      oy: 0,
    });
  });
});
