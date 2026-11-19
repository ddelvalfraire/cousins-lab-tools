import { Select } from '@mantine/core';
import { useTimeout } from '@mantine/hooks';
import { useCallback, useId, useRef, useState } from 'react';
import {
  settings as declared,
  type SettingsSectionId,
  settingTarget,
  textSizeOptions,
  themeOptions,
} from '@/shared/config/search-registry';
import { Presence } from '@/shared/motion/Motion';
import type { AppearancePreference } from '@/shared/theme/appearance';
import type { TextSize } from '@/shared/theme/textSize';
import { Banner } from '@/shared/ui/Banner';
import { ReviewIcon } from '@/shared/ui/ReviewIcons';
import { chosen, selectAria } from '@/shared/ui/select';
import '@/shared/theme/Approved.css';
import './SettingsPage.css';

export type ThemePreference = AppearancePreference;
export type DecimalPreference = 'system' | 'point' | 'comma';
export type ColumnSeparator = 'comma' | 'semicolon' | 'tab';

export interface AppSettings {
  theme: ThemePreference;
  /** Size of all text, applied by the host as the root font size. */
  textSize: TextSize;
  decimal: DecimalPreference;
  /** Folder new recordings are saved in. */
  folder: string;
  /** Default column separator for exported CSV files. */
  delimiter: ColumnSeparator;
}
export type SettingKey = keyof AppSettings;

/** Build details embedded when the app is built; read offline. */
export interface BuildInfo {
  version: string;
  /** Full 40-character commit hash. */
  commit: string;
  /** Release tag such as `desktop-v0.1.0`, or null for a local build. */
  tag: string | null;
  /** True when the build had uncommitted changes. */
  dirty: boolean;
  built: string;
  platform: string;
  runtime: string;
  settingsFile: string;
  logs: string;
}

/** Folder picker state, owned by the host. */
export type FolderState =
  | { status: 'ready' }
  | { status: 'choosing' }
  | { status: 'error'; path: string };

export interface SettingsPageProps {
  settings: AppSettings;
  build: BuildInfo;
  folderState: FolderState;
  /** Separator the operating system uses, shown for "Match system". */
  systemDecimal?: 'point' | 'comma';
  /** Each change is saved immediately; there is no Save button. */
  onChange: <K extends SettingKey>(key: K, value: AppSettings[K]) => void;
  onChooseFolder: () => void;
  /** Receives the full hash. A rejected promise means the copy failed. */
  onCopyCommit: (commit: string) => void | Promise<void>;
  /** Leave out the card's own title, e.g. when the page's shared header names it. The Saved mark stays. */
  hideHeader?: boolean;
}

export const REPOSITORY_URL =
  'https://github.com/ddelvalfraire/cousins-lab-tools';
/** Field labels from the search registry, which also makes them searchable. */
const LABELS: Record<SettingKey, string> = {
  theme: declared.appearance.fields.theme.label,
  textSize: declared.appearance.fields.textSize.label,
  decimal: declared.numbers.fields.decimal.label,
  folder: declared.recordings.fields.folder.label,
  delimiter: declared.export.fields.delimiter.label,
};
const MARK_MS = 2400;

export function formatReading(value: number, separator: 'point' | 'comma') {
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return separator === 'comma'
    ? text.replace(/,/g, ' ').replace('.', ',')
    : text;
}

const versionMatchesTag = (build: BuildInfo) =>
  !build.tag || build.tag === `desktop-v${build.version}`;

/** Plain-text environment block for problem reports. */
export function aboutText(build: BuildInfo) {
  return [
    `DVDash ${build.version}`,
    `Commit ${build.commit}${build.dirty ? ' (uncommitted changes)' : ''}`,
    `Release ${build.tag ?? 'none (local build)'}`,
    `Built ${build.built}`,
    `Platform ${build.platform}`,
    `Runtime ${build.runtime}`,
    `Settings ${build.settingsFile}`,
    `Logs ${build.logs}`,
    ...(versionMatchesTag(build) ? [] : ['Note version and tag differ']),
  ].join('\n');
}

/** New GitHub issue prefilled with the bug label, a versioned title and the environment block. */
export function reportProblemUrl(build: BuildInfo) {
  const body = `## What happened\n\n\n## What you expected\n\n\n## Steps to reproduce\n1. \n\n## Environment\n\`\`\`\n${aboutText(build)}\n\`\`\`\n`;
  return `${REPOSITORY_URL}/issues/new?labels=bug&title=${encodeURIComponent(`DVDash ${build.version}: `)}&body=${encodeURIComponent(body)}`;
}

/** Application preferences. Each change saves immediately and shows a Saved mark. */
const SEPARATORS = [
  { value: 'comma', label: 'Comma' },
  { value: 'semicolon', label: 'Semicolon' },
  { value: 'tab', label: 'Tab' },
];

export function SettingsPage({
  settings,
  build,
  folderState,
  systemDecimal = 'point',
  onChange,
  onChooseFolder,
  onCopyCommit,
  hideHeader = false,
}: SettingsPageProps) {
  const id = useId();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const { start: startSavedMark, clear: clearSavedMark } = useTimeout(
    () => setSaved(false),
    MARK_MS,
  );
  const copiedMark = useTimeout(() => setCopied(false), MARK_MS);
  const frame = useRef(0);
  const previousSettings = useRef(settings);
  const chooseAgain = useRef<HTMLButtonElement>(null);
  const delimiterSelect = useRef<HTMLInputElement>(null);

  // Emptying the region first makes a repeated message announce again.
  const announce = useCallback((text: string) => {
    cancelAnimationFrame(frame.current);
    setAnnouncement('');
    frame.current = requestAnimationFrame(() => setAnnouncement(text));
  }, []);
  const cancelAnnouncementOnUnmount = useCallback(
    () => () => cancelAnimationFrame(frame.current),
    [],
  );

  // A setting counts as saved when the host hands back the new value, which can arrive after onChange returns. The
  // page's ref callback changes with `settings`, and React calls it once the new value has committed.
  const followSettings = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const changed = (Object.keys(LABELS) as SettingKey[]).filter(
        (key) => previousSettings.current[key] !== settings[key],
      );
      previousSettings.current = settings;
      if (!changed.length) return;
      setSaved(true);
      announce(`${LABELS[changed[changed.length - 1]]} saved.`);
      clearSavedMark();
      startSavedMark();
    },
    [settings, announce, clearSavedMark, startSavedMark],
  );

  // The host reports the system folder dialog's outcome, so no handler here runs when it arrives. This ref callback
  // sits on an ancestor of the error's Choose button, so React has attached the button's ref before calling it.
  const shownFolderStatus = useRef(folderState.status);
  const followFolder = useCallback(
    (node: HTMLElement | null) => {
      if (!node || shownFolderStatus.current === folderState.status) return;
      shownFolderStatus.current = folderState.status;
      if (folderState.status === 'choosing')
        announce('Choose a folder in the system dialog.');
      if (folderState.status === 'error') {
        chooseAgain.current?.focus();
        announce('That folder can’t be used. Still using the previous folder.');
      }
    },
    [folderState.status, announce],
  );

  const copyCommit = async () => {
    try {
      await onCopyCommit(build.commit);
    } catch {
      announce('Couldn’t copy the commit hash.');
      return;
    }
    setCopied(true);
    announce('Commit hash copied.');
    copiedMark.clear();
    copiedMark.start();
  };

  const decimal =
    settings.decimal === 'system' ? systemDecimal : settings.decimal;
  const conflict = decimal === 'comma' && settings.delimiter === 'comma';
  const choosing = folderState.status === 'choosing';
  const releaseUrl = build.tag
    ? `${REPOSITORY_URL}/releases/tag/${build.tag}`
    : null;
  const ids = {
    title: `${id}-title`,
    textSizeHint: `${id}-text-size-hint`,
    folder: `${id}-folder`,
    folderHint: `${id}-folder-hint`,
    decimal: `${id}-decimal`,
    decimalHint: `${id}-decimal-hint`,
    delimiter: `${id}-delimiter`,
    delimiterHint: `${id}-delimiter-hint`,
    exportMessage: `${id}-export-message`,
  };
  const section = (key: string) => `${id}-s-${key}`;
  /** A section's heading and lead from the registry. The heading takes focus when search opens the section. */
  const heading = (key: SettingsSectionId) => (
    <div>
      <h3 id={section(key)} data-search-focus="">
        {declared[key].label}
      </h3>
      <p className="dv-settings-lead">{declared[key].description}</p>
    </div>
  );

  return (
    <section
      ref={followSettings}
      className="dv-settings"
      data-header={hideHeader ? 'hidden' : undefined}
      aria-labelledby={hideHeader ? undefined : ids.title}
      aria-label={hideHeader ? 'Settings' : undefined}
    >
      {hideHeader ? (
        <>
          <h2 className="dv-settings-sr">Settings on this computer</h2>
          <span
            className="dv-settings-saved dv-settings-saved-corner"
            aria-hidden="true"
          >
            <Presence
              show={saved}
              variant="fade"
              className="dv-settings-saved-mark"
            >
              <ReviewIcon name="check" />
              Saved
            </Presence>
          </span>
        </>
      ) : (
        <header className="dv-settings-title">
          <div>
            <h2 id={ids.title}>Settings</h2>
            <p>Applies to everyone using DVDash on this computer.</p>
          </div>
          <span className="dv-settings-saved" aria-hidden="true">
            <Presence
              show={saved}
              variant="fade"
              className="dv-settings-saved-mark"
            >
              <ReviewIcon name="check" />
              Saved
            </Presence>
          </span>
        </header>
      )}
      <div className="dv-settings-content">
        <section
          className="dv-settings-section"
          aria-labelledby={section('appearance')}
          data-search-target={settingTarget('appearance')}
        >
          {heading('appearance')}
          <div className="dv-settings-fields">
            <fieldset data-search-target={settingTarget('appearance', 'theme')}>
              <legend>{LABELS.theme}</legend>
              <div className="dv-settings-segmented">
                {themeOptions.map((theme) => (
                  <label key={theme.value}>
                    <input
                      type="radio"
                      name={`${id}-theme`}
                      value={theme.value}
                      checked={settings.theme === theme.value}
                      onChange={() => onChange('theme', theme.value)}
                    />
                    {theme.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset
              data-search-target={settingTarget('appearance', 'textSize')}
              aria-describedby={ids.textSizeHint}
            >
              <legend>{LABELS.textSize}</legend>
              <div className="dv-settings-segmented dv-settings-text-size">
                {textSizeOptions.map((size) => (
                  <label key={size.value}>
                    <input
                      type="radio"
                      name={`${id}-text-size`}
                      value={size.value}
                      checked={settings.textSize === size.value}
                      onChange={() => onChange('textSize', size.value)}
                    />
                    {size.label}
                  </label>
                ))}
              </div>
              <div
                className="dv-settings-preview dv-settings-text-preview"
                data-testid="text-size-preview"
                aria-live="off"
              >
                <span>Example</span>
                <strong>
                  Leaf respiration · Sample 024 ·{' '}
                  {formatReading(-1234.56, decimal)} mV
                </strong>
              </div>
              <span className="dv-settings-hint" id={ids.textSizeHint}>
                Changes the size of all text in DVDash.
              </span>
            </fieldset>
          </div>
        </section>

        <section
          className="dv-settings-section"
          aria-labelledby={section('numbers')}
          data-search-target={settingTarget('numbers')}
        >
          {heading('numbers')}
          <div className="dv-settings-fields">
            <div
              className="dv-settings-field"
              data-search-target={settingTarget('numbers', 'decimal')}
            >
              <label htmlFor={ids.decimal}>{LABELS.decimal}</label>
              <Select
                id={ids.decimal}
                aria-label={LABELS.decimal}
                {...selectAria({ describedBy: ids.decimalHint })}
                value={settings.decimal}
                onChange={chosen((value) =>
                  onChange('decimal', value as DecimalPreference),
                )}
                data={[
                  { value: 'system', label: `Match system (${systemDecimal})` },
                  { value: 'point', label: 'Point · 1,234.56' },
                  { value: 'comma', label: 'Comma · 1 234,56' },
                ]}
              />
              <span className="dv-settings-hint" id={ids.decimalHint}>
                Number fields accept both a point and a comma, whatever is
                chosen here.
              </span>
            </div>
            <div className="dv-settings-preview" aria-live="off">
              <span>Example reading</span>
              <strong data-testid="number-preview">
                {formatReading(-1234.56, decimal)} mV
              </strong>
            </div>
          </div>
        </section>

        <section
          className="dv-settings-section"
          aria-labelledby={section('recordings')}
          data-search-target={settingTarget('recordings')}
        >
          {heading('recordings')}
          <div className="dv-settings-fields" ref={followFolder}>
            <div
              className="dv-settings-field"
              data-search-target={settingTarget('recordings', 'folder')}
            >
              <span id={ids.folder}>{LABELS.folder}</span>
              <div className="dv-settings-folder">
                <fieldset
                  className="dv-settings-path"
                  aria-labelledby={ids.folder}
                  data-testid="folder-path"
                >
                  <ReviewIcon name="folder" />
                  <span>{settings.folder}</span>
                </fieldset>
                <button
                  type="button"
                  className="dv-settings-button"
                  aria-describedby={ids.folderHint}
                  disabled={choosing}
                  onClick={onChooseFolder}
                >
                  {choosing ? 'Waiting for folder…' : 'Choose folder…'}
                </button>
              </div>
              <span className="dv-settings-hint" id={ids.folderHint}>
                Existing recordings stay where they are. Only new recordings use
                the new folder.
              </span>
            </div>
            <Presence
              show={folderState.status === 'error'}
              className="dv-settings-message"
            >
              {folderState.status === 'error' && (
                <Banner
                  severity="error"
                  messages={[
                    `DVDash can’t save recordings in ${folderState.path}. Still using ${settings.folder}.`,
                  ]}
                  action={
                    <button
                      type="button"
                      ref={chooseAgain}
                      className="dv-settings-fix"
                      onClick={onChooseFolder}
                    >
                      Choose another folder
                    </button>
                  }
                />
              )}
            </Presence>
          </div>
        </section>

        <section
          className="dv-settings-section"
          aria-labelledby={section('export')}
          data-search-target={settingTarget('export')}
        >
          {heading('export')}
          <div className="dv-settings-fields">
            <div
              className="dv-settings-field"
              data-search-target={settingTarget('export', 'delimiter')}
            >
              <label htmlFor={ids.delimiter}>{LABELS.delimiter}</label>
              <Select
                id={ids.delimiter}
                aria-label={LABELS.delimiter}
                ref={delimiterSelect}
                {...selectAria({
                  describedBy: `${ids.delimiterHint} ${ids.exportMessage}`,
                  invalid: conflict,
                })}
                value={settings.delimiter}
                data={SEPARATORS}
                onChange={chosen((value) =>
                  onChange('delimiter', value as ColumnSeparator),
                )}
              />
              <span className="dv-settings-hint" id={ids.delimiterHint}>
                Spreadsheets in regions that use a decimal comma usually expect
                semicolons.
              </span>
            </div>
            <div
              id={ids.exportMessage}
              className="dv-settings-message-slot"
              data-testid="export-message"
            >
              <Presence show={conflict}>
                <Banner
                  severity="warning"
                  messages={[
                    'Commas would separate both decimals and columns, so spreadsheets can misread values.',
                  ]}
                  action={
                    <button
                      type="button"
                      className="dv-settings-fix"
                      onClick={() => {
                        delimiterSelect.current?.focus();
                        onChange('delimiter', 'semicolon');
                      }}
                    >
                      Use semicolons
                    </button>
                  }
                />
              </Presence>
            </div>
          </div>
        </section>

        <section
          className="dv-settings-section"
          aria-labelledby={section('about')}
          data-search-target={settingTarget('about')}
        >
          {heading('about')}
          <div className="dv-settings-fields">
            <dl className="dv-settings-about" data-testid="about">
              <dt>Version</dt>
              <dd>
                {build.version}
                {build.version.includes('-') && (
                  <span className="dv-settings-muted"> · pre-release</span>
                )}
                {!versionMatchesTag(build) && (
                  <span className="dv-settings-warn" data-testid="version-note">
                    {' '}
                    · doesn’t match release tag
                  </span>
                )}
              </dd>
              <dt>Commit</dt>
              <dd>
                <code title={build.commit}>{build.commit.slice(0, 12)}</code>
                <button
                  type="button"
                  className="dv-settings-icon-button"
                  aria-label="Copy full commit hash"
                  onClick={copyCommit}
                >
                  <ReviewIcon name="copy" />
                </button>
                <span className="dv-settings-copied" aria-hidden="true">
                  <Presence
                    show={copied}
                    variant="fade"
                    className="dv-settings-copied-mark"
                  >
                    Copied
                  </Presence>
                </span>
                {build.dirty ? (
                  <span className="dv-settings-muted">
                    {' '}
                    · uncommitted changes
                  </span>
                ) : (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={`${REPOSITORY_URL}/commit/${build.commit}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View commit
                    </a>
                  </>
                )}
              </dd>
              <dt>Release</dt>
              <dd>
                {releaseUrl ? (
                  <a href={releaseUrl} target="_blank" rel="noreferrer">
                    {build.tag} on GitHub
                  </a>
                ) : (
                  <span className="dv-settings-muted">None · local build</span>
                )}
              </dd>
              <dt>Built</dt>
              <dd>{build.built}</dd>
              <dt>Platform</dt>
              <dd>{build.platform}</dd>
              <dt>Runtime</dt>
              <dd>{build.runtime}</dd>
              <dt>Settings file</dt>
              <dd>
                <code>{build.settingsFile}</code>
              </dd>
              <dt>Logs</dt>
              <dd>
                <code>{build.logs}</code>
              </dd>
            </dl>
            <div
              className="dv-settings-actions"
              data-search-target={settingTarget('about', 'report')}
            >
              <a
                className="dv-settings-button"
                href={reportProblemUrl(build)}
                target="_blank"
                rel="noreferrer"
              >
                <ReviewIcon name="external" />
                {declared.about.fields.report.label}
              </a>
            </div>
          </div>
        </section>
      </div>
      <div
        ref={cancelAnnouncementOnUnmount}
        className="dv-settings-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </section>
  );
}
