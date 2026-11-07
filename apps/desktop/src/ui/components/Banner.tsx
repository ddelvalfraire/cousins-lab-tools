import type { ReactNode } from 'react';
import './Approved.css';
import './Banner.css';

export type BannerSeverity = 'info' | 'warning' | 'error' | 'success';

/** The approved review icons: circled i, triangle, circled ×, circled tick. */
const PATHS: Record<BannerSeverity, string> = {
  info: 'M12 11v5m0-9v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  warning: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  error: 'm9 9 6 6m0-6-6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  success: 'm8 12.5 2.5 2.5L16 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};

/**
 * Approved message banner: icon, then the text with any fix inline after it.
 * One message reads as a sentence; pass two or more as `messages` for a list.
 */
export function Banner({ severity = 'info', messages, children, action, announce = false, className }: {
  severity?: BannerSeverity;
  /** Two or more related messages render as a list; one renders as plain text. */
  messages?: readonly string[];
  children?: ReactNode;
  /** A one-click fix, shown inline after the text. */
  action?: ReactNode;
  /** Polite status instead of an alert, for outcomes the person just caused. */
  announce?: boolean;
  /** Extra class names for scoped styling. */
  className?: string;
}) {
  const list = messages && messages.length > 1;
  return <div className={className ? `dv-banner-approved ${className}` : 'dv-banner-approved'} data-severity={severity} role={announce ? 'status' : 'alert'}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[severity]} /></svg>
    <div>
      {list ? <ul>{messages.map(text => <li key={text}>{text}</li>)}</ul> : messages?.[0]}
      {children}
      {action && <> {action}</>}
    </div>
  </div>;
}
