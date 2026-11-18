import { useCallback, useEffectEvent } from 'react';

/**
 * A ref callback that listens for keydown on the whole document while its element is mounted, so keys pressed with
 * nothing focused reach the handler too. The listener always calls the latest `onKey`.
 */
export function useDocumentKeydown(onKey: (event: KeyboardEvent) => void) {
  const handle = useEffectEvent(onKey);
  return useCallback((node: Element | null) => {
    if (!node) return;
    const listener = (event: KeyboardEvent) => handle(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}
