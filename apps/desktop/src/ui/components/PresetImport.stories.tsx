import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { gasExchangeDefinition, presetFile } from './exchange-fixtures';
import {
  type PresetFileCheck,
  PresetImport,
  PresetImportDialog,
  PresetThumbnail,
} from './PresetImport';

/** The dialog renders in a portal, so queries run against the whole document. */
const dialog = (canvasElement: HTMLElement) =>
  within(within(canvasElement.ownerDocument.body).getByRole('dialog'));
const problems = [
  'Panel “Ratio” uses an unknown type: vendor.ratio-v2.',
  'Routine “Reference” is referenced but not included.',
];

const meta = {
  title: 'Components/PresetImport',
  component: PresetImportDialog,
  parameters: { layout: 'fullscreen', gallery: false },
  args: {
    opened: true,
    phase: 'review',
    file: presetFile,
    definition: gasExchangeDefinition,
    name: 'Gas exchange',
    onChooseFile: fn(),
    onNameChange: fn(),
    onReview: fn(),
    onBack: fn(),
    onImport: fn(),
    onImportAnother: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PresetImportDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ChooseFile: Story = {
  args: { phase: 'choose', file: undefined, definition: undefined, name: '' },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('Drop a preset definition here')).toBeVisible();
    await expect(
      body.getByRole('button', { name: 'Choose file' }),
    ).toBeEnabled();
    await expect(
      body.queryByRole('button', { name: 'Review preset' }),
    ).toBeNull();
  },
};

/** The chosen file is being validated. Review waits; the file can still be replaced. */
export const CheckingFile: Story = {
  args: { phase: 'checking', definition: undefined, name: '' },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(body.getByRole('status')).toHaveTextContent(
      'Checking file…Validating the definition and its references.',
    );
    await expect(
      body.getByText('gas-exchange.preset.json · 18 KB'),
    ).toBeVisible();
    await expect(
      body.getByRole('button', { name: 'Review preset' }),
    ).toBeDisabled();
    await expect(
      body.getByRole('button', { name: 'Replace file' }),
    ).toBeEnabled();
  },
};

export const FileSelected: Story = {
  args: { phase: 'ready' },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(body.getByText('5 panels')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Review preset' }));
    await expect(args.onReview).toHaveBeenCalledTimes(1);
  },
};

/** One problem reads as a sentence. */
export const InvalidOneProblem: Story = {
  args: {
    phase: 'invalid',
    definition: undefined,
    problems: problems.slice(0, 1),
  },
  play: async ({ canvasElement }) => {
    const alert = dialog(canvasElement).getByRole('status');
    await expect(alert).toHaveTextContent(
      /^This definition can’t be imported\. Panel “Ratio” uses an unknown type: vendor\.ratio-v2\.$/,
    );
    await expect(alert.querySelectorAll('li')).toHaveLength(0);
    await expect(
      dialog(canvasElement).getByRole('button', { name: 'Review preset' }),
    ).toBeDisabled();
  },
};

/** Two or more problems read as a list. */
export const InvalidSeveralProblems: Story = {
  args: { phase: 'invalid', definition: undefined, problems },
  play: async ({ canvasElement }) => {
    const alert = dialog(canvasElement).getByRole('status');
    await expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(problems);
  },
};

/** Review what the file contains and name the preset. Instruments are assigned when the preset is used. */
export const Review: Story = {
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(
      body.getByText('Review', { selector: '[aria-current="step"]' }),
    ).toBeVisible();
    await expect(
      body.getByText('Assign instruments when using the preset.'),
    ).toBeVisible();
    await userEvent.type(
      body.getByRole('textbox', { name: 'Preset name' }),
      '!',
    );
    await expect(args.onNameChange).toHaveBeenLastCalledWith('Gas exchange!');
    await userEvent.click(body.getByRole('button', { name: 'Import preset' }));
    await expect(args.onImport).toHaveBeenCalledTimes(1);
  },
};

export const NameAlreadyExists: Story = {
  args: { name: 'Gas exchange (imported)', nameTaken: true },
  play: async ({ canvasElement }) => {
    await expect(
      dialog(canvasElement).getByText(
        'A preset with the original name already exists. A separate copy will be added.',
      ),
    ).toBeVisible();
  },
};

export const Importing: Story = {
  args: { phase: 'importing' },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(
      body.getByRole('button', { name: 'Importing preset…' }),
    ).toBeDisabled();
    await expect(
      body.getByRole('textbox', { name: 'Preset name' }),
    ).toBeDisabled();
    await expect(
      body.getByRole('button', { name: 'Close import dialog' }),
    ).toBeDisabled();
  },
};

export const Imported: Story = {
  args: { phase: 'done' },
  play: async ({ canvasElement, args }) => {
    const body = dialog(canvasElement);
    await expect(
      body.getByRole('heading', { name: 'Preset imported' }),
    ).toBeVisible();
    await expect(body.getByText('Preset added to your catalog.')).toBeVisible();
    await userEvent.click(body.getByRole('button', { name: 'Import another' }));
    await expect(args.onImportAnother).toHaveBeenCalledTimes(1);
  },
};

export const ImportFailed: Story = {
  args: { phase: 'failed' },
  play: async ({ canvasElement }) => {
    const body = dialog(canvasElement);
    await expect(
      body.getByText('Couldn’t add the preset. Try again.'),
    ).toBeVisible();
    await expect(body.getByRole('button', { name: 'Try again' })).toBeEnabled();
  },
};

export const LongNames: Story = {
  args: {
    file: {
      name: 'carbon-dioxide-and-oxygen-analysis-with-reference-and-sample-protocol.preset.json',
      size: 18 * 1024,
    },
    definition: {
      ...gasExchangeDefinition,
      name: 'Carbon dioxide and oxygen response with reference and sample intervals',
    },
    name: 'Carbon dioxide and oxygen response with reference and sample intervals',
  },
};

/** The layout miniature on its own, in the catalog size. */
export const Thumbnail: StoryObj<typeof PresetThumbnail> = {
  render: () => (
    <div style={{ padding: 24 }}>
      <PresetThumbnail layout={gasExchangeDefinition.layout} />
    </div>
  ),
};

let finishCheck: (check: PresetFileCheck) => void = () => {};
/** The stateful import, with a check that waits for the story to finish it. */
function ReopenableImport() {
  const [opened, setOpened] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpened(true)}>
        Import preset
      </button>
      <PresetImport
        opened={opened}
        onClose={() => setOpened(false)}
        checkFile={() =>
          new Promise((resolve) => {
            finishCheck = resolve;
          })
        }
        importPreset={async () => {}}
      />
    </>
  );
}

/** Closing while a file is still being checked drops that check, so the dialog opens fresh next time. */
export const ClosingCancelsTheCheck: StoryObj<typeof PresetImport> = {
  render: () => <ReopenableImport />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const input = canvasElement.ownerDocument.querySelector<HTMLInputElement>(
      '[role=dialog] input[type=file]',
    );
    if (!input) throw new Error('The import dialog has no file input');
    await userEvent.upload(
      input,
      new File(['{}'], presetFile.name, { type: 'application/json' }),
    );
    await expect(dialog(canvasElement).getByRole('status')).toHaveTextContent(
      /Checking file/,
    );
    await userEvent.click(
      dialog(canvasElement).getByRole('button', {
        name: 'Close import dialog',
      }),
    );
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());

    finishCheck({ valid: true, definition: gasExchangeDefinition });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await userEvent.click(page.getByRole('button', { name: 'Import preset' }));
    const body = within(await page.findByRole('dialog'));
    await waitFor(() =>
      expect(body.getByText('Drop a preset definition here')).toBeVisible(),
    );
    await expect(
      body.queryByRole('button', { name: 'Review preset' }),
    ).toBeNull();
  },
};
