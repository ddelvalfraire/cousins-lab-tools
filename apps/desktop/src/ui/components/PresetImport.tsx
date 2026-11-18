import { useEffect, useRef, useState } from 'react';
import { Chip } from './Chip';
import {
  formatFileSize,
  ImportButton,
  ImportChooseButton,
  ImportDialog,
  ImportDropzone,
  ImportIcon,
  ImportProgressNote,
} from './ImportDialog';
import { Presence, Swap } from './Motion';
import { StatusBanner } from './Primitives';
import './PresetImport.css';

export type PresetTileKind =
  | 'line'
  | 'multi'
  | 'scatter'
  | 'table'
  | 'readout'
  | 'input';
/** A panel's place in the layout, in percent of the layout's width and height. */
export interface PresetTile {
  kind: PresetTileKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Miniature of a preset layout (.preset-thumb), from design/dvdash-field-review/preset-import-review.html. */
export function PresetThumbnail({
  layout,
  className,
}: {
  layout: readonly PresetTile[];
  className?: string;
}) {
  return (
    <span
      className={className ? `dv-preset-thumb ${className}` : 'dv-preset-thumb'}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 70" preserveAspectRatio="none">
        {layout.map(({ kind, x, y, w, h }, i) => {
          const height = h * 0.7;
          const inner =
            kind === 'line' || kind === 'multi' ? (
              <>
                <path
                  className="dv-preset-thumb-trace"
                  d={`M4 ${height * 0.6} Q ${w * 0.2} ${height * 0.2} ${w * 0.35} ${height * 0.5} T ${w * 0.65} ${height * 0.55} T ${w - 4} ${height * 0.35}`}
                />
                {kind === 'multi' && (
                  <path
                    className="dv-preset-thumb-trace-alt"
                    d={`M4 ${height * 0.35} Q ${w * 0.35} ${height * 0.8} ${w - 4} ${height * 0.55}`}
                  />
                )}
              </>
            ) : kind === 'scatter' ? (
              <>
                <path
                  className="dv-preset-thumb-trace-alt"
                  d={`M5 ${height - 5} L${w - 5} 5`}
                />
                {[
                  [0.2, 0.7],
                  [0.35, 0.63],
                  [0.5, 0.47],
                  [0.68, 0.3],
                  [0.83, 0.24],
                ].map(([a, b]) => (
                  <circle
                    key={a}
                    cx={w * a}
                    cy={height * b}
                    r="1.2"
                    fill="var(--dv-blue)"
                  />
                ))}
              </>
            ) : kind === 'table' ? (
              <path
                d={`M3 7h${w - 6}m-${w - 6} 6h${w - 6}m-${w - 6} 6h${w - 6}`}
                stroke="var(--dv-line)"
                strokeWidth="1"
              />
            ) : kind === 'readout' ? (
              <>
                <rect
                  x="5"
                  y={height * 0.35}
                  width={w * 0.35}
                  height="3"
                  rx="1"
                  fill="var(--dv-ink)"
                  opacity=".45"
                />
                <rect
                  x="5"
                  y={height * 0.62}
                  width={w * 0.6}
                  height="1"
                  fill="var(--dv-line)"
                />
              </>
            ) : (
              <rect
                x="4"
                y={height * 0.3}
                width={w - 8}
                height={height * 0.45}
                rx="1.5"
                fill="var(--dv-soft)"
                stroke="var(--dv-line)"
                strokeWidth=".5"
              />
            );
          return (
            <g key={i} transform={`translate(${x} ${y * 0.7})`}>
              <rect
                className="dv-preset-thumb-tile"
                x="0.5"
                y="0.5"
                width={w - 1}
                height={height - 1}
                rx="2"
              />
              {inner}
            </g>
          );
        })}
      </svg>
    </span>
  );
}

export interface PresetDefinitionSummary {
  name: string;
  description: string;
  /** Revision of the preset in the catalog it came from. */
  sourceRevision: number;
  layout: readonly PresetTile[];
  routines: readonly { name: string; revision: number; steps: number }[];
  /** Instruments the preset needs, with the signals it reads from each. */
  roles: readonly { name: string; count: number; signals: readonly string[] }[];
}
export interface PresetFile {
  name: string;
  size: number;
}
/**
 * `choose`: no file. `checking`: validating the chosen file. `invalid`: it can't be imported.
 * `ready`: valid, not reviewed yet. `review`: naming the preset. `importing`, `done`, `failed`.
 */
export type PresetImportPhase =
  | 'choose'
  | 'checking'
  | 'invalid'
  | 'ready'
  | 'review'
  | 'importing'
  | 'done'
  | 'failed';

export interface PresetImportDialogProps {
  opened: boolean;
  phase: PresetImportPhase;
  file?: PresetFile;
  definition?: PresetDefinitionSummary;
  /** Why the file can't be imported (`invalid`). One reason is shown as a sentence, several as a list. */
  problems?: readonly string[];
  /** Name for the imported preset. */
  name: string;
  /** A preset with the definition's name already exists; the import becomes a separate copy. */
  nameTaken?: boolean;
  accept?: string;
  onChooseFile: (file: File) => void;
  onNameChange: (name: string) => void;
  onReview: () => void;
  onBack: () => void;
  onImport: () => void;
  onImportAnother: () => void;
  onClose: () => void;
}

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

function DefinitionOverview({
  definition,
  title,
}: {
  definition: PresetDefinitionSummary;
  title: string;
}) {
  return (
    <div className="dv-preset-import-overview">
      <PresetThumbnail layout={definition.layout} />
      <div className="dv-preset-import-identity">
        <h3>{title}</h3>
        <p>{definition.description}</p>
        <div className="dv-preset-import-chips">
          <Chip icon={<ImportIcon name="panels" />}>
            {plural(definition.layout.length, 'panel')}
          </Chip>
          <Chip icon={<ImportIcon name="revisions" />}>
            Source R{definition.sourceRevision}
          </Chip>
        </div>
      </div>
    </div>
  );
}

/**
 * Imports a preset definition file: choose a file, wait for it to be checked, review what it contains
 * and name it, then add it. Instruments are assigned later, when the preset is used.
 * Values from design/dvdash-field-review/preset-import-review.html.
 */
export function PresetImportDialog({
  opened,
  phase,
  file,
  definition,
  problems = [],
  name,
  nameTaken = false,
  accept = '.json',
  onChooseFile,
  onNameChange,
  onReview,
  onBack,
  onImport,
  onImportAnother,
  onClose,
}: PresetImportDialogProps) {
  const reviewing =
    phase === 'review' || phase === 'importing' || phase === 'failed';
  const importing = phase === 'importing';
  const choose = (files: File[]) => {
    if (files[0]) onChooseFile(files[0]);
  };

  const footerStart = reviewing ? (
    <ImportButton variant="quiet" disabled={importing} onClick={onBack}>
      Back
    </ImportButton>
  ) : phase === 'done' ? (
    <ImportButton variant="quiet" onClick={onImportAnother}>
      Import another
    </ImportButton>
  ) : undefined;
  const actions =
    phase === 'done' ? (
      <ImportButton onClick={onClose}>Done</ImportButton>
    ) : (
      <>
        <ImportButton variant="quiet" disabled={importing} onClick={onClose}>
          Cancel
        </ImportButton>
        {phase !== 'choose' &&
          (reviewing ? (
            <ImportButton
              disabled={importing || !name.trim()}
              onClick={onImport}
            >
              {importing
                ? 'Importing preset…'
                : phase === 'failed'
                  ? 'Try again'
                  : 'Import preset'}
            </ImportButton>
          ) : (
            <ImportButton disabled={phase !== 'ready'} onClick={onReview}>
              Review preset
            </ImportButton>
          ))}
      </>
    );

  return (
    <ImportDialog
      opened={opened}
      onClose={onClose}
      busy={importing}
      closeLabel="Close import dialog"
      bodyMaxHeight={620}
      title={phase === 'done' ? 'Preset imported' : 'Import preset'}
      description="Add a reusable experiment layout."
      steps={phase === 'done' ? undefined : ['File', 'Review']}
      step={reviewing ? 1 : 0}
      footerStart={footerStart}
      actions={actions}
    >
      <Swap
        swapKey={
          phase === 'choose' || phase === 'done'
            ? phase
            : reviewing
              ? 'review'
              : 'file'
        }
      >
        {phase !== 'done' && file && (
          <div className="dv-preset-import-file">
            <ImportIcon name="file" />
            <span>
              {file.name} · {formatFileSize(file.size)}
            </span>
          </div>
        )}
        {phase === 'choose' && (
          <ImportDropzone
            title="Drop a preset definition here"
            hint="Choose a file from your computer."
            action="Choose file"
            accept={accept}
            onFiles={choose}
          />
        )}
        <Presence show={phase === 'checking'}>
          <ImportProgressNote
            title="Checking file…"
            detail="Validating the definition and its references."
          />
        </Presence>
        <Presence show={phase === 'invalid'}>
          <div className="dv-preset-import-feedback">
            <StatusBanner severity="error" announce>
              {problems.length > 1 ? (
                <>
                  <span>This definition can’t be imported.</span>
                  <ul className="dv-preset-import-problems">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </>
              ) : (
                `This definition can’t be imported. ${problems[0] ?? ''}`.trim()
              )}
            </StatusBanner>
          </div>
        </Presence>
        <Presence show={phase === 'ready' && !!definition}>
          {definition && (
            <div className="dv-preset-import-ready">
              <div className="dv-preset-import-chips">
                <Chip icon={<ImportIcon name="panels" />}>
                  {plural(definition.layout.length, 'panel')}
                </Chip>
                <Chip icon={<ImportIcon name="revisions" />}>
                  Source R{definition.sourceRevision}
                </Chip>
              </div>
            </div>
          )}
        </Presence>
        {(phase === 'checking' || phase === 'invalid' || phase === 'ready') && (
          <ImportChooseButton
            label="Replace file"
            accept={accept}
            onFiles={choose}
          />
        )}

        {phase === 'done' && definition && (
          <>
            <div className="dv-preset-import-feedback">
              <StatusBanner announce>
                Preset added to your catalog.
              </StatusBanner>
            </div>
            <DefinitionOverview definition={definition} title={name} />
          </>
        )}
        {reviewing && definition && (
          <>
            <Presence show={phase === 'failed'}>
              <div className="dv-preset-import-feedback">
                <StatusBanner severity="error" announce>
                  Couldn’t add the preset. Try again.
                </StatusBanner>
              </div>
            </Presence>
            <Presence show={phase !== 'failed' && nameTaken}>
              <div className="dv-preset-import-feedback">
                <StatusBanner severity="warning">
                  A preset with the original name already exists. A separate
                  copy will be added.
                </StatusBanner>
              </div>
            </Presence>
            <DefinitionOverview
              definition={definition}
              title={name.trim() || definition.name}
            />
            <label className="dv-preset-import-name">
              Preset name
              <input
                value={name}
                disabled={importing}
                onChange={(event) => onNameChange(event.currentTarget.value)}
              />
            </label>
            {definition.routines.length > 0 && (
              <section className="dv-preset-import-section">
                <h4>
                  {definition.routines.length === 1
                    ? 'Included routine'
                    : 'Included routines'}
                </h4>
                {definition.routines.map((routine) => (
                  <div key={routine.name} className="dv-preset-import-routine">
                    <div>
                      <strong>{routine.name}</strong>
                      <div className="dv-preset-import-chips">
                        <Chip icon={<ImportIcon name="revisions" />}>
                          R{routine.revision}
                        </Chip>
                        <Chip icon={<ImportIcon name="panels" />}>
                          {plural(routine.steps, 'step')}
                        </Chip>
                      </div>
                    </div>
                    <span className="dv-preset-import-included">
                      <ImportIcon name="check" />
                      Included
                    </span>
                  </div>
                ))}
              </section>
            )}
            {definition.roles.length > 0 && (
              <section className="dv-preset-import-section">
                <h4>Required signals</h4>
                {definition.roles.map((role) => (
                  <div key={role.name} className="dv-preset-import-role-group">
                    <div className="dv-preset-import-role">
                      <strong>{role.name}</strong>
                      <span>{plural(role.count, 'instrument role')}</span>
                    </div>
                    <div className="dv-preset-import-role-signals">
                      {role.signals.map((signal) => (
                        <Chip key={signal}>{signal}</Chip>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="dv-preset-import-info">
                  <StatusBanner>
                    Assign instruments when using the preset.
                  </StatusBanner>
                </div>
              </section>
            )}
          </>
        )}
      </Swap>
    </ImportDialog>
  );
}

export type PresetFileCheck =
  | {
      valid: true;
      definition: PresetDefinitionSummary;
      nameTaken?: boolean;
      suggestedName?: string;
    }
  | { valid: false; problems: readonly string[] };
export interface PresetImportProps {
  opened: boolean;
  onClose: () => void;
  /** Reads and validates the chosen file. */
  checkFile: (file: File) => Promise<PresetFileCheck>;
  /** Adds the preset under `name`. Reject to show the failure. */
  importPreset: (
    definition: PresetDefinitionSummary,
    name: string,
  ) => Promise<void>;
}

/** `PresetImportDialog` with its own state: checks the file, then imports it. */
export function PresetImport({
  opened,
  onClose,
  checkFile,
  importPreset,
}: PresetImportProps) {
  const [phase, setPhase] = useState<PresetImportPhase>('choose');
  const [file, setFile] = useState<PresetFile>();
  const [check, setCheck] = useState<PresetFileCheck>();
  const [name, setName] = useState('');
  const attempt = useRef(0);
  const reset = () => {
    attempt.current += 1;
    setPhase('choose');
    setFile(undefined);
    setCheck(undefined);
    setName('');
  };
  useEffect(() => {
    if (!opened) reset();
  }, [opened]);

  const choose = async (chosen: File) => {
    const id = ++attempt.current;
    setFile({ name: chosen.name, size: chosen.size });
    setPhase('checking');
    const result = await checkFile(chosen).catch(
      (): PresetFileCheck => ({
        valid: false,
        problems: ['The file couldn’t be read.'],
      }),
    );
    if (id !== attempt.current) return;
    setCheck(result);
    if (result.valid) setName(result.suggestedName ?? result.definition.name);
    setPhase(result.valid ? 'ready' : 'invalid');
  };
  const add = async () => {
    if (!check?.valid) return;
    setPhase('importing');
    try {
      await importPreset(check.definition, name.trim());
      setPhase('done');
    } catch {
      setPhase('failed');
    }
  };

  return (
    <PresetImportDialog
      opened={opened}
      phase={phase}
      file={file}
      definition={check?.valid ? check.definition : undefined}
      problems={check && !check.valid ? check.problems : []}
      name={name}
      nameTaken={check?.valid ? check.nameTaken : false}
      onChooseFile={(chosen) => {
        void choose(chosen);
      }}
      onNameChange={setName}
      onReview={() => setPhase('review')}
      onBack={() => setPhase('ready')}
      onImport={() => {
        void add();
      }}
      onImportAnother={reset}
      onClose={onClose}
    />
  );
}
