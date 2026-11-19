import { useReducedMotion } from '@mantine/hooks';
import {
  AnimatePresence,
  motion as animated,
  type TargetAndTransition,
  type Transition,
  useIsPresent,
} from 'motion/react';
import {
  Children,
  type CSSProperties,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { curves, motion } from '../motion';
import './Approved.css';

const seconds = (milliseconds: number) => milliseconds / 1000;

const entering: Transition = {
  duration: seconds(motion.base),
  ease: curves.easeOut,
};
const leaving: Transition = {
  duration: seconds(motion.fast),
  ease: curves.easeOut,
};

/**
 * MotionConfig's reducedMotion="user" only stops transform and layout animations; opacity and height still animate. Under
 * reduced motion the wrappers render plain elements instead, because AnimatePresence keeps a leaving child mounted until
 * its exit finishes, even a zero-length one, so the old and new content would both be on the page for a frame.
 */
function useInstant() {
  return useReducedMotion(false, { getInitialValueInEffect: false });
}

/** Leaving content stays on screen while it fades, but takes no focus or tab stop and is not read twice. */
function leavingProps(present: boolean) {
  return {
    inert: !present,
    'aria-hidden': present ? undefined : true,
  };
}

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

const presenceStates: Record<
  Variant,
  { hidden: TargetAndTransition; shown: TargetAndTransition }
> = {
  collapse: {
    hidden: { opacity: 0, height: 0, overflow: 'hidden' },
    shown: { opacity: 1, height: 'auto', transitionEnd: { overflow: '' } },
  },
  fade: { hidden: { opacity: 0 }, shown: { opacity: 1 } },
  pop: {
    hidden: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
    shown: { opacity: 1, transform: 'none' },
  },
};

/**
 * Animates something in and out. Entering content is in the page, focusable and announced at once; it only fades
 * (and for `collapse` grows) into place. While it leaves it keeps its last content, is inert and hidden from
 * assistive technology, so it takes no focus or tab stop and is not read twice; once it has left it is unmounted.
 * Under reduced motion every change is instant.
 */
export function Presence({
  show,
  variant = 'collapse',
  className,
  children,
}: PresenceProps) {
  const instant = useInstant();
  if (instant) {
    if (!show) return null;
    return (
      <div className={className} data-presence={variant}>
        {children}
      </div>
    );
  }
  return (
    <AnimatePresence initial={false}>
      {show && (
        <PresenceContent key="content" variant={variant} className={className}>
          {children}
        </PresenceContent>
      )}
    </AnimatePresence>
  );
}

function PresenceContent({
  variant,
  className,
  children,
}: {
  variant: Variant;
  className?: string;
  children: ReactNode;
}) {
  const present = useIsPresent();
  const { hidden, shown } = presenceStates[variant];
  return (
    <animated.div
      className={className}
      data-presence={variant}
      data-motion={present ? undefined : 'leave'}
      {...leavingProps(present)}
      initial={hidden}
      animate={shown}
      exit={{ ...hidden, transition: leaving }}
      transition={entering}
    >
      {children}
    </animated.div>
  );
}

export interface SwapProps {
  /** Let the outgoing copy finish before fading in text that would otherwise overlap. */
  sequential?: boolean;
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
export function Swap({
  swapKey,
  className,
  style,
  children,
  sequential = false,
}: SwapProps) {
  const instant = useInstant();
  const classes = ['dv-swap', sequential && 'dv-swap-sequential', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} style={style}>
      {instant ? (
        <div key={swapKey} className="dv-swap-item">
          {children}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <SwapItem key={swapKey} sequential={sequential}>
            {children}
          </SwapItem>
        </AnimatePresence>
      )}
    </div>
  );
}

function SwapItem({
  sequential,
  children,
}: {
  sequential: boolean;
  children: ReactNode;
}) {
  const present = useIsPresent();
  return (
    <animated.div
      className="dv-swap-item"
      data-motion={present ? undefined : 'leave'}
      {...leavingProps(present)}
      initial={{ opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'none' }}
      exit={{
        opacity: 0,
        transition: { duration: seconds(motion.fast), ease: curves.easeInOut },
      }}
      transition={{ ...entering, delay: sequential ? seconds(motion.fast) : 0 }}
    >
      {children}
    </animated.div>
  );
}

type ListChild = ReactElement<Record<string, unknown>, ElementType>;

/**
 * Keyed children retain their own geometry during a fade, including table rows. Each child is a DOM element, which
 * fades through motion's own component for its tag, or a component made with `animated.create` at module scope.
 */
export function MotionList({
  children,
  resetKey = '',
}: {
  children: ReactNode;
  resetKey?: string | number;
}) {
  const instant = useInstant();
  const nodes = Children.toArray(children) as ListChild[];
  if (instant) return nodes;
  // A new resetKey (another page of rows) replaces the whole list at once instead of fading every row.
  return (
    <AnimatePresence key={resetKey} initial={false}>
      {nodes.map((node) => (
        <MotionListItem key={node.key} node={node} />
      ))}
    </AnimatePresence>
  );
}

const animatedType = (type: ElementType): ElementType =>
  typeof type === 'string'
    ? (animated[type as keyof typeof animated] as ElementType)
    : type;

function MotionListItem({ node }: { node: ListChild }) {
  const present = useIsPresent();
  const Animated = animatedType(node.type);
  return (
    <Animated
      {...node.props}
      data-motion={present ? undefined : 'leave'}
      {...leavingProps(present)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: leaving }}
      transition={entering}
    />
  );
}
