import type { ReactNode } from 'react';
import './Approved.css';

export type ChipTone = 'neutral' | 'accent' | 'warning';
export type StatusTone = 'neutral' | 'accent' | 'warning' | 'error' | 'info';

/** Small labelled state with an icon, as used by the approved catalogs (revision, source, counts). */
export function Chip({
  icon,
  children,
  tone = 'neutral',
  title,
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: ChipTone;
  title?: string;
}) {
  // A plain-text label is its own tooltip, so text cut by a narrow column can still be read.
  return (
    <span
      className="dv-chip"
      data-tone={tone}
      title={title ?? (typeof children === 'string' ? children : undefined)}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}

/** Icon plus word for a state. Colour supports the word; it never carries the meaning alone. */
export function StatusWord({
  icon,
  children,
  tone = 'neutral',
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className="dv-status-word" data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}
