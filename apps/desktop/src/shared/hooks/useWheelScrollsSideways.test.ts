import { describe, expect, test } from 'vitest';
import { sidewaysScrollLeft } from './useWheelScrollsSideways';

const row = { scrollLeft: 100, scrollWidth: 600, clientWidth: 200 };
const wheel = (deltaY: number, deltaX = 0, deltaMode = 0) => ({
  deltaX,
  deltaY,
  deltaMode,
});

describe('sidewaysScrollLeft', () => {
  test('moves the row by pixel deltas', () => {
    expect(sidewaysScrollLeft(wheel(40), row)).toBe(140);
    expect(sidewaysScrollLeft(wheel(-40), row)).toBe(60);
  });

  test('counts line deltas as 16 px and page deltas as the visible width', () => {
    expect(sidewaysScrollLeft(wheel(2, 0, 1), row)).toBe(132);
    expect(sidewaysScrollLeft(wheel(1, 0, 2), row)).toBe(300);
  });

  test('stops at either end', () => {
    expect(sidewaysScrollLeft(wheel(1000), row)).toBe(400);
    expect(sidewaysScrollLeft(wheel(-1000), row)).toBe(0);
  });

  test('leaves the wheel alone when it would not move the row', () => {
    expect(sidewaysScrollLeft(wheel(10, 20), row), 'mostly sideways').toBe(
      null,
    );
    expect(
      sidewaysScrollLeft(wheel(40), { ...row, scrollLeft: 400 }),
      'already at the end',
    ).toBe(null);
    expect(
      sidewaysScrollLeft(wheel(40), { ...row, scrollWidth: 200 }),
      'nothing to scroll',
    ).toBe(null);
  });
});
