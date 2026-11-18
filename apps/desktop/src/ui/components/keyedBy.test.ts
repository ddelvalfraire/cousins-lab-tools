import { describe, expect, test } from 'vitest';
import { keyedBy } from './keyedBy';

const keys = (labels: string[]) =>
  keyedBy(labels, (label) => label).map(({ key }) => key);

describe('keyedBy', () => {
  test('keys each item by its label and keeps the item and its position', () => {
    expect(keyedBy(['Ctrl', 'K'], (label) => label.toLowerCase())).toEqual([
      { key: '1:ctrl', item: 'Ctrl', index: 0 },
      { key: '1:k', item: 'K', index: 1 },
    ]);
  });

  test('counts repeated labels so keys stay unique', () => {
    expect(keys(['G', 'G', 'H', 'G'])).toEqual(['1:G', '2:G', '1:H', '3:G']);
  });

  test('a label that looks like a counted key does not collide', () => {
    const result = keys(['A', 'A', '2:A', '1:2:A']);
    expect(new Set(result).size).toBe(result.length);
  });
});
