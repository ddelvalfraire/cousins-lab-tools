/**
 * Resolves once every finite animation in the document has finished, for story checks that read final colours or
 * positions (the accessibility scan's contrast check reads a fading popup's colours mid-fade). Spinners and other
 * endless animations are skipped.
 */
export async function settleMotion(root: Document = document) {
  const finite = root.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity);
  await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
}
