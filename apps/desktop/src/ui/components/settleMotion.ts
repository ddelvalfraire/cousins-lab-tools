import { REDUCED_MOTION_QUERY } from '../motion';

const nextFrame = () => new Promise(requestAnimationFrame);

// Paused animations never finish (the test runner pauses CSS animations before its accessibility scan), so only
// running ones are waited for.
const runningAnimations = (root: Document) =>
  root
    .getAnimations()
    .filter(
      (animation) =>
        animation.playState === 'running' &&
        animation.effect?.getComputedTiming().endTime !== Infinity,
    );

const allFinished = (animations: Animation[]) =>
  Promise.all(
    animations.map((animation) => animation.finished.catch(() => undefined)),
  );

const timeLeft = (deadline: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, deadline - performance.now())),
  );

/** Content that is still entering or leaving, which Motion.tsx marks until its animation completes. */
const moving = (root: Document) =>
  !!root.querySelector('[data-motion="enter"], [data-motion="leave"]');

const SETTLE_LIMIT_MS = 5000;

/**
 * Resolves once every running finite animation in the document has finished and nothing is still entering or leaving, for
 * story checks that read final colours or positions (the accessibility scan's contrast check reads a fading popup's
 * colours mid-fade). Spinners and other endless animations are skipped. Motion starts its animations on the next
 * frame and can start another when one ends, so this looks again each frame, up to a limit.
 */
export async function settleMotion(root: Document = document) {
  const deadline = performance.now() + SETTLE_LIMIT_MS;
  await nextFrame();
  while (performance.now() < deadline) {
    const running = runningAnimations(root);
    if (!running.length && !moving(root)) return;
    await Promise.race([allFinished(running), timeLeft(deadline)]);
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
