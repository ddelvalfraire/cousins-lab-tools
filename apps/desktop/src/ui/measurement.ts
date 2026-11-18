/** Presentation only. Never round a small nonzero signal into a displayed zero. */
export function formatMeasurement(
  value: number | null,
  digits = 3,
  locale = 'en-US',
): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    notation:
      magnitude !== 0 && (magnitude < 10 ** -digits || magnitude >= 100_000)
        ? 'scientific'
        : 'standard',
  }).format(value);
}

/** Decimal comma and scientific notation; ambiguous grouping is intentionally rejected. */
export function parseQuantityDraft(text: string): number | null {
  const normalized = text.trim().replace('−', '-').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized))
    return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
