import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import './Approved.css';
import './Inspectors.css';
import { ScrollFrame } from './ScrollFrame';

/**
 * Shared pieces for the calibration checklist, alignment, saved-result and panel-source inspectors.
 * Glyphs and values come from the approved mockups in design/dvdash-field-review
 * (calibration-checklist-, alignment-inspector-, saved-result-inspector- and source-binding-review.html).
 */
const paths = {
  check: 'm5 12 4 4L19 6',
  circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  signal: 'M3 12h3l3-7 6 14 3-7h3',
  info: 'M12 11v5m0-9v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  warning: 'm12 3 10 18H2L12 3m0 6v4m0 4v.01',
  error: 'm9 9 6 6m0-6-6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  lock: 'M6 11h12v10H6V11m3 0V7a3 3 0 0 1 6 0v4',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V3h6v4',
  loader: 'M21 12a9 9 0 1 1-9-9',
  align: 'M8 3v18m8-18v18M4 8h8m0 8h8',
  file: 'M14 2H5v20h14V7l-5-5v5h5M8 12h8m-8 4h8',
  chevron: 'm9 5 7 7-7 7',
  flask: 'M9 3h6m-5 0v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10',
  first: 'M5 5v14m13-14-7 7 7 7',
  last: 'M19 5v14M6 5l7 7-7 7',
  left: 'm15 5-7 7 7 7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  device: 'M3 4h18v14H3V4m5 18h8m-4-4v4M6 8h3l2 5 3-5h4',
} as const;
export type InspectorIconName = keyof typeof paths;

export function InspectorIcon({
  name,
  className,
}: {
  name: InspectorIconName;
  className?: string;
}) {
  return (
    <svg
      className={['dv-insp-ico', className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export type InspectorButtonVariant = 'default' | 'primary' | 'quiet';
export function InspectorButton({
  variant = 'default',
  small = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: InspectorButtonVariant;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={['dv-insp-button', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={small ? 'small' : undefined}
    />
  );
}

/** Number field with its unit inside the border (.input-unit). */
export function UnitInput({
  unit,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  unit: string;
  invalid?: boolean;
}) {
  return (
    <div className="dv-insp-input-unit">
      <input
        inputMode="decimal"
        autoComplete="off"
        {...props}
        aria-invalid={invalid ? true : undefined}
      />
      <span aria-hidden="true">{unit}</span>
    </div>
  );
}

/**
 * Sidebar pane content with a scroll area and actions pinned below it (.scroll + .sidebar-actions).
 * Place it directly inside a `RightSidebar`.
 */
export function InspectorPane({
  label,
  actions,
  children,
  ref,
}: {
  label: string;
  actions?: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} className="dv-insp dv-insp-pane">
      <ScrollFrame
        axes="y"
        overscroll="contain"
        rootClassName="dv-insp-scroll-root"
        className="dv-insp-scroll"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </ScrollFrame>
      {actions && <div className="dv-insp-actions">{actions}</div>}
    </div>
  );
}

/** Polite live region for completed actions. */
export function Announcer({ message }: { message: string }) {
  return (
    <div
      className="dv-insp-sr"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </div>
  );
}

/** Number parsing used by every inspector: blank is not a number; a decimal comma is accepted. */
export const parseNumber = (text: string) =>
  text.trim() === '' ? NaN : Number(text.trim().replace(',', '.'));
