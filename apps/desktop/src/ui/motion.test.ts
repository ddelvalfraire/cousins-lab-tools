import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { motion, prefersReducedMotion } from './motion';

const css = readFileSync(
  new URL('./components/Approved.css', import.meta.url),
  'utf8',
);
const token = (name: string) =>
  css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
// 0.22 and .22 are the same number; formatters add the leading zero.
const sameNumbers = (value: string | undefined) =>
  value?.replace(/\d*\.?\d+/g, (number) => String(Number(number)));

describe('motion tokens', () => {
  test('the stylesheet declares the same durations and easings as motion.ts', () => {
    expect(token('dv-motion-fast')).toBe(`${motion.fast}ms`);
    expect(token('dv-motion-base')).toBe(`${motion.base}ms`);
    expect(token('dv-motion-slow')).toBe(`${motion.slow}ms`);
    expect(token('dv-motion-reveal')).toBe(`${motion.reveal}ms`);
    expect(sameNumbers(token('dv-ease-out'))).toBe(sameNumbers(motion.easeOut));
    expect(sameNumbers(token('dv-ease-in-out'))).toBe(
      sameNumbers(motion.easeInOut),
    );
  });

  test('state changes stay between 120 and 240 ms', () => {
    for (const duration of [motion.fast, motion.base, motion.slow]) {
      expect(duration).toBeGreaterThanOrEqual(120);
      expect(duration).toBeLessThanOrEqual(240);
    }
  });
});

describe('prefersReducedMotion', () => {
  const media = (matches: boolean) => ({
    matchMedia: (query: string) =>
      ({
        matches: matches && query === '(prefers-reduced-motion: reduce)',
      }) as MediaQueryList,
  });

  test('follows the OS setting', () => {
    expect(prefersReducedMotion(media(true))).toBe(true);
    expect(prefersReducedMotion(media(false))).toBe(false);
  });

  test('reports reduced motion where media queries are unavailable', () => {
    expect(prefersReducedMotion(undefined)).toBe(true);
    expect(prefersReducedMotion({} as Pick<Window, 'matchMedia'>)).toBe(true);
  });
});
