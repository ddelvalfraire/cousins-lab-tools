import { Loader, Modal } from '@mantine/core';
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useId,
  useRef,
} from 'react';
import './Approved.css';
import './ImportDialog.css';
import { ScrollFrame } from './ScrollFrame';

const round = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
/** Glyphs copied from the import and export mockups (recording-import-review.html, sideIcons). */
const glyphs = {
  file: {
    attributes: { ...round, strokeWidth: 1.5 },
    shape: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </>
    ),
  },
  close: {
    attributes: {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
    },
    shape: <path d="m6 6 12 12M18 6 6 18" />,
  },
  upload: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: (
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    ),
  },
  clock: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  calendar: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
  },
  check: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: <path d="m5 12 4 4L19 6" />,
  },
  details: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
  signals: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  },
  panels: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M11 10v10" />
      </>
    ),
  },
  revisions: {
    attributes: { ...round, strokeWidth: 1.6 },
    shape: <path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2" />,
  },
  chevron: {
    attributes: { ...round, strokeWidth: 1.7 },
    shape: <path d="m9 5 7 7-7 7" />,
  },
  warning: {
    attributes: { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 },
    shape: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
  },
} as const;
export type ImportIconName = keyof typeof glyphs;

/** Stroke icon from the approved import and export mockups. Size comes from the surrounding CSS. */
export function ImportIcon({ name }: { name: ImportIconName }) {
  const { attributes, shape } = glyphs[name];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...attributes}
    >
      {shape}
    </svg>
  );
}

export interface ImportDialogProps {
  opened: boolean;
  /** Close, Cancel and Escape. Ignored while `busy`. */
  onClose: () => void;
  title: ReactNode;
  description: ReactNode;
  /** Step names, e.g. `['Files', 'Review']`. Omit for single-step dialogs and finished states. */
  steps?: readonly string[];
  /** Index of the current step. */
  step?: number;
  /** Work in progress: the dialog can't be dismissed. */
  busy?: boolean;
  /** Name of the close button. */
  closeLabel?: string;
  /** Left of the footer: a note such as "2 files selected", or a Back button. */
  footerStart?: ReactNode;
  /** Right of the footer. Use `ImportButton`. */
  actions?: ReactNode;
  /** Longest the body grows before it scrolls. */
  bodyMaxHeight?: number;
  /** Extra class on the dialog, for the dialog's own content styles. */
  className?: string;
  children: ReactNode;
}

/**
 * Shared shell for the import and export dialogs: title and description with a close button,
 * optional step trail, scrolling body and a footer with a note on the left and actions on the right.
 * Values from design/dvdash-field-review/recording-import-review.html (.recording-dialog).
 */
export function ImportDialog({
  opened,
  onClose,
  title,
  description,
  steps,
  step = 0,
  busy = false,
  closeLabel = 'Close dialog',
  footerStart,
  actions,
  bodyMaxHeight = 540,
  className,
  children,
}: ImportDialogProps) {
  const close = () => {
    if (!busy) onClose();
  };
  const id = useId();
  return (
    <Modal.Root
      id={id}
      opened={opened}
      onClose={close}
      centered
      size={580}
      xOffset={10}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      classNames={{
        root: 'dvdash',
        inner: 'dv-import-inner',
        content: className
          ? `dv-import-dialog ${className}`
          : 'dv-import-dialog',
      }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <div className="dv-import-head">
          <div>
            <Modal.Title
              className="dv-import-title"
              tabIndex={-1}
              data-autofocus
            >
              {title}
            </Modal.Title>
            <Modal.Body className="dv-import-description">
              {description}
            </Modal.Body>
          </div>
          <button
            type="button"
            className="dv-import-close"
            aria-label={closeLabel}
            title="Close"
            disabled={busy}
            onClick={close}
          >
            <ImportIcon name="close" />
          </button>
        </div>
        {steps && steps.length > 0 && (
          <nav className="dv-import-steps" aria-label="Steps">
            {steps.map((label, i) => (
              <span key={label} className="dv-import-step">
                {i > 0 && <ImportIcon name="chevron" />}
                <span aria-current={i === step ? 'step' : undefined}>
                  {label}
                </span>
              </span>
            ))}
          </nav>
        )}
        {/* Focusable so the body scrolls from the keyboard while its own controls are disabled (importing). */}
        <ScrollFrame
          overscroll="contain"
          rootClassName="dv-import-body-root"
          className="dv-import-body"
          role="region"
          aria-labelledby={`${id}-title`}
          tabIndex={0}
          style={{ maxHeight: bodyMaxHeight }}
        >
          {children}
        </ScrollFrame>
        {(footerStart || actions) && (
          <footer className="dv-import-footer">
            {footerStart ?? <span />}
            {actions && <div className="dv-import-actions">{actions}</div>}
          </footer>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}

/** Footer and body buttons: `primary` is filled, `quiet` is text only, `link` is the accent text action with an icon. */
export function ImportButton({
  variant = 'primary',
  icon,
  children,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet' | 'link';
  icon?: ImportIconName;
}) {
  return (
    <button
      type={type}
      className="dv-import-button"
      data-variant={variant}
      {...props}
    >
      {icon && <ImportIcon name={icon} />}
      {children}
    </button>
  );
}

/** Plain muted note for the footer's left side. */
export function ImportFooterNote({ children }: { children: ReactNode }) {
  return <span className="dv-import-footer-note">{children}</span>;
}

/** Hidden file input opened by a button, plus a drop target. */
export function useFilePicker({
  accept,
  multiple = false,
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      type="file"
      hidden
      accept={accept}
      multiple={multiple}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const files = [...(event.currentTarget.files ?? [])];
        event.currentTarget.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const files = [...event.dataTransfer.files];
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
  };
  return { open: () => input.current?.click(), input: element, dropProps };
}

/** Empty drop area with a single choose action (.import-dropzone). */
export function ImportDropzone({
  title,
  hint,
  action,
  accept,
  multiple,
  onFiles,
}: {
  title: string;
  hint: string;
  action: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const picker = useFilePicker({ accept, multiple, onFiles });
  return (
    <div className="dv-import-dropzone" {...picker.dropProps}>
      <ImportIcon name="upload" />
      <strong>{title}</strong>
      <p>{hint}</p>
      <ImportButton onClick={picker.open}>{action}</ImportButton>
      {picker.input}
    </div>
  );
}

/** "Add files" / "Replace file" text action that opens the file picker. */
export function ImportChooseButton({
  label,
  accept,
  multiple,
  onFiles,
  disabled,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const picker = useFilePicker({ accept, multiple, onFiles });
  return (
    <>
      <ImportButton
        variant="link"
        icon="upload"
        disabled={disabled}
        onClick={picker.open}
      >
        {label}
      </ImportButton>
      {picker.input}
    </>
  );
}

export type ImportStatusTone = 'normal' | 'error' | 'busy';
/** Icon plus word for a file or item: Ready, Imported, Needs attention, Failed, Importing…. */
export function ImportStatus({
  tone = 'normal',
  children,
}: {
  tone?: ImportStatusTone;
  children: ReactNode;
}) {
  return (
    <span className="dv-import-status" data-tone={tone}>
      {tone === 'busy' ? (
        <Loader size={10} className="dv-import-status-loader" aria-hidden />
      ) : (
        <ImportIcon name={tone === 'error' ? 'warning' : 'check'} />
      )}
      {children}
    </span>
  );
}

/** Spinner with a title and a line of detail: checking a file, preparing an export. */
export function ImportProgressNote({
  title,
  detail,
  variant = 'file',
}: {
  title: ReactNode;
  detail: ReactNode;
  variant?: 'file' | 'export';
}) {
  return (
    <div
      className={
        variant === 'export'
          ? 'dv-import-working dv-import-working-export'
          : 'dv-import-working'
      }
      role="status"
      aria-live="polite"
    >
      <span className="dv-import-loader" aria-hidden="true">
        <Loader className="dv-import-loader-ring" />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

/** Labelled progress bar (.import-progress-block). */
export function ImportProgress({
  label,
  done,
  total,
}: {
  label: ReactNode;
  done: number;
  total: number;
}) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="dv-import-progress">
      <div className="dv-import-progress-label">
        <strong>{label}</strong>
        <span>{percent}%</span>
      </div>
      <div
        className="dv-import-progress-track"
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="dv-import-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** "47 KB", "1.2 MB". */
export function formatFileSize(bytes: number) {
  const kb = bytes / 1024;
  return kb < 1024
    ? `${Math.max(1, Math.round(kb))} KB`
    : `${(kb / 1024).toFixed(1)} MB`;
}

/** Seconds as minutes and seconds, "02:00". */
export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
