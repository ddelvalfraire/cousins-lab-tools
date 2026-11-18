import { type RefObject, useCallback, useEffectEvent } from 'react';

/**
 * A ref callback for a flyout opened from a trigger. While `open`, it moves focus to the flyout's first button and
 * closes on Escape, returning focus to the trigger, or on a click outside both the flyout and the trigger.
 * A flyout that animates out stays mounted, so `open` rather than mounting decides when it listens.
 */
export function useFlyoutDismissal({
  open,
  trigger,
  onClose,
}: {
  open: boolean;
  trigger: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const close = useEffectEvent(onClose);
  return useCallback(
    (flyout: HTMLElement | null) => {
      if (!flyout || !open) return;
      flyout.querySelector('button')?.focus();
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close();
        trigger.current?.focus();
      };
      const onClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!flyout.contains(target) && !trigger.current?.contains(target))
          close();
      };
      document.addEventListener('keydown', onKey);
      document.addEventListener('click', onClick);
      return () => {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('click', onClick);
      };
    },
    [open, trigger],
  );
}
