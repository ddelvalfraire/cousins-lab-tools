import { useState } from 'react';

/**
 * The value from the render where `key` last changed. Callers that rebuild equal arrays or objects on every render
 * can describe them with a string key, so memos and effects below only see a new value when the key changes.
 */
export function useKeyedValue<T>(key: string, value: T): T {
  const [kept, setKept] = useState({ key, value });
  if (kept.key === key) return kept.value;
  // Storing information from the previous render: React reruns this component before its children render.
  setKept({ key, value });
  return value;
}
