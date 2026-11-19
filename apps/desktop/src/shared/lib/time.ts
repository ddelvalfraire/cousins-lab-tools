/**
 * Time of day on the wall clock, 24 h with seconds, for example `14:05:12`.
 * Uses the user's time zone unless `timeZone` (an IANA name such as `UTC`) is given.
 * Built from the formatter's parts, so no locale can add AM/PM or change the separator.
 * Not for durations: elapsed times have their own formatters.
 */
export function formatClockTime(
  when: Date | number | string,
  timeZone?: string,
): string {
  const format = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
  const part = Object.fromEntries(
    format
      .formatToParts(new Date(when))
      .map(({ type, value }) => [type, value]),
  );
  return `${part.hour}:${part.minute}:${part.second}`;
}
