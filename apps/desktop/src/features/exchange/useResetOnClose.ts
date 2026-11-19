import { useState } from 'react';

/**
 * Calls `reset` during the render where `opened` turns false, so a dialog that stays mounted while closed opens
 * fresh next time. `reset` may only set state of the calling component.
 */
export function useResetOnClose(opened: boolean, reset: () => void) {
  const [seen, setSeen] = useState(opened);
  if (seen === opened) return;
  // Storing information from the previous render: React reruns this component before its children render.
  setSeen(opened);
  if (!opened) reset();
}
