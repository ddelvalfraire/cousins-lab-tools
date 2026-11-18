import { describe, expect, test } from 'vitest';
import { followSource } from './useStateResetByProp';

describe('followSource', () => {
  test('keeps a local change while the prop stays the same', () => {
    const kept = { source: 'a', value: 'edited' };
    expect(followSource(kept, 'a')).toBe(kept);
  });

  test('starts over from the prop when it changes', () => {
    expect(followSource({ source: 'a', value: 'edited' }, 'b')).toEqual({
      source: 'b',
      value: 'b',
    });
  });

  test('a prop changing back to null still resets', () => {
    expect(followSource({ source: 'step-1', value: 'step-2' }, null)).toEqual({
      source: null,
      value: null,
    });
  });
});
