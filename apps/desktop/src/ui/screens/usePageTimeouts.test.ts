import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTimeoutSet } from './usePageTimeouts';

describe('createTimeoutSet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs each timeout after its delay', () => {
    const timeouts = createTimeoutSet();
    const first = vi.fn(),
      second = vi.fn();
    timeouts.add(first, 600);
    timeouts.add(second, 900);
    vi.advanceTimersByTime(600);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('clearAll cancels every pending timeout', () => {
    const timeouts = createTimeoutSet();
    const fn = vi.fn();
    timeouts.add(fn, 600);
    timeouts.add(fn, 900);
    timeouts.clearAll();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('a timeout that already ran is not cleared again', () => {
    const timeouts = createTimeoutSet();
    const ran = vi.fn(),
      waiting = vi.fn();
    timeouts.add(ran, 100);
    vi.advanceTimersByTime(100);
    timeouts.add(waiting, 500);
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    timeouts.clearAll();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(waiting).not.toHaveBeenCalled();
  });
});
