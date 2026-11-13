/**
 * Motion tokens. Approved.css declares the same values as CSS variables (--dv-motion-*, --dv-ease-*) for stylesheets;
 * motion.test.ts keeps the two in step. Components that animate in JavaScript (Mantine Transition and Collapse, the
 * theme reveal) read them from here.
 */
export const motion = {
  /** Leaving: a quick fade out, so the next thing is never waiting on it. */
  fast: 120,
  /** Entering: fades, inline messages, popups. */
  base: 180,
  /** Larger moves: sidebars, drawers, height changes. */
  slow: 240,
  /** The colour scheme reveal. Longer than the rest because it covers the whole window. */
  reveal: 420,
  easeOut: 'cubic-bezier(.22, 1, .36, 1)',
  easeInOut: 'cubic-bezier(.4, 0, .2, 1)',
} as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the OS asks for reduced motion. Outside a browser there is nothing to animate, so it reports true. */
export function prefersReducedMotion(win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window) {
  return !win?.matchMedia || win.matchMedia(REDUCED_MOTION_QUERY).matches;
}
