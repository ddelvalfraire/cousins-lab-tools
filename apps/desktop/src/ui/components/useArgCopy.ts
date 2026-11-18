import { useState } from 'react';

/**
 * A story host's own copy of an arg: the story can change it, as an app would, and a new value from the Controls
 * panel replaces it.
 */
export function useArgCopy<T>(arg: T) {
  const [value, setValue] = useState(arg),
    [seen, setSeen] = useState(arg);
  if (seen !== arg) {
    // Storing information from the previous render: React reruns this component before its children render.
    setSeen(arg);
    setValue(arg);
  }
  return [value, setValue] as const;
}
