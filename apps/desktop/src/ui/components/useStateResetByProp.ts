import { useCallback, useState } from 'react';

export interface PropSeededValue<T> {
  source: T;
  value: T;
}

/** The kept value for this render: the prop again when it changed, otherwise the local value. */
export function followSource<T>(
  kept: PropSeededValue<T>,
  source: T,
): PropSeededValue<T> {
  return Object.is(kept.source, source) ? kept : { source, value: source };
}

/**
 * Local state that starts from a prop and starts over whenever the prop changes, so the parent can reset it
 * while the component changes it in between.
 */
export function useStateResetByProp<T>(source: T) {
  const [kept, setKept] = useState<PropSeededValue<T>>({
    source,
    value: source,
  });
  const current = followSource(kept, source);
  // Storing information from the previous render: React reruns this component before its children render.
  if (current !== kept) setKept(current);
  const setValue = useCallback(
    (value: T) => setKept((previous) => ({ ...previous, value })),
    [],
  );
  return [current.value, setValue] as const;
}
