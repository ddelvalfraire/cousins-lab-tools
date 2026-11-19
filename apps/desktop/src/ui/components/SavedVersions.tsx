import { type KeyboardEvent, type ReactNode, useCallback, useRef } from 'react';
import { useAppearance } from '../appearance';
import { textScales } from '../textSize';
import { Chip } from './Chip';
import { Presence, Swap } from './Motion';
import { StatusBanner } from './Primitives';
import {
  formatSavedAt,
  type PresetRevision,
  type RestorePhase,
  RevisionButton,
  type RevisionChange,
  RevisionChanges,
  RevisionRestoreConfirm,
} from './RevisionHistory';
import { SidebarIcon } from './RightSidebar';
import { useElementWidth } from './useElementWidth';
import './SavedVersions.css';

export interface SavedChart {
  title: string;
  /** Latest value, already formatted to the panel's precision. */
  value: string;
  unit: string;
  /** Lower and upper limits of the signal axis. */
  min: number;
  max: number;
  /** Samples across the time window, oldest first. */
  points: readonly number[];
  /** Length of the time window in seconds. */
  window?: number;
}
export interface SavedReadout {
  title: string;
  value: string;
  unit: string /** Shows the value in a read-only input. */;
  input?: boolean;
}

/** Read-only plot of a chart panel (.saved-plot). Drawn at 260 px in the mockup; wider cards stretch the plot area. */
function SavedPlot({ chart }: { chart: SavedChart }) {
  const { min, max, points, window = 30 } = chart;
  const { textSize } = useAppearance(),
    scale = textScales[textSize];
  const [ref, measured] = useElementWidth<SVGSVGElement>(260);
  const width = Math.max(260, measured) / scale,
    end = width - 12,
    plotWidth = end - 38,
    mid = 38 + plotWidth / 2;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const path = points
    .map(
      (value, i) =>
        `${i ? 'L' : 'M'}${(38 + i * step).toFixed(2)} ${(20 + ((max - value) / (max - min)) * 90).toFixed(2)}`,
    )
    .join(' ');
  return (
    <svg
      ref={ref}
      className="dv-saved-plot"
      viewBox={`0 0 ${width} 150`}
      role="img"
      aria-label={`${chart.title} sample signal. Time axis minus ${window} to 0 seconds; signal axis ${min} to ${max} ${chart.unit}.`}
    >
      <text x="38" y="11">
        {chart.unit}
      </text>
      <path
        className="dv-saved-plot-grid"
        d={`M38 20H${end}M38 65H${end}M38 110H${end}`}
      />
      <text x="4" y="23">
        {max}
      </text>
      <text x="4" y="68">
        {((max + min) / 2).toFixed(2)}
      </text>
      <text x="4" y="113">
        {min}
      </text>
      <path className="dv-saved-plot-signal" d={path} />
      <text x="38" y="127">
        −{window}
      </text>
      <text x={mid} y="127" textAnchor="middle">
        −{window / 2}
      </text>
      <text x={end} y="127" textAnchor="end">
        0
      </text>
      <text x={mid} y="145" textAnchor="middle">
        Time (s)
      </text>
    </svg>
  );
}

/**
 * Read-only preview of a saved preset layout: chart panels, then readouts and inputs.
 * Values from design/dvdash-field-review/revision-chips-review.html (.saved-version-preview).
 */
export function SavedVersionPreview({
  charts,
  readouts,
  note = 'Read-only layout preview · illustrative signal data.',
}: {
  charts: readonly SavedChart[];
  readouts: readonly SavedReadout[];
  note?: string;
}) {
  return (
    <>
      <div className="dv-saved-preview">
        {charts.map((chart) => (
          <article key={chart.title} className="dv-saved-chart">
            <h3>{chart.title}</h3>
            <div className="dv-saved-reading">
              {chart.value}
              <small>{chart.unit}</small>
            </div>
            <div className="dv-saved-legend">
              <span aria-hidden="true" />
              {chart.title}
            </div>
            <SavedPlot chart={chart} />
          </article>
        ))}
        {readouts.length > 0 && (
          <div className="dv-saved-readouts">
            {readouts.map((readout) => (
              <div
                key={readout.title}
                className="dv-saved-readout"
                data-single={readouts.length === 1 || undefined}
              >
                <h3>{readout.title}</h3>
                {readout.input ? (
                  <label className="dv-saved-input">
                    <span className="dv-revision-sr">
                      {readout.title}, read-only preview
                    </span>
                    <input value={readout.value} disabled readOnly />
                    <small>{readout.unit}</small>
                  </label>
                ) : (
                  <div>
                    <strong>{readout.value}</strong>
                    <small>{readout.unit}</small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {note && <p className="dv-saved-note">{note}</p>}
    </>
  );
}

export type SavedVersionTab = 'preview' | 'changes';
export interface SavedVersionViewProps {
  /** Preset name. */
  title: string;
  /** Revision shown. */
  revision: PresetRevision;
  /** Number of the current revision. */
  current: number;
  /** `loading` and `error` replace the view; the revision list stays usable. */
  status?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  tab: SavedVersionTab;
  onTabChange: (tab: SavedVersionTab) => void;
  /** Layout of the revision, usually a `SavedVersionPreview`. */
  preview: ReactNode;
  /** What this revision changed compared with `comparedWith`. */
  changes: readonly RevisionChange[];
  /** Previous revision number. Omit for the first revision. */
  comparedWith?: number;
  restore?: RestorePhase;
  /** After `restored`: the revision the current one was created from. */
  restoredFrom?: number;
  onRestore: () => void;
  onCancelRestore: () => void;
  onConfirmRestore: () => void;
  id?: string;
}

/**
 * Main area of the revision history page: the selected revision with Preview and Changes tabs.
 * Earlier revisions can be restored as a new revision after confirmation.
 * Values from design/dvdash-field-review/revision-chips-review.html; restore confirmation from revision-history-review.html.
 */
export function SavedVersionView({
  title,
  revision,
  current,
  status = 'ready',
  onRetry,
  tab,
  onTabChange,
  preview,
  changes,
  comparedWith,
  restore = 'idle',
  restoredFrom,
  onRestore,
  onCancelRestore,
  onConfirmRestore,
  id = 'dv-saved-version',
}: SavedVersionViewProps) {
  const tabs = useRef<Record<SavedVersionTab, HTMLButtonElement | null>>({
    preview: null,
    changes: null,
  });
  const restoreButton = useRef<HTMLButtonElement>(null);
  // The owner reports the restore as finished, so no handler here runs at that moment. The panel's ref callback changes
  // with `restore`, and React calls it once the restored revision has committed.
  const previousRestore = useRef(restore);
  const panel = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      if (previousRestore.current === 'restoring' && restore === 'restored')
        node.focus({ preventScroll: true });
      previousRestore.current = restore;
    },
    [restore],
  );
  const isCurrent = revision.number === current,
    busy = restore === 'restoring';
  const saved = formatSavedAt(revision.savedAt);
  const choose = (next: SavedVersionTab) => {
    onTabChange(next);
    tabs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const next =
      event.key === 'Home'
        ? 'preview'
        : event.key === 'End'
          ? 'changes'
          : event.key === 'ArrowLeft' || event.key === 'ArrowRight'
            ? tab === 'preview'
              ? 'changes'
              : 'preview'
            : null;
    if (!next) return;
    event.preventDefault();
    choose(next);
  };
  const tabId = (name: SavedVersionTab) => `${id}-${name}-tab`;
  const body =
    tab === 'preview' ? (
      preview
    ) : comparedWith === undefined ? (
      <div className="dv-saved-empty">
        <strong>First saved version</strong>This is the original preset
        definition.
      </div>
    ) : changes.length === 0 ? (
      <div className="dv-saved-empty">
        <strong>No definition changes</strong>This revision matches the previous
        saved definition.
      </div>
    ) : (
      <>
        <p className="dv-saved-caption">
          Changes saved in R{revision.number} · compared with R{comparedWith}
        </p>
        <RevisionChanges changes={changes} />
      </>
    );

  return (
    <Swap sequential swapKey={status}>
      {status === 'loading' ? (
        <div className="dv-saved-version">
          <div role="status" aria-label="Loading saved preset">
            {[0, 1, 2].map((i) => (
              <div key={i} className="dv-saved-skeleton" />
            ))}
          </div>
        </div>
      ) : status === 'error' ? (
        <div className="dv-saved-version">
          <StatusBanner severity="error" announce>
            Saved versions could not be loaded.
          </StatusBanner>
          <div className="dv-saved-actions">
            <button
              type="button"
              className="dv-revision-text-button"
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="dv-saved-version">
          <RevisionRestoreConfirm
            phase={restore}
            selected={
              restore === 'restored'
                ? (restoredFrom ?? revision.number)
                : revision.number
            }
            next={restore === 'restored' ? revision.number : current + 1}
            onCancel={() => {
              onCancelRestore();
              restoreButton.current?.focus();
            }}
            onConfirm={onConfirmRestore}
          />
          <div className="dv-saved-heading">
            <div>
              <h2>{title}</h2>
              <Swap sequential swapKey={String(revision.number)}>
                <div className="dv-saved-meta">
                  <Chip icon={<SidebarIcon name="revisions" />}>
                    R{revision.number}
                  </Chip>
                  {isCurrent ? (
                    <span className="dv-saved-current">Current</span>
                  ) : (
                    <span>Earlier version</span>
                  )}
                  <span>
                    <time dateTime={revision.savedAt}>{saved.full}</time>
                  </span>
                </div>
              </Swap>
            </div>
            <Presence show={!isCurrent} variant="fade">
              <RevisionButton
                ref={restoreButton}
                disabled={busy}
                onClick={onRestore}
              >
                Restore R{revision.number}
              </RevisionButton>
            </Presence>
          </div>
          <div
            className="dv-saved-tabs"
            role="tablist"
            aria-label="Saved preset view"
            onKeyDown={onKeyDown}
          >
            {(['preview', 'changes'] as const).map((name) => (
              <button
                key={name}
                ref={(node) => {
                  tabs.current[name] = node;
                }}
                type="button"
                role="tab"
                id={tabId(name)}
                aria-selected={tab === name}
                aria-controls={`${id}-panel`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => onTabChange(name)}
              >
                {name === 'preview'
                  ? 'Preview'
                  : changes.length && comparedWith !== undefined
                    ? `Changes · ${changes.length}`
                    : 'Changes'}
              </button>
            ))}
          </div>
          <section
            ref={panel}
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={tabId(tab)}
            tabIndex={0}
          >
            <Swap sequential swapKey={`${revision.number}-${tab}`}>
              {body}
            </Swap>
          </section>
        </div>
      )}
    </Swap>
  );
}
