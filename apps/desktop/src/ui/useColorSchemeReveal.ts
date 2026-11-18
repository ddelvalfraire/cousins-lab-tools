import { useDidUpdate } from '@mantine/hooks';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type RevealOrigin, switchColorScheme } from './colorSchemeTransition';

type ColorScheme = 'light' | 'dark';

/**
 * The colour scheme on screen, which follows `target` through one reveal (colorSchemeTransition.ts) however the target
 * changed: a control, a parent's prop, another window or the system. The scheme on screen is also written to the root
 * element as data-mantine-color-scheme, inside the reveal, so the browser captures the new colours.
 *
 * `revealFrom` records where the reveal of the next change to a scheme should start.
 */
export function useColorSchemeReveal(target: ColorScheme) {
  const [applied, setApplied] = useState(target);
  const latestTarget = useRef(target);
  latestTarget.current = target;
  const pending = useRef<{
    target: ColorScheme;
    origin: RevealOrigin | null;
  } | null>(null);
  const inEffect = useRef(false);

  // The target can change through a controlled prop, which no handler here sees, so the reveal follows the value.
  useDidUpdate(() => {
    if (target === applied) return;
    const origin =
      pending.current?.target === target ? pending.current.origin : null;
    pending.current = null;
    // On the instant path apply runs inside this effect, where flushSync is not allowed; the browser calls it later.
    const apply = () => {
      const next = latestTarget.current;
      document.documentElement.setAttribute('data-mantine-color-scheme', next);
      if (inEffect.current) setApplied(next);
      else flushSync(() => setApplied(next));
    };
    inEffect.current = true;
    try {
      switchColorScheme(apply, { origin });
    } finally {
      inEffect.current = false;
    }
  }, [target, applied]);

  const revealFrom = useCallback(
    (next: ColorScheme, origin: RevealOrigin | null) => {
      pending.current = { target: next, origin };
    },
    [],
  );
  return { applied, revealFrom };
}
