import { Select } from '@mantine/core';
import { useEffect, useId, useRef, useState } from 'react';
import { Banner } from './Banner';
import { Presence } from './Motion';
import { chosen, selectAria } from './select';
import './Approved.css';
import './ExperimentSetupForm.css';

export interface SetupPreset {
  id: string;
  name: string /** Newest first; the first is labelled Latest. */;
  revisions: readonly number[] /** Mass numbers the role must provide, such as "44". */;
  signals: readonly string[];
}
export interface SetupSource {
  id: string;
  name: string;
  kind: 'recording' | 'instrument';
  signals: readonly string[];
  /** Recordings: file name, sample count and duration in seconds. */
  file?: string;
  samples?: number;
  duration?: number;
  /** Instruments: what it is and whether it is reachable. */
  detail?: string;
  connected?: boolean;
}
export interface RoutineField {
  id: string;
  label: string;
  value: number;
  unit?: string;
  min: number;
  integer?: boolean;
}
export interface SetupRoutine {
  id: string;
  name: string;
  revision: number;
  steps: number;
  fields: readonly RoutineField[];
}
export type SourceMode = 'recorded' | 'live';
export interface ExperimentSetupValues {
  name: string;
  presetId: string;
  revision: number;
  mode: SourceMode;
  sourceId: string;
  includeReference: boolean;
  referenceId: string;
  routineId: string;
  /** Typed text for the selected routine's fields; missing fields use the routine defaults. */
  parameters?: Readonly<Record<string, string>>;
}
/** What the form hands over when the experiment is opened. */
export interface PreparedExperiment {
  name: string;
  preset: { id: string; name: string; revision: number };
  mode: SourceMode;
  roles: Record<string, string>;
  reference: string | null;
  /** Recorded data never carries routine timing. */
  routine: {
    id: string;
    revision: number;
    parameters: Record<string, number>;
  } | null;
}
export type SetupStatus = 'editing' | 'preparing' | 'failed';
type Problem = { field: string; text: string };

const toNumber = (text: string) =>
  text.trim() === '' ? NaN : Number(text.replace(',', '.'));
const defaults = (routine?: SetupRoutine) =>
  Object.fromEntries(
    (routine?.fields ?? []).map((field) => [field.id, String(field.value)]),
  );
/** Icons as drawn in the approved setup mockup. */
const ICONS = {
  file: 'M14 2H5v20h14V7l-5-5v5h5M8 12h8m-8 4h8',
  signal: 'M3 12h3l3-7 6 14 3-7h3',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'm5 12 4 4L19 6',
} as const;
const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={ICONS[name]} />
  </svg>
);
const firstOfKind = (sources: readonly SetupSource[], mode: SourceMode) =>
  sources.find(
    (source) =>
      source.kind === (mode === 'recorded' ? 'recording' : 'instrument'),
  )?.id ?? '';

export function ExperimentSetupForm({
  presets,
  sources,
  routines,
  initialValues,
  role = { id: 'massSpectrometer', label: 'Mass spectrometer' },
  initialStatus = 'editing',
  preparedMessage,
  onOpen,
  hideHeader = false,
}: {
  presets: readonly SetupPreset[];
  sources: readonly SetupSource[];
  routines: readonly SetupRoutine[];
  initialValues?: Partial<ExperimentSetupValues>;
  /** The instrument role the preset requires. */
  role?: { id: string; label: string };
  /** Start already preparing (locked) or after a failed preparation. */
  initialStatus?: SetupStatus;
  /** Shown once the experiment is prepared. */
  preparedMessage?: string;
  /** Prepares the experiment. A rejected promise shows the failure and keeps every input for Retry. */
  onOpen?: (experiment: PreparedExperiment) => void | Promise<void>;
  /** Leave out the card title and preset chip, e.g. when the screen shows the shared page header. */
  hideHeader?: boolean;
}) {
  const start = (): Required<ExperimentSetupValues> => {
    const mode = initialValues?.mode ?? 'recorded',
      preset =
        presets.find((p) => p.id === initialValues?.presetId) ?? presets[0];
    const routineId = initialValues?.routineId ?? routines[0]?.id ?? '';
    return {
      name: initialValues?.name ?? '',
      presetId: preset.id,
      revision: initialValues?.revision ?? preset.revisions[0],
      mode,
      sourceId: initialValues?.sourceId ?? firstOfKind(sources, mode),
      includeReference: initialValues?.includeReference ?? false,
      referenceId: initialValues?.referenceId ?? '',
      routineId,
      parameters: {
        ...defaults(routines.find((r) => r.id === routineId)),
        ...initialValues?.parameters,
      },
    };
  };
  const [values, setValues] = useState(start);
  const [status, setStatus] = useState<SetupStatus | 'prepared'>(initialStatus);
  const [prepared, setPrepared] = useState<PreparedExperiment | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const attempt = useRef(0),
    retryRef = useRef<HTMLButtonElement>(null),
    openedRef = useRef<HTMLHeadingElement>(null),
    nameRef = useRef<HTMLInputElement>(null),
    returning = useRef(false);
  const ids = {
    title: useId(),
    source: useId(),
    routine: useId(),
    requirements: useId(),
    validation: useId(),
    field: useId(),
    mode: useId(),
  };
  const fieldId = (name: string) => `${ids.field}-${name}`;
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  useEffect(() => {
    if (status === 'failed' && attempt.current > 0) retryRef.current?.focus();
    if (status === 'prepared') openedRef.current?.focus();
    if (status === 'editing' && returning.current) {
      returning.current = false;
      nameRef.current?.focus();
    }
  }, [status]);

  const preset = presets.find((p) => p.id === values.presetId) ?? presets[0];
  const source = sources.find((s) => s.id === values.sourceId);
  const routine =
    values.mode === 'live'
      ? routines.find((r) => r.id === values.routineId)
      : undefined;
  const busy = status === 'preparing';
  const signalNames = (keys: readonly string[]) =>
    keys.map((key) => `Mass ${key}`).join(', ');

  const snapshot = (): PreparedExperiment => ({
    name: values.name.trim(),
    preset: { id: preset.id, name: preset.name, revision: values.revision },
    mode: values.mode,
    roles: { [role.id]: values.sourceId },
    reference:
      values.mode === 'recorded' && values.includeReference
        ? values.referenceId
        : null,
    routine: routine
      ? {
          id: routine.id,
          revision: routine.revision,
          parameters: Object.fromEntries(
            routine.fields.map((f) => [
              f.id,
              toNumber(values.parameters[f.id] ?? ''),
            ]),
          ),
        }
      : null,
  });

  const problems: Problem[] = [];
  const current = snapshot();
  if (!current.name)
    problems.push({ field: 'name', text: 'Enter an experiment name.' });
  if (!source)
    problems.push({
      field: 'source',
      text: `Choose a source for the ${role.label.toLowerCase()}.`,
    });
  else {
    const missing = preset.signals.filter(
      (signal) => !source.signals.includes(signal),
    );
    if (missing.length)
      problems.push({
        field: 'source',
        text: `${source.name} is missing ${signalNames(missing)}. Choose a compatible source.`,
      });
    if (values.mode === 'live' && !source.connected)
      problems.push({
        field: 'source',
        text: `${source.name} is offline. Choose an available instrument.`,
      });
  }
  if (values.mode === 'recorded' && values.includeReference) {
    if (!current.reference)
      problems.push({
        field: 'reference',
        text: 'Choose a reference recording.',
      });
    else if (current.reference === values.sourceId)
      problems.push({
        field: 'reference',
        text: 'Choose a different recording for the reference.',
      });
  }
  for (const field of routine?.fields ?? []) {
    const value = current.routine!.parameters[field.id];
    if (
      !Number.isFinite(value) ||
      value < field.min ||
      (field.integer && !Number.isSafeInteger(value))
    )
      problems.push({
        field: field.id,
        text: `${field.label}: ${field.integer ? `enter a safely representable whole number of at least ${field.min}` : `enter a finite value of at least ${field.min} ${field.unit ?? ''}`.trimEnd()}.`,
      });
  }
  const invalid = (field: string) =>
    problems.some((problem) => problem.field === field);
  const describedBy = (...extra: string[]) =>
    [...extra, ids.validation].join(' ');

  /** Any edit clears a previous preparation failure. */
  const update = (patch: Partial<ExperimentSetupValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    if (status === 'failed') setStatus('editing');
  };

  const open = async () => {
    if (busy || problems.length) return;
    const submitted = structuredClone(current),
      token = ++attempt.current;
    setStatus('preparing');
    setAnnouncement('Preparing the experiment.');
    try {
      await onOpen?.(submitted);
      if (token !== attempt.current) return;
      setPrepared(submitted);
      setStatus('prepared');
      setAnnouncement('Experiment configuration prepared.');
    } catch {
      if (token !== attempt.current) return;
      setStatus('failed');
      setAnnouncement('Preparation failed. Your settings are retained.');
    }
  };
  const reset = () => {
    attempt.current++;
    setValues(start());
    setStatus('editing');
    setAnnouncement('');
  };

  const announcer = (
    <span
      className="dv-setup-sr"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </span>
  );
  const header = (revision: number) =>
    hideHeader ? null : (
      <header className="dv-setup-title">
        <h2 id={ids.title}>Prepare experiment</h2>
        <span className="dv-setup-chip">
          <Icon name="clock" />
          Preset R{revision}
        </span>
      </header>
    );
  /** Section headings sit one level below the form title, or below the page title when the form has none. */
  const Heading = hideHeader ? 'h2' : 'h3';
  const sectionLabel = hideHeader
    ? { 'aria-label': 'Prepare experiment' }
    : { 'aria-labelledby': ids.title };

  if (status === 'prepared' && prepared) {
    const preparedRoutine =
      prepared.routine && routines.find((r) => r.id === prepared.routine!.id);
    return (
      <section
        className="dv-setup"
        data-header={hideHeader ? 'hidden' : undefined}
        {...sectionLabel}
      >
        {header(prepared.preset.revision)}
        <div className="dv-setup-opened">
          <Heading tabIndex={-1} ref={openedRef}>
            <Icon name="check" /> Experiment prepared
          </Heading>
          {preparedMessage && (
            <Banner severity="info" announce>
              {preparedMessage}
            </Banner>
          )}
          <dl>
            <dt>Name</dt>
            <dd>{prepared.name}</dd>
            <dt>Preset</dt>
            <dd>
              {prepared.preset.name} · R{prepared.preset.revision}
            </dd>
            <dt>Source</dt>
            <dd>
              {sources.find((s) => s.id === prepared.roles[role.id])?.name}
            </dd>
            <dt>Routine</dt>
            <dd>
              {preparedRoutine
                ? `${preparedRoutine.name} · R${preparedRoutine.revision}`
                : 'None'}
            </dd>
          </dl>
          <button
            type="button"
            className="dv-setup-button"
            onClick={() => {
              returning.current = true;
              setStatus('editing');
            }}
          >
            Return to setup
          </button>
        </div>
        {announcer}
      </section>
    );
  }

  const kindSources = sources.filter(
    (s) => s.kind === (values.mode === 'recorded' ? 'recording' : 'instrument'),
  );
  const recordings = sources.filter((s) => s.kind === 'recording');

  const select = (
    name: string,
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void,
    extra: { invalid?: boolean; describedBy?: string; className?: string } = {},
  ) => (
    <div
      className={`dv-setup-field${extra.className ? ` ${extra.className}` : ''}`}
    >
      <label htmlFor={fieldId(name)}>{label}</label>
      <Select
        id={fieldId(name)}
        aria-label={label}
        value={value}
        data={options}
        {...selectAria(extra)}
        onChange={chosen(onChange)}
      />
    </div>
  );

  return (
    <section
      className="dv-setup"
      data-header={hideHeader ? 'hidden' : undefined}
      {...sectionLabel}
    >
      {header(values.revision)}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void open();
        }}
      >
        <fieldset className="dv-setup-fields" disabled={busy}>
          <div className="dv-setup-content">
            <section
              className="dv-setup-section"
              aria-label="Experiment identity"
            >
              <div className="dv-setup-field dv-setup-full">
                <label htmlFor={fieldId('name')}>Experiment name</label>
                <input
                  id={fieldId('name')}
                  ref={nameRef}
                  autoComplete="off"
                  value={values.name}
                  aria-invalid={invalid('name')}
                  aria-describedby={describedBy()}
                  onChange={(event) =>
                    update({ name: event.currentTarget.value })
                  }
                />
              </div>
              <div className="dv-setup-grid" data-layout="preset">
                {select(
                  'preset',
                  'Preset',
                  values.presetId,
                  presets.map((p) => ({ value: p.id, label: p.name })),
                  (id) => {
                    const next = presets.find((p) => p.id === id)!;
                    update({ presetId: next.id, revision: next.revisions[0] });
                  },
                )}
                {select(
                  'revision',
                  'Revision',
                  String(values.revision),
                  preset.revisions.map((r, index) => ({
                    value: String(r),
                    label: `R${r}${index === 0 ? ' · Latest' : ''}`,
                  })),
                  (revision) => update({ revision: Number(revision) }),
                )}
              </div>
            </section>

            <section className="dv-setup-section" aria-labelledby={ids.source}>
              <Heading id={ids.source}>Data source</Heading>
              <div
                className="dv-setup-mode"
                role="radiogroup"
                aria-label="Source mode"
              >
                {(['recorded', 'live'] as const).map((mode) => (
                  <label key={mode}>
                    <input
                      type="radio"
                      name={ids.mode}
                      value={mode}
                      checked={values.mode === mode}
                      onChange={() =>
                        update({ mode, sourceId: firstOfKind(sources, mode) })
                      }
                    />
                    <Icon name={mode === 'recorded' ? 'file' : 'signal'} />
                    {mode === 'recorded'
                      ? 'Existing recording'
                      : 'Instrument stream'}
                  </label>
                ))}
              </div>
              <div className="dv-setup-role">
                <span>{role.label}</span>
                <span className="dv-setup-chip">Required</span>
              </div>
              <p className="dv-setup-requirement" id={ids.requirements}>
                Needs {signalNames(preset.signals)} · mV
              </p>
              {select(
                'source',
                values.mode === 'recorded' ? 'Recording' : 'Instrument',
                values.sourceId,
                [
                  {
                    value: '',
                    label:
                      values.mode === 'recorded'
                        ? 'Choose a recording'
                        : 'Choose an instrument',
                  },
                  ...kindSources.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.connected === false ? ' · Offline' : ''}`,
                  })),
                ],
                (sourceId) => update({ sourceId }),
                {
                  invalid: invalid('source'),
                  describedBy: describedBy(ids.requirements),
                },
              )}
              {/* The line keeps its space when no source is chosen, as in the mockup. */}
              <p className="dv-setup-meta">
                {source &&
                  (values.mode === 'recorded' ? (
                    <>
                      <Icon name="file" />
                      {source.file} · {source.samples} samples ·{' '}
                      {source.duration} s
                    </>
                  ) : (
                    <>
                      <Icon name="signal" />
                      {source.detail} ·{' '}
                      {source.connected ? 'Available' : 'Offline'}
                    </>
                  ))}
              </p>
              <Presence show={values.mode === 'recorded'}>
                <label className="dv-setup-reference-toggle">
                  <input
                    type="checkbox"
                    checked={values.includeReference}
                    onChange={(event) =>
                      update({ includeReference: event.currentTarget.checked })
                    }
                  />
                  Include a reference recording
                </label>
                <Presence show={values.includeReference}>
                  {select(
                    'reference',
                    'Reference recording',
                    values.referenceId,
                    [
                      { value: '', label: 'Choose a recording' },
                      ...recordings.map((s) => ({
                        value: s.id,
                        label: s.name,
                      })),
                    ],
                    (referenceId) => update({ referenceId }),
                    {
                      invalid: invalid('reference'),
                      describedBy: describedBy(),
                      className: 'dv-setup-reference-field',
                    },
                  )}
                </Presence>
              </Presence>
            </section>

            <Presence show={values.mode === 'live'}>
              <section
                className="dv-setup-section"
                aria-labelledby={ids.routine}
              >
                <Heading id={ids.routine}>Routine settings</Heading>
                {select(
                  'routine',
                  'Routine revision',
                  values.routineId,
                  [
                    { value: '', label: 'No routine' },
                    ...routines.map((r) => ({
                      value: r.id,
                      label: `${r.name} · R${r.revision}`,
                    })),
                  ],
                  (id) =>
                    update({
                      routineId: id,
                      parameters: defaults(routines.find((r) => r.id === id)),
                    }),
                )}
                <Presence show={!!routine}>
                  {routine && (
                    <>
                      <div className="dv-setup-grid" data-layout="routine">
                        {routine.fields.map((field) => (
                          <div key={field.id} className="dv-setup-field">
                            <label htmlFor={fieldId(`parameter-${field.id}`)}>
                              {field.label}
                            </label>
                            <div className="dv-setup-unit-input">
                              <input
                                id={fieldId(`parameter-${field.id}`)}
                                value={values.parameters[field.id] ?? ''}
                                aria-invalid={invalid(field.id)}
                                inputMode={
                                  field.integer ? 'numeric' : 'decimal'
                                }
                                autoComplete="off"
                                aria-describedby={describedBy()}
                                onChange={(event) => {
                                  const text = event.currentTarget.value;
                                  update({
                                    parameters: {
                                      ...values.parameters,
                                      [field.id]: text,
                                    },
                                  });
                                }}
                              />
                              {field.unit && <span>{field.unit}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="dv-setup-summary">
                        <span className="dv-setup-chip">
                          <Icon name="clock" />
                          {routine.steps} steps
                        </span>
                      </div>
                    </>
                  )}
                </Presence>
              </section>
            </Presence>

            <div id={ids.validation}>
              <Presence show={problems.length > 0}>
                <div className="dv-setup-messages">
                  {problems.length > 0 && (
                    <Banner
                      severity="error"
                      messages={problems.map((problem) => problem.text)}
                    />
                  )}
                </div>
              </Presence>
            </div>
            <Presence show={status === 'failed'}>
              <div className="dv-setup-messages">
                <Banner
                  severity="error"
                  messages={[
                    'Could not prepare the experiment. Your settings are retained.',
                  ]}
                  action={
                    <button
                      type="button"
                      ref={retryRef}
                      onClick={() => void open()}
                    >
                      Retry
                    </button>
                  }
                />
              </div>
            </Presence>
          </div>
        </fieldset>
        <div className="dv-setup-actions">
          <button
            type="button"
            className="dv-setup-button"
            data-variant="quiet"
            disabled={busy}
            onClick={reset}
          >
            Reset form
          </button>
          <button
            type="submit"
            className="dv-setup-button"
            data-variant="primary"
            disabled={busy || problems.length > 0}
          >
            {busy ? 'Preparing…' : 'Open experiment'}
          </button>
        </div>
      </form>
      {announcer}
    </section>
  );
}
