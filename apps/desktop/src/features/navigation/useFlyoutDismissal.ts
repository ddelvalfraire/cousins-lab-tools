import { useClickOutside, useMergedRef, useWindowEvent } from '@mantine/hooks';
import { type RefObject, useCallback } from 'react';

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
  useWindowEvent('keydown', (event) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
    trigger.current?.focus();
  });
  const outsideRef = useClickOutside<HTMLElement>(
    (event) => {
      if (!trigger.current?.contains(event.target as Node)) onClose();
    },
    ['click'],
    undefined,
    open,
  );
  const focusFirstButton = useCallback(
    (flyout: HTMLElement | null) => {
      if (flyout && open) flyout.querySelector('button')?.focus();
    },
    [open],
  );
  return useMergedRef(outsideRef, focusFirstButton);
}
