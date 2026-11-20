import { Select } from '@mantine/core';
import { useId, useRef, useState } from 'react';
import { MotionList, Presence, Swap } from '@/shared/motion/Motion';
import { Chip } from '@/shared/ui/Chip';
import {
  formatDuration,
  formatFileSize,
  ImportButton,
  ImportChooseButton,
  ImportDialog,
  ImportDropzone,
  ImportFooterNote,
  ImportIcon,
  ImportProgress,
  ImportStatus,
} from '@/shared/ui/ImportDialog';
import { StatusBanner } from '@/shared/ui/Primitives';
import { chosen } from '@/shared/ui/select';
import { useResetOnClose } from './useResetOnClose';
import './RecordingImport.css';

export interface RecordingChannel {
  name: string;
  unit: string;
}
export type RecordingFileStatus =
  | 'ready'
  | 'error'
  | 'importing'
  | 'imported'
  | 'failed';
export interface RecordingFile {
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  /** Recorded length in seconds, once the file has been read. */
  duration?: number;
  channels?: readonly RecordingChannel[];
  status: RecordingFileStatus;
  /** Why the file can't be imported (`error`), or why importing it failed (`failed`). */
  problem?: string;
}
export interface RecordingPresetOption {
  id: string;
  label: string;
}
/** `select`: choosing files. `review`: naming experiments and choosing a preset. */
export type RecordingImportPhase =
  | 'select'
  | 'review'
  | 'importing'
  | 'done'
  | 'failed';

export interface RecordingImportDialogProps {
  opened: boolean;
  phase: RecordingImportPhase;
  files: readonly RecordingFile[];
  /** Experiment name for each file id. */
  names: Readonly<Record<string, string>>;
  presets: readonly RecordingPresetOption[];
  presetId: string;
  accept?: string;
  onChooseFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onPresetChange: (id: string) => void;
  onReview: () => void;
  onBack: () => void;
  onImport: () => void;
  onStop: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const PRESET_LABEL = 'Open with preset';
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
const statusWord: Record<RecordingFileStatus, string> = {
  ready: 'Ready',
  error: 'Needs attention',
  importing: 'Importing…',
  imported: 'Imported',
  failed: 'Failed',
};

/**
 * Imports recorded files as experiments: choose files, review names and the preset, then import.
 * Files that can't be read are listed together and must be removed before review.
 */
export function RecordingImportDialog({
  opened,
  phase,
  files,
  names,
  presets,
  presetId,
  accept = '.csv,.json',
  onChooseFiles,
  onRemoveFile,
  onNameChange,
  onPresetChange,
  onReview,
  onBack,
  onImport,
  onStop,
  onRetry,
  onClose,
}: RecordingImportDialogProps) {
  const ready = files.filter((file) => file.status === 'ready'),
    presetLabel = useId();
  const invalid = files.filter((file) => file.status === 'error');
  const imported = files.filter((file) => file.status === 'imported').length;
  const failed = files.filter((file) => file.status === 'failed').length;
  const working =
    phase === 'importing' || phase === 'done' || phase === 'failed';
  const editable = phase === 'select' || phase === 'review';
  const canReview = ready.length > 0 && invalid.length === 0;
  const totalDuration = ready.reduce(
    (sum, file) => sum + (file.duration ?? 0),
    0,
  );

  const footerStart =
    phase === 'review' ? (
      <ImportButton variant="quiet" onClick={onBack}>
        Back
      </ImportButton>
    ) : phase === 'select' ? (
      <ImportFooterNote>
        {files.length ? `${plural(files.length, 'file')} selected` : ''}
      </ImportFooterNote>
    ) : phase === 'importing' ? (
      <ImportFooterNote>Importing recordings…</ImportFooterNote>
    ) : phase === 'failed' && imported > 0 ? (
      <ImportFooterNote>{imported} already imported</ImportFooterNote>
    ) : undefined;
  const actions =
    phase === 'select' ? (
      <>
        <ImportButton variant="quiet" onClick={onClose}>
          Cancel
        </ImportButton>
        <ImportButton disabled={!canReview} onClick={onReview}>
          Review{' '}
          {ready.length ? plural(ready.length, 'recording') : 'recordings'}
        </ImportButton>
      </>
    ) : phase === 'review' ? (
      <>
        <ImportButton variant="quiet" onClick={onClose}>
          Cancel
        </ImportButton>
        <ImportButton
          disabled={!canReview}
          onClick={(event) => {
            event.currentTarget
              .closest('[role="dialog"]')
              ?.querySelector<HTMLElement>('.dv-import-body')
              ?.focus({ preventScroll: true });
            onImport();
          }}
        >
          Import {plural(ready.length, 'recording')}
        </ImportButton>
      </>
    ) : phase === 'importing' ? (
      <ImportButton variant="quiet" onClick={onStop}>
        Stop import
      </ImportButton>
    ) : phase === 'done' ? (
      <ImportButton onClick={onClose}>Done</ImportButton>
    ) : (
      <>
        <ImportButton variant="quiet" onClick={onClose}>
          Close
        </ImportButton>
        <ImportButton onClick={onRetry}>
          Retry failed {failed === 1 ? 'recording' : 'recordings'}
        </ImportButton>
      </>
    );

  return (
    <ImportDialog
      opened={opened}
      onClose={onClose}
      busy={phase === 'importing'}
      closeLabel="Close import dialog"
      title={phase === 'done' ? 'Recordings imported' : 'Import recordings'}
      description="Create experiments from saved recordings."
      steps={editable ? ['Files', 'Review'] : undefined}
      step={phase === 'review' ? 1 : 0}
      footerStart={footerStart}
      actions={actions}
    >
      <Swap
        swapKey={
          editable ? `${phase}:${files.length ? 'files' : 'empty'}` : 'working'
        }
      >
        <Presence show={phase === 'select' && invalid.length > 0}>
          {invalid.length > 0 && (
            <div className="dv-recording-import-feedback">
              <StatusBanner severity="error" announce>
                {invalid.length === 1 ? (
                  <>
                    <strong>{invalid[0].name}:</strong> {invalid[0].problem}
                  </>
                ) : (
                  <>
                    <span>{invalid.length} files need attention.</span>
                    <ul className="dv-recording-import-problems">
                      {invalid.map((file) => (
                        <li key={file.id}>
                          <strong>{file.name}:</strong> {file.problem}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </StatusBanner>
            </div>
          )}
        </Presence>
        <Presence show={phase === 'done'}>
          <div className="dv-recording-import-feedback">
            <StatusBanner announce>
              {plural(imported, 'recording')} imported.
            </StatusBanner>
          </div>
        </Presence>
        <Presence show={phase === 'failed'}>
          <div className="dv-recording-import-feedback">
            <StatusBanner severity="error" announce>
              {failed === 1
                ? '1 recording couldn’t be imported.'
                : `${failed} recordings couldn’t be imported.`}
            </StatusBanner>
          </div>
        </Presence>
        {phase === 'review' && (
          <div className="dv-recording-import-summary">
            <Chip icon={<ImportIcon name="details" />}>
              {plural(ready.length, 'recording')}
            </Chip>
            {totalDuration > 0 && (
              <Chip icon={<ImportIcon name="clock" />}>
                {formatDuration(totalDuration)} total
              </Chip>
            )}
          </div>
        )}
        {working && (
          <ImportProgress
            label={`${imported} of ${plural(files.length, 'recording')} imported`}
            done={imported}
            total={files.length}
          />
        )}
        {phase === 'select' && files.length === 0 ? (
          <ImportDropzone
            title="Drop recordings here"
            hint="Choose one or more files from your computer."
            action="Choose files"
            accept={accept}
            multiple
            onFiles={onChooseFiles}
          />
        ) : (
          <ul className="dv-recording-import-files">
            <MotionList>
              {files.map((file) => (
                <li
                  key={file.id}
                  className="dv-recording-import-file"
                  data-removable={editable}
                >
                  <span className="dv-recording-import-file-icon">
                    <ImportIcon name="file" />
                  </span>
                  <div>
                    <div className="dv-recording-import-file-top">
                      <h3 className="dv-recording-import-file-name">
                        {file.name}
                      </h3>
                      <ImportStatus
                        tone={
                          file.status === 'error' || file.status === 'failed'
                            ? 'error'
                            : file.status === 'importing'
                              ? 'busy'
                              : 'normal'
                        }
                      >
                        {statusWord[file.status]}
                      </ImportStatus>
                    </div>
                    <div className="dv-recording-import-meta">
                      <span>{formatFileSize(file.size)}</span>
                      {file.duration !== undefined && (
                        <Chip icon={<ImportIcon name="clock" />}>
                          {formatDuration(file.duration)}
                        </Chip>
                      )}
                      {file.channels && file.channels.length > 0 && (
                        <Chip icon={<ImportIcon name="signals" />}>
                          {plural(file.channels.length, 'channel')}
                        </Chip>
                      )}
                    </div>
                    {phase === 'review' && (
                      <>
                        <label className="dv-recording-import-name">
                          Experiment name
                          <input
                            value={names[file.id] ?? ''}
                            aria-label={`Experiment name for ${file.name}`}
                            onChange={(event) =>
                              onNameChange(file.id, event.currentTarget.value)
                            }
                          />
                        </label>
                        {file.channels && file.channels.length > 0 && (
                          <ul
                            className="dv-recording-import-channels"
                            aria-label={`Channels in ${file.name}`}
                          >
                            {file.channels.map((channel) => (
                              <li key={channel.name}>
                                <Chip>
                                  {channel.name} · {channel.unit}
                                </Chip>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {file.status === 'failed' && file.problem && (
                      <p className="dv-recording-import-note">{file.problem}</p>
                    )}
                  </div>
                  {editable && (
                    <button
                      type="button"
                      className="dv-import-close"
                      aria-label={`Remove ${file.name}`}
                      title="Remove file"
                      onClick={(event) => {
                        event.currentTarget
                          .closest<HTMLElement>('[role="region"]')
                          ?.focus({ preventScroll: true });
                        onRemoveFile(file.id);
                      }}
                    >
                      <ImportIcon name="close" />
                    </button>
                  )}
                </li>
              ))}
            </MotionList>
          </ul>
        )}
        {phase === 'select' && files.length > 0 && (
          <ImportChooseButton
            label="Add files"
            accept={accept}
            multiple
            onFiles={onChooseFiles}
          />
        )}
        {phase === 'review' && (
          <label className="dv-recording-import-preset">
            <span id={presetLabel}>{PRESET_LABEL}</span>
            <Select
              aria-labelledby={presetLabel}
              aria-label={PRESET_LABEL}
              value={presetId}
              data={presets.map((preset) => ({
                value: preset.id,
                label: preset.label,
              }))}
              onChange={chosen(onPresetChange)}
            />
            <small>Each recording becomes a separate experiment.</small>
          </label>
        )}
      </Swap>
    </ImportDialog>
  );
}

export interface RecordingImportRequest {
  files: readonly RecordingFile[];
  names: Readonly<Record<string, string>>;
  presetId: string;
}
export interface RecordingImportProps {
  opened: boolean;
  onClose: () => void;
  presets: readonly RecordingPresetOption[];
  /** Reads a chosen file. Resolve with its details, or with `status: 'error'` and a `problem`. */
  readFile: (file: File) => Promise<RecordingFile>;
  /** Imports one reviewed file as an experiment. Reject to mark it failed. */
  importFile: (
    file: RecordingFile,
    name: string,
    presetId: string,
  ) => Promise<void>;
  /** Suggested experiment name for a file. */
  suggestName?: (file: RecordingFile) => string;
}

const defaultName = (file: RecordingFile) => file.name.replace(/\.[^.]+$/, '');

/** `RecordingImportDialog` with its own state, reading files and importing them one at a time. */
export function RecordingImport({
  opened,
  onClose,
  presets,
  readFile,
  importFile,
  suggestName = defaultName,
}: RecordingImportProps) {
  const [phase, setPhase] = useState<RecordingImportPhase>('select');
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const stopped = useRef(false);
  useResetOnClose(opened, () => {
    setPhase('select');
    setFiles([]);
    setNames({});
  });

  const choose = async (chosen: File[]) => {
    const read = await Promise.all(
      chosen.map((file) =>
        readFile(file).catch(
          (): RecordingFile => ({
            id: `${file.name}-${file.lastModified}`,
            name: file.name,
            size: file.size,
            status: 'error',
            problem: 'This file couldn’t be read.',
          }),
        ),
      ),
    );
    setFiles((current) => [
      ...current,
      ...read.filter(
        (file) => !current.some((existing) => existing.id === file.id),
      ),
    ]);
    setNames((current) => ({
      ...Object.fromEntries(read.map((file) => [file.id, suggestName(file)])),
      ...current,
    }));
  };
  const run = async (queue: RecordingFile[]) => {
    stopped.current = false;
    setPhase('importing');
    let failures = 0;
    for (const file of queue) {
      if (stopped.current) break;
      setFiles((current) =>
        current.map((item) =>
          item.id === file.id
            ? { ...item, status: 'importing', problem: undefined }
            : item,
        ),
      );
      try {
        await importFile(
          file,
          names[file.id]?.trim() || suggestName(file),
          presetId,
        );
        setFiles((current) =>
          current.map((item) =>
            item.id === file.id ? { ...item, status: 'imported' } : item,
          ),
        );
      } catch {
        failures += 1;
        setFiles((current) =>
          current.map((item) =>
            item.id === file.id
              ? {
                  ...item,
                  status: 'failed',
                  problem: 'Couldn’t save this recording. Try again.',
                }
              : item,
          ),
        );
      }
    }
    setPhase(stopped.current ? 'review' : failures ? 'failed' : 'done');
  };
  const stop = () => {
    stopped.current = true;
    setFiles((current) =>
      current.map((item) =>
        item.status === 'importing' ? { ...item, status: 'ready' } : item,
      ),
    );
  };

  return (
    <RecordingImportDialog
      opened={opened}
      phase={phase}
      files={files}
      names={names}
      presets={presets}
      presetId={presetId}
      onChooseFiles={(chosen) => {
        void choose(chosen);
      }}
      onRemoveFile={(id) =>
        setFiles((current) => current.filter((file) => file.id !== id))
      }
      onNameChange={(id, name) =>
        setNames((current) => ({ ...current, [id]: name }))
      }
      onPresetChange={setPresetId}
      onReview={() => setPhase('review')}
      onBack={() => setPhase('select')}
      onImport={() => {
        void run(files.filter((file) => file.status === 'ready'));
      }}
      onStop={stop}
      onRetry={() => {
        void run(files.filter((file) => file.status === 'failed'));
      }}
      onClose={onClose}
    />
  );
}
