import { useState } from 'react';

/** A string, or a list compared item by item with Object.is, like a hook's dependency list. */
export type ValueKey = string | readonly unknown[];

const sameKey = (a: ValueKey, b: ValueKey) =>
  typeof a === 'string' || typeof b === 'string'
    ? a === b
    : a.length === b.length && a.every((item, i) => Object.is(item, b[i]));

/**
 * The value from the render where `key` last changed. Callers that rebuild equal arrays or objects on every render
 * can describe them with a key, so memos and ref callbacks below only see a new value when the key changes.
 */
export function useKeyedValue<T>(key: ValueKey, value: T): T {
  const [kept, setKept] = useState({ key, value });
  if (sameKey(kept.key, key)) return kept.value;
  // Storing information from the previous render: React reruns this component before its children render.
  setKept({ key, value });
  return value;
}
