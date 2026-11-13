import { useReducedMotion } from '@mantine/hooks';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from '../motion';
import './Approved.css';

export interface PresenceProps {
  /** Shows the children. Changing it after the first render animates the change; the first render never animates. */
  show: boolean;
  /**
   * `collapse` animates height as well as opacity, for anything that pushes the content below it (messages, sections).
   * `fade` and `pop` only change opacity (and a small offset for `pop`), for things that sit over other content.
   */
  variant?: 'collapse' | 'fade' | 'pop';
  /** Class for the wrapper, which takes the children's place in the layout. */
  className?: string;
  children: ReactNode;
}

type Variant = NonNullable<PresenceProps['variant']>;

function frames(variant: Variant, entering: boolean, height: number): Keyframe[] {
  const shown: Keyframe = { opacity: 1 }, hidden: Keyframe = { opacity: 0 };
  if (variant === 'collapse') { shown.height = `${height}px`; hidden.height = '0px'; }
  if (variant === 'pop') { shown.transform = 'none'; hidden.transform = 'translateY(-4px) scale(.98)'; }
  return entering ? [hidden, shown] : [shown, hidden];
}

/**
 * Animates something in and out. Entering content is in the page, focusable and announced at once; it only fades
 * (and for `collapse` grows) into place. While it leaves it keeps its last content, is inert and hidden from
 * assistive technology, so it takes no focus or tab stop and is not read twice; once it has left it is unmounted.
 * Under reduced motion every change is instant.
 */
export function Presence({ show, variant = 'collapse', className, children }: PresenceProps) {
  const reduced = useReducedMotion(false, { getInitialValueInEffect: false });
  const [present, setPresent] = useState(show);
  if (show && !present) setPresent(true);
  // The children usually depend on the state that hides them (`error && …`), so the leaving copy is the last shown one.
  const last = useRef(children);
  if (show) last.current = children;
  const ref = useRef<HTMLDivElement>(null), animation = useRef<Animation | null>(null), mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const element = ref.current, running = animation.current;
    if (!element || reduced || typeof element.animate !== 'function') { running?.cancel(); if (!show) setPresent(false); return; }
    // Measured before the running animation is dropped, so a reversal starts where the last one had got to.
    const now = element.getBoundingClientRect().height, opacity = running ? Number(getComputedStyle(element).opacity) : show ? 0 : 1;
    running?.cancel();
    const full = element.scrollHeight;
    const keyframes = frames(variant, show, full);
    if (running) { keyframes[0].opacity = opacity; if (variant === 'collapse') keyframes[0].height = `${now}px`; }
    if (variant === 'collapse') element.style.overflow = 'hidden';
    const next = element.animate(keyframes, { duration: show ? motion.base : motion.fast, easing: motion.easeOut, fill: show ? 'none' : 'forwards' });
    animation.current = next;
    next.onfinish = () => {
      if (animation.current !== next) return;
      animation.current = null; element.style.overflow = '';
      if (!show) setPresent(false);
    };
  }, [show]);
  useEffect(() => () => animation.current?.cancel(), []);
  if (!present) return null;
  return <div ref={ref} className={className} data-presence={variant} data-motion={show ? undefined : 'leave'} inert={!show} aria-hidden={!show || undefined}>{show ? children : last.current}</div>;
}

export interface SwapProps {
  /** Identity of the content, for example the selected tab or data source. A new key fades the new content in. */
  swapKey: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Cross-fades content that is replaced in place (a tab's pane, a panel's data source). The new content takes the
 * layout at once and fades in; the old content stays on top only until its quick fade out ends, clipped to the new
 * content's box, inert and hidden from assistive technology, and keeps its own component state while it leaves.
 */
export function Swap({ swapKey, className, style, children }: SwapProps) {
  const reduced = useReducedMotion(false, { getInitialValueInEffect: false });
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [entering, setEntering] = useState<string | null>(null);
  const [current, setCurrent] = useState(swapKey);
  // The children of the last committed render: on a new key, that is the old content that fades out.
  const committed = useRef(children);
  useLayoutEffect(() => { committed.current = children; });
  if (current !== swapKey) {
    setCurrent(swapKey);
    if (!reduced) { setLeaving({ key: current, node: committed.current }); setEntering(swapKey); }
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), motion.fast);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(() => setEntering(null), motion.base);
    return () => window.clearTimeout(timer);
  }, [entering]);
  // The leaving copy comes last, so queries and the reading order meet the current content first.
  const items = leaving && leaving.key !== swapKey ? [{ key: swapKey, node: children, out: false }, { ...leaving, out: true }] : [{ key: swapKey, node: children, out: false }];
  return <div className={className ? `dv-swap ${className}` : 'dv-swap'} style={style}>
    {items.map(item => item.out
      ? <div key={item.key} className="dv-swap-item" data-motion="leave" inert aria-hidden="true">{item.node}</div>
      : <div key={item.key} className="dv-swap-item" data-motion={entering === item.key ? 'enter' : undefined}>{item.node}</div>)}
  </div>;
}
