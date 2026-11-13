import { Collapse, Transition, type MantineTransition } from '@mantine/core';
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

const pop: MantineTransition = {
  in: { opacity: 1, transform: 'translateY(0) scale(1)' },
  out: { opacity: 0, transform: 'translateY(-4px) scale(.98)' },
  transitionProperty: 'opacity, transform',
};

/**
 * Animates something in and out. While it leaves it keeps its last content, is inert and hidden from assistive
 * technology, so it takes no focus or tab stop and is not read twice; once it has left it is unmounted.
 * Reduced motion (the theme's respectReducedMotion) makes every change instant.
 */
export function Presence({ show, variant = 'collapse', className, children }: PresenceProps) {
  // The children usually depend on the state that hides them (`error && …`), so the leaving copy is the last shown one.
  const last = useRef(children);
  if (show) last.current = children;
  const content = show ? children : last.current;
  if (variant === 'collapse') {
    return <Collapse expanded={show} keepMounted={false} transitionDuration={show ? motion.base : motion.fast} transitionTimingFunction={motion.easeOut} className={className}>{content}</Collapse>;
  }
  return <Transition mounted={show} transition={variant === 'pop' ? pop : 'fade'} duration={motion.base} exitDuration={motion.fast} timingFunction={motion.easeOut}>
    {styles => <div className={className} style={styles} inert={!show} aria-hidden={!show || undefined}>{content}</div>}
  </Transition>;
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
  const items = leaving && leaving.key !== swapKey ? [{ ...leaving, out: true }, { key: swapKey, node: children, out: false }] : [{ key: swapKey, node: children, out: false }];
  return <div className={className ? `dv-swap ${className}` : 'dv-swap'} style={style}>
    {items.map(item => item.out
      ? <div key={item.key} className="dv-swap-item" data-motion="leave" inert aria-hidden="true">{item.node}</div>
      : <div key={item.key} className="dv-swap-item" data-motion={entering === item.key ? 'enter' : undefined}>{item.node}</div>)}
  </div>;
}
