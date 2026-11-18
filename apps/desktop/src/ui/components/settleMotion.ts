import { REDUCED_MOTION_QUERY } from '../motion';

const nextFrame = () => new Promise(requestAnimationFrame);

const finiteAnimations = (root: Document) =>
  root
    .getAnimations()
    .filter(
      (animation) => animation.effect?.getComputedTiming().endTime !== Infinity,
    );

/** Content that is still entering or leaving, which Motion.tsx marks until its animation completes. */
const moving = (root: Document) => !!root.querySelector('[data-motion]');

const SETTLE_LIMIT_MS = 5000;

/**
 * Resolves once every finite animation in the document has finished and nothing is still entering or leaving, for
 * story checks that read final colours or positions (the accessibility scan's contrast check reads a fading popup's
 * colours mid-fade). Spinners and other endless animations are skipped. Motion starts its animations on the next
 * frame and can start another when one ends, so this looks again each frame, up to a limit.
 */
export async function settleMotion(root: Document = document) {
  const limit = performance.now() + SETTLE_LIMIT_MS;
  await nextFrame();
  while (performance.now() < limit) {
    const finite = finiteAnimations(root);
    if (!finite.length && !moving(root)) return;
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
    await nextFrame();
  }
}

/**
 * Reports reduced motion to scripts, as the OS setting does, for a story's `beforeEach`; returns the cleanup. The
 * stylesheet's media query is covered in the browser tests.
 */
export function reduceMotion() {
  const original = window.matchMedia;
  window.matchMedia = (query: string) =>
    query === REDUCED_MOTION_QUERY
      ? ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        } as MediaQueryList)
      : original.call(window, query);
  return () => {
    window.matchMedia = original;
  };
}
