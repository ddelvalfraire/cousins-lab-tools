import type { SelectProps } from '@mantine/core';

/**
 * Mantine's input writes its own aria-describedby and aria-invalid over the ones passed to Select, so a hint or error
 * kept outside the field goes through these props instead: `error` marks it invalid, `attributes` reaches the input.
 */
export function selectAria({
  describedBy,
  invalid,
}: {
  describedBy?: string;
  invalid?: boolean;
}): Pick<SelectProps, 'error' | 'attributes'> {
  return {
    error: invalid || undefined,
    attributes: describedBy
      ? { input: { 'aria-describedby': describedBy } }
      : undefined,
  };
}

/** Select reports `null` for a cleared value, which the theme rules out (no deselect, no clear button). */
export function chosen(onChange: (value: string) => void) {
  return (value: string | null) => {
    if (value !== null) onChange(value);
  };
}
