import { REDUCED_MOTION_QUERY } from '../motion';

/**
 * Resolves once every finite animation in the document has finished, for story checks that read final colours or
 * positions (the accessibility scan's contrast check reads a fading popup's colours mid-fade). Spinners and other
 * endless animations are skipped.
 */
export async function settleMotion(root: Document = document) {
  const finite = root.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity);
  await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
}

/**
 * Reports reduced motion to scripts, as the OS setting does, for a story's `beforeEach`; returns the cleanup. The
 * stylesheet's media query is covered in the browser tests.
 */
export function reduceMotion() {
  const original = window.matchMedia;
  window.matchMedia = (query: string) => query === REDUCED_MOTION_QUERY
    ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList
    : original.call(window, query);
  return () => { window.matchMedia = original; };
}
