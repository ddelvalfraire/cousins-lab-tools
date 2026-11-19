import { type ReactNode, useId, useMemo, useState } from 'react';
import { pages } from '@/shared/config/search-registry';
import { keyedBy } from '@/shared/lib/keyedBy';
import { MotionList, Presence, Swap } from '@/shared/motion/Motion';
import {
  CatalogAction,
  CatalogArrow,
  CatalogChip,
  CatalogFilter,
  CatalogPagination,
  CatalogRoot,
  CatalogState,
  CatalogToolbar,
  focusPane,
  normalize,
  SidebarEmpty,
  useCatalogPage,
  useCatalogQuery,
} from './CatalogTable';
import { type PageBreadcrumb, PageHeader } from './PageHeader';
import {
  RightSidebar,
  SidebarFacts,
  SidebarIcon,
  SidebarSection,
  WorkspaceBody,
} from './RightSidebar';
import { ScrollFrame } from './ScrollFrame';
import { useAtScrollEnd } from './useAtScrollEnd';

export interface CatalogRoutineStep {
  kind: 'capture' | 'wait' | 'annotate';
  /** What a capture records, or an annotation's text. */
  name?: string;
  /** Seconds. Annotations take no time. */
  duration?: number;
}
const stepKey = (step: CatalogRoutineStep) =>
  `${step.kind} ${step.name ?? ''} ${step.duration ?? ''}`;

export interface CatalogRoutine {
  id: string;
  name: string;
  revision: number;
  /** Input the experiment must assign, e.g. "Voltage signal". */
  role: string;
  /** Default parameters as label and display value, e.g. ["Settle", "10 s"]. */
  parameters: readonly (readonly [string, string])[];
  steps: readonly CatalogRoutineStep[];
}
export type RoutineSidebarTab = 'details' | 'steps' | 'inputs';

export interface RoutineCatalogProps {
  routines: readonly CatalogRoutine[];
  /** Search text from the window bar. Filters names and input roles. */
  query?: string;
  onClearQuery?: () => void;
  /** Use the routine when preparing a new experiment. */
  onUse?: (id: string) => void;
  onEdit?: (id: string) => void;
  breadcrumbs?: readonly PageBreadcrumb[];
  initialAscending?: boolean;
  initialSelected?: string | null;
  /** Step index shown in the Steps tab. */
  initialStep?: number | null;
  initialTab?: RoutineSidebarTab;
  initialCollapsed?: boolean;
}

const noun = (n: number) => `${n} ${n === 1 ? 'routine' : 'routines'}`;
const stepText = (step: CatalogRoutineStep) =>
  step.kind === 'capture'
    ? `Capture ${step.name?.toLowerCase()}`
    : step.kind === 'annotate'
      ? (step.name ?? 'Annotate')
      : 'Wait';
const STEP_NOTE: Record<CatalogRoutineStep['kind'], string> = {
  capture: 'Records the assigned signal for this interval.',
  wait: 'Waits before advancing to the next step.',
  annotate: 'Adds a named event to the recording.',
};
const KIND: Record<CatalogRoutineStep['kind'], string> = {
  capture: 'Capture',
  wait: 'Wait',
  annotate: 'Annotate',
};

const routineGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="4" width="5" height="5" rx="1" />
    <rect x="16" y="15" width="5" height="5" rx="1" />
    <path d="M8 6.5h5a3 3 0 0 1 3 3v5.5M5.5 9v8.5H16" />
  </svg>
);
const backGlyph = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="m15 5-7 7 7 7" />
  </svg>
);

/** The full step sequence beneath a routine row; scrolls sideways with a quiet next button. */
function StepStrip({
  routine,
  current,
  onStep,
}: {
  routine: CatalogRoutine;
  current: number | null;
  onStep: (index: number) => void;
}) {
  const steps = keyedBy(routine.steps, stepKey);
  const strip = useAtScrollEnd<HTMLDivElement>();
  const next = () => {
    strip.element.current?.scrollBy({
      left: 220,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  return (
    <div className="dv-cat-strip-wrap">
      <ScrollFrame
        axes="x"
        rootClassName="dv-cat-strip-root"
        contentClassName="dv-cat-strip-list"
        ref={strip.ref}
        className="dv-cat-strip"
        role="group"
        aria-label={`${routine.name} · ${routine.steps.length} steps`}
        tabIndex={0}
        onScroll={strip.measure}
      >
        {steps.map(({ key, item: step, index: i }) => (
          <span key={key} style={{ display: 'contents' }}>
            {i > 0 && (
              <span className="dv-cat-step-connector" aria-hidden="true" />
            )}
            <button
              type="button"
              className="dv-cat-step"
              aria-current={current === i}
              onClick={() => onStep(i)}
            >
              <span className="dv-cat-step-number">
                <span className="dv-cat-sr">Step </span>
                {i + 1}
              </span>
              <span className="dv-cat-step-copy">
                <strong>
                  {step.kind === 'capture' ? step.name : KIND[step.kind]}
                </strong>
                <small>
                  {step.kind === 'capture'
                    ? `Capture · ${step.duration} s`
                    : step.kind === 'wait'
                      ? `${step.duration} s`
                      : step.name}
                </small>
              </span>
            </button>
          </span>
        ))}
      </ScrollFrame>
      <button
        type="button"
        className="dv-cat-scroll-next"
        aria-label={`Scroll ${routine.name} steps right`}
        disabled={strip.atEnd}
        onClick={next}
      >
        <CatalogArrow />
      </button>
    </div>
  );
}

/**
 * Routines catalog: names and inputs on the left, revision and a quiet "View steps" action, and the complete step
 * sequence beneath each row. Values from design/dvdash-field-review/routine-catalog-review.html.
 */
export function RoutineCatalog({
  routines,
  query = '',
  onClearQuery,
  onUse,
  onEdit,
  breadcrumbs = [{ label: 'Workspace' }, { label: 'Routines' }],
  initialAscending = true,
  initialSelected = null,
  initialStep = null,
  initialTab = 'details',
  initialCollapsed,
}: RoutineCatalogProps) {
  const sidebarId = useId().replace(/:/g, '');
  const [search, clearSearch] = useCatalogQuery(query, onClearQuery);
  const [ascending, setAscending] = useState(initialAscending);
  const [selectedId, setSelectedId] = useState(initialSelected);
  const [step, setStep] = useState(initialStep);
  const [tab, setTab] = useState<string>(initialTab);
  const [collapsed, setCollapsed] = useState(
    initialCollapsed ?? !initialSelected,
  );
  const [reveal, setReveal] = useState(0);

  const rows = useMemo(
    () =>
      routines
        .filter(
          (r) =>
            !search ||
            normalize(`${r.name} ${r.role}`).includes(normalize(search)),
        )
        .sort((a, b) => a.name.localeCompare(b.name) * (ascending ? 1 : -1)),
    [routines, search, ascending],
  );
  const pager = useCatalogPage(rows.length);
  const selected = routines.find((r) => r.id === selectedId) ?? null;

  const open = (
    id: string,
    next: RoutineSidebarTab = 'details',
    index: number | null = null,
  ) => {
    setSelectedId(id);
    setStep(index);
    setTab(next);
    setCollapsed(false);
    setReveal((n) => n + 1);
    focusPane(sidebarId);
  };
  const duration = (r: CatalogRoutine) =>
    r.steps.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  let body: ReactNode;
  if (!routines.length)
    body = (
      <CatalogState
        icon={<SidebarIcon name="revisions" />}
        title="No routines yet"
        message="Saved routine definitions will appear here."
      />
    );
  else if (!rows.length)
    body = (
      <CatalogState
        icon={<SidebarIcon name="revisions" />}
        title="No matching routines"
        message="Try a different routine name."
        action={
          <CatalogAction arrow={false} onClick={clearSearch}>
            Clear search
          </CatalogAction>
        }
      />
    );
  else
    body = (
      <div className="dv-cat-routines">
        <div className="dv-cat-routine-head">
          <button
            type="button"
            aria-label={`Routine, sorted ${ascending ? 'A to Z' : 'Z to A'}`}
            onClick={() => setAscending(!ascending)}
          >
            Routine <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>
          </button>
          <span>Revision</span>
          <span className="dv-cat-sr">Actions</span>
        </div>
        <ul className="dv-cat-routine-list" aria-label="Routine definitions">
          <MotionList resetKey={pager.start}>
            {rows.slice(pager.start, pager.end).map((r) => (
              <li
                key={r.id}
                className="dv-cat-routine"
                data-selected={selected?.id === r.id}
              >
                <div className="dv-cat-routine-top">
                  <div className="dv-cat-routine-identity">
                    <span className="dv-cat-routine-mark">{routineGlyph}</span>
                    <div>
                      <button
                        type="button"
                        className="dv-cat-routine-name"
                        onClick={() => open(r.id)}
                      >
                        {r.name}
                      </button>
                      <div className="dv-cat-routine-inputs">
                        {r.parameters.map(([key, value]) => (
                          <CatalogChip key={key}>
                            {key}
                            <strong>{value}</strong>
                          </CatalogChip>
                        ))}
                        <span className="dv-cat-routine-role">
                          <SidebarIcon name="signals" />
                          {r.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="dv-cat-routine-revision">
                    <CatalogChip
                      icon="revisions"
                      title={`Revision ${r.revision}`}
                    >
                      R{r.revision}
                    </CatalogChip>
                  </div>
                  <span className="dv-cat-routine-action">
                    <CatalogAction
                      label={`View steps: ${r.name}`}
                      onClick={() => open(r.id, 'steps')}
                    >
                      View steps
                    </CatalogAction>
                  </span>
                </div>
                <StepStrip
                  routine={r}
                  current={selected?.id === r.id ? step : null}
                  onStep={(i) => open(r.id, 'steps', i)}
                />
              </li>
            ))}
          </MotionList>
        </ul>
      </div>
    );

  let pane: ReactNode;
  if (!selected)
    pane = (
      <SidebarEmpty
        icon={<SidebarIcon name="revisions" />}
        title="Select a routine"
        message="Open a definition or choose a step to inspect it."
      />
    );
  else if (tab === 'steps') {
    const current = step === null ? undefined : selected.steps[step];
    pane = current ? (
      <SidebarSection>
        <div className="dv-cat-step-detail">
          <button
            type="button"
            className="dv-cat-back"
            onClick={() => {
              setStep(null);
              focusPane(sidebarId);
            }}
          >
            {backGlyph}All {selected.steps.length} steps
          </button>
          <CatalogChip>Step {step! + 1}</CatalogChip>
          <h3>{stepText(current)}</h3>
          <p className="dv-cat-definition-note">{STEP_NOTE[current.kind]}</p>
          <SidebarFacts
            items={[
              ['Type', KIND[current.kind]],
              ...(current.duration
                ? [['Duration', `${current.duration} s`] as const]
                : []),
              ...(current.kind === 'capture'
                ? [['Input role', selected.role] as const]
                : []),
            ]}
          />
        </div>
      </SidebarSection>
    ) : (
      <SidebarSection title={`${selected.steps.length} ordered steps`}>
        {keyedBy(selected.steps, stepKey).map(({ key, item: s, index: i }) => (
          <button
            key={key}
            type="button"
            className="dv-cat-side-step"
            onClick={() => {
              setStep(i);
              focusPane(sidebarId);
            }}
          >
            <span className="dv-cat-step-number">{i + 1}</span>
            <div>
              <strong>{stepText(s)}</strong>
              <p>{s.duration ? `${s.duration} s` : 'Recording event'}</p>
            </div>
          </button>
        ))}
      </SidebarSection>
    );
  } else if (tab === 'inputs')
    pane = (
      <>
        <SidebarSection title="Required source">
          <div className="dv-cat-param">
            <strong>{selected.role}</strong>
            <p>
              Voltage stream · mV
              <br />
              Assigned by the experiment.
            </p>
          </div>
        </SidebarSection>
        <SidebarSection title="Default parameters">
          {selected.parameters.map(([key, value]) => (
            <div key={key} className="dv-cat-param">
              <SidebarFacts items={[[key, value]]} />
            </div>
          ))}
        </SidebarSection>
      </>
    );
  else
    pane = (
      <>
        <SidebarSection>
          <h3 className="dv-cat-side-heading">{selected.name}</h3>
          <div className="dv-cat-meta">
            <CatalogChip icon="revisions">R{selected.revision}</CatalogChip>
            <CatalogChip icon="panels">
              {selected.steps.length} steps
            </CatalogChip>
          </div>
          {(onUse || onEdit) && (
            <div className="dv-cat-actions">
              {onUse && (
                <CatalogAction
                  label={`Use routine: ${selected.name}`}
                  onClick={() => onUse(selected.id)}
                >
                  Use routine
                </CatalogAction>
              )}
              {onEdit && (
                <CatalogAction
                  label={`Edit routine: ${selected.name}`}
                  onClick={() => onEdit(selected.id)}
                >
                  Edit routine
                </CatalogAction>
              )}
            </div>
          )}
        </SidebarSection>
        <SidebarSection title="Definition">
          <SidebarFacts
            items={[
              ['Timed steps', `${duration(selected)} s`],
              ['Input role', selected.role],
            ]}
          />
          <p className="dv-cat-note">
            Timing excludes instrument response and any manual intervention.
          </p>
        </SidebarSection>
        <SidebarSection title="Sequence">
          <CatalogAction onClick={() => open(selected.id, 'steps')}>
            View all steps
          </CatalogAction>
        </SidebarSection>
      </>
    );

  const sidebar = (
    <RightSidebar
      id={sidebarId}
      tabsLabel="Routine tools"
      activeTab={tab}
      onTabChange={(next) => {
        setTab(next);
        if (next === 'steps') setStep(null);
      }}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      revealKey={reveal}
      subtitle={selected?.name ?? 'Routines'}
      tabs={[
        {
          id: 'details',
          label: 'Details',
          icon: <SidebarIcon name="details" />,
        },
        { id: 'steps', label: 'Steps', icon: <SidebarIcon name="panels" /> },
        { id: 'inputs', label: 'Inputs', icon: <SidebarIcon name="display" /> },
      ]}
    >
      <Swap sequential swapKey={`${selected?.id}:${tab}:${step}`}>
        {pane}
      </Swap>
    </RightSidebar>
  );

  return (
    <CatalogRoot label="Routines">
      <PageHeader
        title={pages.routines.title}
        breadcrumbs={breadcrumbs}
        count={rows.length}
      />
      <WorkspaceBody sidebar={sidebar}>
        <Presence show={!!search} className="dv-cat-filter-presence">
          <CatalogFilter query={search} onClear={clearSearch} />
        </Presence>
        <CatalogToolbar count={noun(rows.length)} />
        <Swap swapKey={rows.length ? 'list' : 'empty'}>{body}</Swap>
        <Presence show={rows.length > 0}>
          <CatalogPagination noun={noun} total={rows.length} pager={pager} />
        </Presence>
      </WorkspaceBody>
    </CatalogRoot>
  );
}
