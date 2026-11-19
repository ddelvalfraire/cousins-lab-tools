import { ScrollArea } from '@mantine/core';
import type { ElementType, HTMLAttributes, Ref } from 'react';
import '@/shared/theme/Approved.css';

export interface ScrollFrameProps extends HTMLAttributes<HTMLElement> {
  /** Axes that scroll. */
  axes?: 'x' | 'y' | 'xy';
  /** `hover` shows the bar while the pointer is over the frame, `scroll` only while it scrolls. */
  show?: 'hover' | 'scroll';
  /** Class for the outer box, which takes the frame's place in the layout (flex or grid sizing). */
  rootClassName?: string;
  /** Class for the box inside the scroller that holds the children, when they need a flex or grid parent. */
  contentClassName?: string;
  /** Stops a scroll that reaches the end from scrolling the page behind. */
  overscroll?: 'contain';
  /** Element for the scroller, for example `main`. */
  component?: ElementType;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A scroll container with an overlay scroll bar that shows only on hover or while scrolling, so it never takes width
 * and never moves the content. Every other prop (class, role, label, tabIndex, handlers) goes to the scrolling
 * element itself, so focus, keyboard scrolling, sticky headers and scroll positions work as on a plain overflow box.
 */
export function ScrollFrame({
  axes = 'xy',
  show = 'hover',
  className,
  rootClassName,
  contentClassName,
  overscroll,
  component,
  hidden,
  ref,
  children,
  ...scroller
}: ScrollFrameProps) {
  // The viewport's class must go through classNames; Mantine replaces a className given in viewportProps.
  return (
    <ScrollArea
      type={show}
      scrollbars={axes}
      overscrollBehavior={overscroll}
      hidden={hidden}
      viewportRef={ref}
      className={rootClassName ? `dv-scroll ${rootClassName}` : 'dv-scroll'}
      classNames={{ viewport: className, content: contentClassName }}
      viewportProps={
        {
          ...scroller,
          ...(component ? { component } : {}),
        } as HTMLAttributes<HTMLDivElement>
      }
    >
      {children}
    </ScrollArea>
  );
}
