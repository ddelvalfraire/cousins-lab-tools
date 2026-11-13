import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { isTextSize, readTextSize, TEXT_SIZE_ATTRIBUTE, TEXT_SIZE_KEY, textScales, writeTextSize, type TextSize } from './textSize';

const css = readFileSync(new URL('./components/Approved.css', import.meta.url), 'utf8');
const rootRule = (size: TextSize) => css.match(new RegExp(`html\\[${TEXT_SIZE_ATTRIBUTE}='${size}'\\]\\s*\\{\\s*font-size:\\s*([\\d.]+)%`))?.[1];
const memory = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, items };
};

describe('text size steps', () => {
  test('the stylesheet sets the root to the same scale as textSize.ts, and Default leaves it alone', () => {
    expect(rootRule('default')).toBeUndefined();
    for (const size of ['large', 'larger', 'largest'] as const) expect(Number(rootRule(size)) / 100, size).toBe(textScales[size]);
  });

  test('every step makes a 16 px root a whole number of px', () => {
    for (const scale of Object.values(textScales)) expect(Number.isInteger(16 * scale)).toBe(true);
  });
});

describe('saving the text size', () => {
  test('reads back what was written', () => {
    const storage = memory();
    writeTextSize('larger', storage);
    expect(storage.items.get(TEXT_SIZE_KEY)).toBe('larger');
    expect(readTextSize(storage)).toBe('larger');
  });

  test('falls back to Default for nothing saved, an unknown value or storage that throws', () => {
    expect(readTextSize(memory())).toBe('default');
    expect(readTextSize(memory({ [TEXT_SIZE_KEY]: 'huge' }))).toBe('default');
    expect(readTextSize({ getItem: () => { throw new Error('denied'); } })).toBe('default');
    expect(() => writeTextSize('large', { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });

  test('accepts only the four steps', () => {
    for (const value of ['default', 'large', 'larger', 'largest']) expect(isTextSize(value)).toBe(true);
    for (const value of ['', 'Large', 'toString', null, 1.25]) expect(isTextSize(value)).toBe(false);
  });
});
