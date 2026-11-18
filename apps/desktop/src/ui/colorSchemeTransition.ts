import { motion, prefersReducedMotion } from './motion';

export interface RevealOrigin {
  x: number;
  y: number;
}

type RevealDocument = Pick<
  Document,
  'documentElement' | 'head' | 'createElement'
> & {
  startViewTransition?: (update: () => void) => ViewTransition;
};
type RevealWindow = Pick<
  Window,
  'matchMedia' | 'innerWidth' | 'innerHeight' | 'requestAnimationFrame'
>;

export interface SwitchOptions {
  /** Where the reveal starts, in viewport pixels. Without one (a system change) it starts at the top right corner. */
  origin?: RevealOrigin | null;
  doc?: RevealDocument;
  win?: RevealWindow;
}

/** The transition each document is running, so a new change can skip it instead of queueing behind it. */
const running = new WeakMap<object, ViewTransition>();

/**
 * Applies a colour scheme change with every CSS transition switched off, so colours change in one frame instead of
 * fading element by element. Transitions come back after two frames, once the new colours have been painted.
 */
function withoutTransitions(
  apply: () => void,
  doc: RevealDocument,
  win: RevealWindow,
) {
  const style = doc.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  doc.head.appendChild(style);
  try {
    apply();
  } finally {
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => style.remove()),
    );
  }
}

/** Radius of a circle centred on the origin that covers the whole viewport. */
function coverRadius({ x, y }: RevealOrigin, win: RevealWindow) {
  return Math.hypot(
    Math.max(x, win.innerWidth - x),
    Math.max(y, win.innerHeight - y),
  );
}

/**
 * Runs `apply` (which must update the DOM synchronously) as a circular reveal of the new colour scheme. Without the
 * View Transitions API (older WKWebView) or under reduced motion the change is instant.
 */
export function switchColorScheme(
  apply: () => void,
  { origin, doc = document, win = window }: SwitchOptions = {},
) {
  const root = doc.documentElement,
    previous = running.get(doc);
  if (
    prefersReducedMotion(win) ||
    typeof doc.startViewTransition !== 'function'
  ) {
    if (previous) {
      running.delete(doc);
      previous.skipTransition();
      delete root.dataset.dvThemeReveal;
    }
    withoutTransitions(apply, doc, win);
    return undefined;
  }
  previous?.skipTransition();
  root.dataset.dvThemeReveal = '';
  const transition = doc.startViewTransition(() =>
    withoutTransitions(apply, doc, win),
  );
  running.set(doc, transition);
  const at = origin ?? { x: win.innerWidth, y: 0 };
  // A skipped transition rejects `ready`, and one whose update throws rejects all three promises; nothing else awaits them.
  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${at.x}px ${at.y}px)`,
            `circle(${coverRadius(at, win)}px at ${at.x}px ${at.y}px)`,
          ],
        },
        {
          duration: motion.reveal,
          easing: motion.easeOut,
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => undefined);
  transition.finished
    .catch(() => undefined)
    .then(() => {
      if (running.get(doc) !== transition) return;
      running.delete(doc);
      delete root.dataset.dvThemeReveal;
    });
  transition.updateCallbackDone.catch(() => undefined);
  return transition;
}
