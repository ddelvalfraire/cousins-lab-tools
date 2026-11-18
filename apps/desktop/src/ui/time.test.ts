import { afterEach, describe, expect, test } from 'vitest';
import { formatClockTime } from './time';

const zone = process.env.TZ;
afterEach(() => {
  process.env.TZ = zone;
});

describe('formatClockTime', () => {
  test('shows 24 h time with seconds in the given zone', () => {
    expect(formatClockTime('2026-03-05T14:05:12Z', 'UTC')).toBe('14:05:12');
    expect(formatClockTime('2026-03-05T14:05:12Z', 'America/Los_Angeles')).toBe(
      '06:05:12',
    );
    expect(formatClockTime('2026-03-05T14:05:12Z', 'Asia/Kolkata')).toBe(
      '19:35:12',
    );
  });

  test('midnight is 00:00:00 and noon is 12:00:00, never 24 or AM/PM', () => {
    expect(formatClockTime('2026-03-05T00:00:00Z', 'UTC')).toBe('00:00:00');
    expect(formatClockTime('2026-03-05T12:00:00Z', 'UTC')).toBe('12:00:00');
    expect(formatClockTime('2026-03-05T23:59:59Z', 'UTC')).toBe('23:59:59');
    expect(formatClockTime('2026-03-05T00:00:01Z', 'UTC')).toBe('00:00:01');
  });

  test('without a zone, uses the time zone the app runs in', () => {
    process.env.TZ = 'Asia/Kolkata';
    expect(formatClockTime('2026-03-05T18:30:00Z')).toBe('00:00:00');
    process.env.TZ = 'America/Los_Angeles';
    expect(formatClockTime('2026-03-05T20:00:00Z')).toBe('12:00:00');
    // Across a daylight saving change the offset follows the instant.
    expect(formatClockTime('2026-03-08T09:59:59Z')).toBe('01:59:59');
    expect(formatClockTime('2026-03-08T10:00:00Z')).toBe('03:00:00');
  });

  test('accepts a Date, epoch milliseconds or an ISO string for the same instant', () => {
    const iso = '2026-11-12T07:08:09Z';
    expect(formatClockTime(new Date(iso), 'UTC')).toBe('07:08:09');
    expect(formatClockTime(Date.parse(iso), 'UTC')).toBe('07:08:09');
  });
});
