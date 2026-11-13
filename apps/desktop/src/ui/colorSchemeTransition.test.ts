import { describe, expect, test, vi } from 'vitest';
import { switchColorScheme } from './colorSchemeTransition';
import { motion } from './motion';

/** A view transition whose update callback the test runs, as the browser would once it has captured the old view. */
function fakeTransition(update: () => void) {
  let ready!: () => void, finish!: () => void;
  const transition = {
    update,
    ready: new Promise<void>(resolve => { ready = resolve; }),
    finished: new Promise<void>(resolve => { finish = resolve; }),
    updateCallbackDone: Promise.resolve(),
    skipTransition: vi.fn(),
    types: new Set<string>(),
  };
  return { transition, ready, finish };
}

function fakePage({ viewTransitions = true, reducedMotion = false } = {}) {
  const styles: { textContent: string; remove: () => void }[] = [];
  const transitions: ReturnType<typeof fakeTransition>[] = [];
  const frames: FrameRequestCallback[] = [];
  const root = { dataset: {} as DOMStringMap, animate: vi.fn() };
  const doc = {
    documentElement: root,
    head: { appendChild: (style: (typeof styles)[number]) => { styles.push(style); } },
    createElement: () => { const style = { textContent: '', remove: () => { styles.splice(styles.indexOf(style), 1); } }; return style; },
    ...(viewTransitions ? { startViewTransition: vi.fn((update: () => void) => { const t = fakeTransition(update); transitions.push(t); return t.transition; }) } : {}),
  };
  const win = {
    innerWidth: 800, innerHeight: 600,
    matchMedia: (query: string) => ({ matches: reducedMotion && query.includes('reduce') }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; },
  };
  const runFrames = () => { while (frames.length) frames.shift()!(0); };
  const options = { doc: doc as unknown as Document, win: win as unknown as Window };
  return { doc, root, win, styles, transitions, runFrames, options };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('switchColorScheme', () => {
  test('starts one view transition whose update applies the change once, with transitions held off', () => {
    const page = fakePage(), apply = vi.fn(() => expect(page.styles).toHaveLength(1));
    switchColorScheme(apply, page.options);
    expect(page.doc.startViewTransition).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    page.transitions[0].transition.update();
    expect(apply).toHaveBeenCalledTimes(1);
    page.runFrames();
    expect(page.styles, 'the transition-blocking style is removed').toHaveLength(0);
  });

  test('applies at once without the View Transitions API', () => {
    const page = fakePage({ viewTransitions: false }), apply = vi.fn();
    expect(switchColorScheme(apply, page.options)).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(page.root.animate).not.toHaveBeenCalled();
    expect(page.root.dataset.dvThemeReveal).toBeUndefined();
  });

  test('applies at once under reduced motion and skips any running reveal', () => {
    const page = fakePage(), apply = vi.fn();
    switchColorScheme(vi.fn(), page.options);
    page.win.matchMedia = query => ({ matches: query.includes('reduce') });
    switchColorScheme(apply, page.options);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(page.doc.startViewTransition).toHaveBeenCalledTimes(1);
    expect(page.transitions[0].transition.skipTransition).toHaveBeenCalledTimes(1);
    expect(page.root.dataset.dvThemeReveal).toBeUndefined();
  });

  test('reduced motion never starts a view transition', () => {
    const page = fakePage({ reducedMotion: true }), apply = vi.fn();
    switchColorScheme(apply, page.options);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(page.doc.startViewTransition).not.toHaveBeenCalled();
  });

  test('a second change skips the running reveal instead of queueing behind it', async () => {
    const page = fakePage();
    switchColorScheme(vi.fn(), page.options);
    switchColorScheme(vi.fn(), page.options);
    const [first, second] = page.transitions;
    expect(first.transition.skipTransition).toHaveBeenCalledTimes(1);
    expect(second.transition.skipTransition).not.toHaveBeenCalled();
    first.finish(); await flush();
    expect(page.root.dataset.dvThemeReveal, 'the skipped reveal leaves the running one marked').toBe('');
    second.finish(); await flush();
    expect(page.root.dataset.dvThemeReveal).toBeUndefined();
  });

  test('the reveal grows from the origin to the farthest corner', async () => {
    const page = fakePage();
    switchColorScheme(vi.fn(), { ...page.options, origin: { x: 200, y: 100 } });
    page.transitions[0].ready(); await flush();
    const radius = Math.hypot(600, 500);
    expect(page.root.animate).toHaveBeenCalledWith(
      { clipPath: ['circle(0px at 200px 100px)', `circle(${radius}px at 200px 100px)`] },
      { duration: motion.reveal, easing: motion.easeOut, pseudoElement: '::view-transition-new(root)' },
    );
  });

  test('without an origin the reveal starts at the top right corner', async () => {
    const page = fakePage();
    switchColorScheme(vi.fn(), page.options);
    page.transitions[0].ready(); await flush();
    expect(page.root.animate.mock.calls[0][0]).toEqual({ clipPath: ['circle(0px at 800px 0px)', `circle(${Math.hypot(800, 600)}px at 800px 0px)`] });
  });

  test('a skipped reveal that rejects ready is not reported as an error', async () => {
    const page = fakePage(), unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    page.doc.startViewTransition = vi.fn((update: () => void) => ({ ...fakeTransition(update).transition, ready: Promise.reject(new Error('skipped')) }));
    switchColorScheme(vi.fn(), page.options);
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(page.root.animate).not.toHaveBeenCalled();
  });
});
