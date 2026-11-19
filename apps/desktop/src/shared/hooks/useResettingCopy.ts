import { useState } from 'react';

/**
 * Local state that starts as `source` and goes back to it whenever `source` changes, for a value the owner can
 * replace but this component may also edit, such as story args or a search query from the window bar.
 */
export function useResettingCopy<T>(source: T) {
  const [value, setValue] = useState(source);
  const [seen, setSeen] = useState(source);
  if (seen !== source) {
    // Storing information from the previous render: React reruns this component before its children render.
    setSeen(source);
    setValue(source);
  }
  return [value, setValue] as const;
}
