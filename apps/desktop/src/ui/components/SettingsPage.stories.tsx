import { useTimeout } from '@mantine/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { settleMotion } from '../../../.storybook/settleMotion';
import {
  type AppSettings,
  type BuildInfo,
  type FolderState,
  SettingsPage,
  type SettingsPageProps,
} from './SettingsPage';
import { useResettingCopy } from './useResettingCopy';

const COMMIT_RELEASE = 'fdba48e6d504efa8b66f04b0dd8ea7f892fd4a6b';
const COMMIT_LOCAL = 'a63f1dcebf65218c1c6a34257327a9c426903f73';
const environment = {
  platform: 'macOS 15.1 (arm64)',
  runtime: 'Tauri 2.12.5 · WebKit 620.1',
  settingsFile: '~/Library/Application Support/DVDash/settings.json',
  logs: '~/Library/Logs/DVDash',
};
const builds = {
  release: {
    version: '0.1.0-rc.2',
    commit: COMMIT_RELEASE,
    tag: 'desktop-v0.1.0-rc.2',
    dirty: false,
    built: '2026-11-02 02:54 UTC',
    ...environment,
  },
  mismatch: {
    version: '0.1.0',
    commit: COMMIT_RELEASE,
    tag: 'desktop-v0.1.0-rc.2',
    dirty: false,
    built: '2026-11-02 02:54 UTC',
    ...environment,
  },
  local: {
    version: '0.1.0',
    commit: COMMIT_LOCAL,
    tag: null,
    dirty: false,
    built: '2026-11-06 14:12 PST',
    ...environment,
  },
  dirty: {
    version: '0.1.0',
    commit: COMMIT_LOCAL,
    tag: null,
    dirty: true,
    built: '2026-11-06 14:12 PST',
    ...environment,
  },
} satisfies Record<string, BuildInfo>;
const defaults: AppSettings = {
  theme: 'system',
  textSize: 'default',
  decimal: 'system',
  folder: '~/Documents/DVDash/Recordings',
  delimiter: 'comma',
};
const CHOSEN_FOLDER = '~/Lab data/DVDash recordings';
const UNWRITABLE_FOLDER = '/Volumes/Instrument Share';

/** What the simulated system folder dialog returns. Nothing is read or written. */
type FolderOutcome = 'chosen' | 'unwritable';

/** Stands in for the host: stores each change and answers the folder dialog after a short delay. */
function SettingsHost({
  outcome,
  ...props
}: SettingsPageProps & { outcome: FolderOutcome }) {
  const [settings, setSettings] = useResettingCopy(props.settings);
  const [folderState, setFolderState] = useResettingCopy<FolderState>(
    props.folderState,
  );
  const folderDialog = useTimeout(() => {
    if (outcome === 'unwritable')
      return setFolderState({ status: 'error', path: UNWRITABLE_FOLDER });
    setSettings((current) => ({ ...current, folder: CHOSEN_FOLDER }));
    setFolderState({ status: 'ready' });
  }, 400);
  return (
    <SettingsPage
      {...props}
      settings={settings}
      folderState={folderState}
      onChange={(key, value) => {
        props.onChange(key, value);
        setSettings((current) => ({ ...current, [key]: value }));
      }}
      onChooseFolder={() => {
        props.onChooseFolder();
        setFolderState({ status: 'choosing' });
        folderDialog.start();
      }}
    />
  );
}

const meta = {
  title: 'Components/SettingsPage',
  component: SettingsPage,
  tags: ['autodocs'],
  args: {
    settings: defaults,
    build: builds.release,
    folderState: { status: 'ready' },
    systemDecimal: 'point',
    onChange: fn(),
    onChooseFolder: fn(),
    onCopyCommit: fn(),
  },
  parameters: { layout: 'padded', previewWidth: 800, folderOutcome: 'chosen' },
  render: (args, { parameters }) => (
    <SettingsHost
      {...args}
      outcome={parameters.folderOutcome as FolderOutcome}
    />
  ),
} satisfies Meta<typeof SettingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const about = (canvasElement: HTMLElement) =>
  within(canvasElement.querySelector('[data-testid="about"]') as HTMLElement);
const reportBody = (canvasElement: HTMLElement) => {
  const href = within(canvasElement)
    .getByRole('link', { name: 'Report a problem' })
    .getAttribute('href')!;
  return { href, body: new URL(href).searchParams.get('body')! };
};

/** As the page opens: nothing saved yet, no messages. */
export const Defaults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('radio', { name: 'Match system' }),
    ).toBeChecked();
    await expect(canvas.queryByText('Saved')).toBeNull();
    await expect(canvas.getByTestId('number-preview')).toHaveTextContent(
      '-1,234.56 mV',
    );
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(
      canvasElement.querySelector('[data-testid="about"] dd'),
    ).toHaveTextContent('0.1.0-rc.2 · pre-release');
  },
};

/** Changes save immediately; the folder picker waits; the About details copy and report. */
export const SavingChanges: Story = {
  play: async ({ canvasElement, args, step }) => {
    const canvas = within(canvasElement);
    await step('Each change saves immediately and is announced', async () => {
      await userEvent.click(canvas.getByRole('radio', { name: 'Dark' }));
      await expect(args.onChange).toHaveBeenCalledWith('theme', 'dark');
      await waitFor(() => expect(canvas.getByText('Saved')).toBeVisible(), {
        timeout: 10000,
      });
      await waitFor(() =>
        expect(canvas.getByRole('status')).toHaveTextContent('Theme saved.'),
      );
      await expect(
        canvas.getByRole('radio', { name: 'Default' }),
      ).toBeChecked();
      await userEvent.click(canvas.getByRole('radio', { name: 'Larger' }));
      await expect(args.onChange).toHaveBeenCalledWith('textSize', 'larger');
      await expect(canvas.getByRole('radio', { name: 'Larger' })).toBeChecked();
      await waitFor(() =>
        expect(canvas.getByRole('status')).toHaveTextContent(
          'Text size saved.',
        ),
      );
      await expect(canvas.getByTestId('text-size-preview')).toHaveTextContent(
        '-1,234.56 mV',
      );
      await chooseOption(canvas.getByLabelText('Decimal separator'), 'comma');
      await expect(canvas.getByTestId('number-preview')).toHaveTextContent(
        '-1 234,56 mV',
      );
    });
    await step('Choosing a folder waits, then replaces the path', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: 'Choose folder…' }),
      );
      await expect(args.onChooseFolder).toHaveBeenCalledOnce();
      await expect(
        canvas.getByRole('button', { name: 'Waiting for folder…' }),
      ).toBeDisabled();
      await waitFor(() =>
        expect(canvas.getByTestId('folder-path')).toHaveTextContent(
          CHOSEN_FOLDER,
        ),
      );
      await expect(
        canvas.getByRole('button', { name: 'Choose folder…' }),
      ).toBeEnabled();
    });
    await step('About links the release and commit', async () => {
      await expect(
        canvasElement.querySelector('[data-testid="about"] dd'),
      ).toHaveTextContent('0.1.0-rc.2 · pre-release');
      await expect(
        about(canvasElement).getByText('fdba48e6d504'),
      ).toBeVisible();
      await expect(
        canvas.getByRole('link', { name: 'desktop-v0.1.0-rc.2 on GitHub' }),
      ).toHaveAttribute(
        'href',
        'https://github.com/ddelvalfraire/cousins-lab-tools/releases/tag/desktop-v0.1.0-rc.2',
      );
      await userEvent.click(
        canvas.getByRole('button', { name: 'Copy full commit hash' }),
      );
      await expect(args.onCopyCommit).toHaveBeenCalledWith(COMMIT_RELEASE);
      await waitFor(() => expect(canvas.getByText('Copied')).toBeVisible());
    });
    await step('Report a problem prefills a GitHub issue', async () => {
      const { href, body } = reportBody(canvasElement);
      await expect(
        href.startsWith(
          'https://github.com/ddelvalfraire/cousins-lab-tools/issues/new?labels=bug&title=DVDash%200.1.0-rc.2',
        ),
      ).toBe(true);
      for (const part of [
        '## What happened',
        '## What you expected',
        '## Steps to reproduce',
        '## Environment',
        `Commit ${COMMIT_RELEASE}`,
        'Release desktop-v0.1.0-rc.2',
        'Platform macOS',
      ])
        await expect(body).toContain(part);
      await expect(
        canvas.queryByRole('button', { name: 'Copy details' }),
      ).toBeNull();
    });
    await settleMotion();
  },
};

export const CommaConflict: Story = {
  name: 'Comma for decimals and columns',
  args: { settings: { ...defaults, decimal: 'comma' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = canvas.getByTestId('export-message');
    await expect(message).toHaveTextContent(
      'Commas would separate both decimals and columns, so spreadsheets can misread values.',
    );
    await expect(message.querySelectorAll('li')).toHaveLength(0);
    const select = canvas.getByLabelText('Column separator in CSV files');
    await expect(select).toHaveAttribute('aria-invalid', 'true');
  },
};

/** The one-click fix switches to semicolons and returns focus to the separator. */
export const UseSemicolons: Story = {
  args: { settings: { ...defaults, decimal: 'comma' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const message = canvas.getByTestId('export-message');
    const select = canvas.getByLabelText('Column separator in CSV files');
    const warning = within(message).getByText(
      'Commas would separate both decimals and columns, so spreadsheets can misread values.',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use semicolons' }),
    );
    await expect(args.onChange).toHaveBeenCalledWith('delimiter', 'semicolon');
    await expect(
      canvas.queryByRole('button', { name: 'Use semicolons' }),
    ).toBeNull();
    await waitFor(() => expect(warning).not.toBeInTheDocument());
    await waitFor(() => expect(message).not.toBeVisible());
    await expect(select).toHaveFocus();
    await expect(select).not.toHaveAttribute('aria-invalid');
  },
};

export const ChoosingFolder: Story = {
  name: 'Choosing a folder',
  args: { folderState: { status: 'choosing' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Waiting for folder…',
      }),
    ).toBeDisabled();
  },
};

export const FolderUnwritable: Story = {
  name: 'Folder can’t be written',
  args: { folderState: { status: 'error', path: UNWRITABLE_FOLDER } },
  parameters: { folderOutcome: 'unwritable' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        `DVDash can’t save recordings in ${UNWRITABLE_FOLDER}. Still using ${defaults.folder}.`,
      ),
    ).toBeVisible();
    await expect(canvas.getByTestId('folder-path')).toHaveTextContent(
      defaults.folder,
    );
    await userEvent.click(
      canvas.getByRole('button', { name: 'Choose another folder' }),
    );
    await expect(args.onChooseFolder).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Choose another folder' }),
      ).toHaveFocus(),
    );
    await expect(canvas.getByTestId('folder-path')).toHaveTextContent(
      defaults.folder,
    );
    await settleMotion();
  },
};

export const VersionMismatch: Story = {
  name: 'Version doesn’t match release tag',
  args: { build: builds.mismatch },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('version-note')).toHaveTextContent(
      /^· doesn’t match release tag$/,
    );
    const aboutSection = canvas.getByRole('region', { name: 'About' });
    await expect(
      aboutSection.querySelectorAll('[role=alert], [role=status]'),
    ).toHaveLength(0);
    await expect(
      canvas.getByRole('link', { name: 'desktop-v0.1.0-rc.2 on GitHub' }),
    ).toBeVisible();
    await expect(reportBody(canvasElement).body).toContain(
      'Note version and tag differ',
    );
  },
};

export const LocalBuild: Story = {
  name: 'Local build',
  args: { build: builds.local },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      about(canvasElement).getByText('None · local build'),
    ).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /on GitHub/ })).toBeNull();
    await expect(
      canvas.getByRole('link', { name: 'View commit' }),
    ).toHaveAttribute(
      'href',
      `https://github.com/ddelvalfraire/cousins-lab-tools/commit/${COMMIT_LOCAL}`,
    );
    await expect(reportBody(canvasElement).body).toContain(
      'Release none (local build)',
    );
  },
};

export const UncommittedChanges: Story = {
  name: 'Local build, uncommitted changes',
  args: { build: builds.dirty },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      about(canvasElement).getByText(/uncommitted changes/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('link', { name: 'View commit' }),
    ).toBeNull();
    await expect(reportBody(canvasElement).body).toContain(
      `Commit ${COMMIT_LOCAL} (uncommitted changes)`,
    );
  },
};

/** Phone-width container: sections stack and nothing scrolls sideways. */
export const Narrow: Story = {
  args: { folderState: { status: 'error', path: UNWRITABLE_FOLDER } },
  parameters: { previewWidth: 360 },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.dv-settings') as HTMLElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    const section = canvasElement.querySelector(
      '.dv-settings-section',
    ) as HTMLElement;
    await expect(
      getComputedStyle(section).gridTemplateColumns.split(' '),
    ).toHaveLength(1);
  },
};
