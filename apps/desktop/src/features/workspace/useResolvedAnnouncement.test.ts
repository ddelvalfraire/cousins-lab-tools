import { describe, expect, test } from 'vitest';
import type { Problem, ResolvedProblem } from './ProblemsPanel';
import { resolvedAnnouncement } from './useResolvedAnnouncement';

const problem = (id: string, done?: string): Problem => ({
  id,
  severity: 'error',
  title: `Problem ${id}`,
  when: 'Since 14:02:31',
  explanation: 'Something went wrong.',
  affects: [],
  actions: [{ id: 'fix', label: 'Fix', kind: 'fix', done }],
});
const resolvedAs = (
  id: string,
  how: ResolvedProblem['how'],
): ResolvedProblem => ({ id, title: `Problem ${id}`, how, at: '14:05:20' });

describe('resolvedAnnouncement', () => {
  test('announces nothing when no problem was resolved', () => {
    const resolved = [resolvedAs('a', 'fixed')];
    expect(
      resolvedAnnouncement({ problems: [problem('b')], resolved }, resolved),
    ).toBeNull();
    expect(
      resolvedAnnouncement({ problems: [problem('b')], resolved: [] }, []),
    ).toBeNull();
  });

  test('uses the fix action done sentence from before the problem left', () => {
    const before = {
      problems: [problem('a', 'MS-01 reconnected.')],
      resolved: [],
    };
    expect(resolvedAnnouncement(before, [resolvedAs('a', 'fixed')])).toBe(
      'MS-01 reconnected.',
    );
  });

  test('falls back to the title when the fix has no done sentence', () => {
    const before = { problems: [problem('a')], resolved: [] };
    expect(resolvedAnnouncement(before, [resolvedAs('a', 'fixed')])).toBe(
      'Problem a: fixed.',
    );
  });

  test('announces a dismissal', () => {
    const before = { problems: [problem('a', 'Done.')], resolved: [] };
    expect(resolvedAnnouncement(before, [resolvedAs('a', 'dismissed')])).toBe(
      'Notice dismissed.',
    );
  });

  test('announces the last of several newly resolved problems', () => {
    const earlier = resolvedAs('a', 'fixed');
    const before = {
      problems: [problem('b', 'B fixed.'), problem('c', 'C fixed.')],
      resolved: [earlier],
    };
    expect(
      resolvedAnnouncement(before, [
        earlier,
        resolvedAs('b', 'fixed'),
        resolvedAs('c', 'fixed'),
      ]),
    ).toBe('C fixed.');
  });
});
