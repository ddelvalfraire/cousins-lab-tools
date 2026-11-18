import { motion, prefersReducedMotion } from '../motion';

/** How long a search target stays highlighted before it fades. */
export const REVEAL_MS = 1600;
/** Room left above a target scrolled to the top of the page. */
const SCROLL_MARGIN = 24;
const CONTROLS =
  'input:checked, input:not([type=radio]):not([type=hidden]), select, textarea, button, a[href]';
/** Anything the user does here ends the highlight early: typing, clicking, tapping or scrolling. */
const DISMISS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;

/** The element marked data-search-focus, else the box's first enabled control, else the box itself. */
function focusable(box: HTMLElement) {
  const marked = box.querySelector<HTMLElement>('[data-search-focus]');
  if (marked) return marked;
  return (
    [...box.querySelectorAll<HTMLElement>(CONTROLS)].find(
      (control) => !control.matches(':disabled') && !control.closest('[inert]'),
    ) ?? box
  );
}

/**
 * Brings a place on the page into view for a search result: scrolls the page's own scroller (not the window) so the
 * box is in view, moves focus into it and highlights it. The highlight fades in and out with the motion tokens; under
 * reduced motion the scroll is instant and the highlight is static. Returns a function that removes it at once.
 */
export function revealTarget(viewport: HTMLElement, box: HTMLElement) {
  const reduced = prefersReducedMotion();
  const target = focusable(box);
  // A heading is focusable only while it has focus, so Tab carries on from it and it never becomes a tab stop.
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
    target.tabIndex = -1;
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), {
      once: true,
    });
  }
  target.focus({ preventScroll: true });

  const view = viewport.getBoundingClientRect(),
    rect = box.getBoundingClientRect();
  if (rect.top < view.top || rect.bottom > view.bottom) {
    viewport.scrollTo({
      top: Math.max(
        0,
        viewport.scrollTop + rect.top - view.top - SCROLL_MARGIN,
      ),
      behavior: reduced ? 'instant' : 'smooth',
    });
  }

  let timer = 0;
  const stopListening = () =>
    DISMISS.forEach((type) => document.removeEventListener(type, leave, true));
  const clear = () => {
    window.clearTimeout(timer);
    stopListening();
    delete box.dataset.searchReveal;
  };
  function leave() {
    stopListening();
    window.clearTimeout(timer);
    if (reduced || !box.isConnected) {
      clear();
      return;
    }
    box.dataset.searchReveal = 'leave';
    timer = window.setTimeout(clear, motion.fast);
  }
  box.dataset.searchReveal = reduced ? 'static' : 'pulse';
  timer = window.setTimeout(leave, REVEAL_MS);
  DISMISS.forEach((type) =>
    document.addEventListener(type, leave, { capture: true, passive: true }),
  );
  return clear;
}
