import { describe, expect, test } from 'vitest';
import {
  frozenPresetDrag,
  type PresetDragState,
  presetGhostBox,
} from './usePresetDragGhost';

const panels = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }));
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
});
const size = { width: 400, height: 220 };

describe('frozenPresetDrag', () => {
  test('a drag over a panel drops at that panel', () => {
    expect(
      frozenPresetDrag({ id: 'p3', overId: 'p1' }, panels, size),
    ).toMatchObject({
      id: 'p3',
      origin: 2,
      over: 0,
      valid: true,
      moved: true,
      w: 400,
      h: 220,
      frozen: true,
    });
  });

  test('a drag outside the builder returns to where it started', () => {
    expect(
      frozenPresetDrag({ id: 'p3', overId: null }, panels, size),
    ).toMatchObject({ valid: false, origin: 2, over: 2 });
  });

  test('a missing panel freezes nothing', () => {
    expect(frozenPresetDrag({ id: 'p9', overId: 'p1' }, panels, size)).toBe(
      null,
    );
  });
});

describe('presetGhostBox', () => {
  const live: PresetDragState = {
    id: 'p3',
    origin: 2,
    over: 0,
    valid: true,
    moved: true,
    x: 500,
    y: 300,
    ox: 40,
    oy: 20,
    w: 400,
    h: 220,
    frozen: false,
  };
  const canvas = box(100, 200, 1000, 800),
    slot = box(100, 200, 500, 220);

  test('a live drag follows the pointer', () => {
    expect(presetGhostBox(live, slot, canvas)).toEqual({
      left: 460,
      top: 280,
      width: 400,
    });
  });

  test('a frozen drag sits on its slot', () => {
    expect(presetGhostBox({ ...live, frozen: true }, slot, canvas)).toEqual({
      left: 100 + 500 * 0.62 - 12,
      top: 200 + 220 * 0.3 - 10,
      width: 500,
    });
  });

  test('a frozen drag that would be cancelled sits above the builder', () => {
    expect(
      presetGhostBox({ ...live, frozen: true, valid: false }, slot, canvas),
    ).toEqual({ left: 1100 - 500 * 0.35, top: 172, width: 500 });
  });

  test('a frozen drag waits for its slot', () => {
    expect(
      presetGhostBox({ ...live, frozen: true }, undefined, canvas),
    ).toBeNull();
  });
});
