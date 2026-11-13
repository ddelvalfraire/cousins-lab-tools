import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within, type Mock } from 'storybook/test';
import { ExperimentSetupForm, type SetupPreset, type SetupRoutine, type SetupSource } from './ExperimentSetupForm';
import { chooseOption } from './chooseOption';

const presets: SetupPreset[] = [
  { id: 'gas', name: 'CO₂ & O₂ analysis', revisions: [3, 2], signals: ['32', '44'] },
  { id: 'kinetics', name: 'Enzyme kinetics', revisions: [2, 1], signals: ['32', '44', '49'] },
  { id: 'isotope', name: 'Isotope exchange', revisions: [1], signals: ['45', '47', '49'] },
];
const sources: SetupSource[] = [
  { id: 'sample025', kind: 'recording', name: 'Sample 025', file: 'leaf-respiration-025.csv', signals: ['32', '44', '45', '47', '49'], samples: 601, duration: 300 },
  { id: 'sample026', kind: 'recording', name: 'Sample 026', file: 'leaf-respiration-026.csv', signals: ['44'], samples: 361, duration: 180 },
  { id: 'reference023', kind: 'recording', name: 'Reference 023', file: 'leaf-reference-023.csv', signals: ['32', '44', '45', '47', '49'], samples: 601, duration: 300 },
  { id: 'ms01', kind: 'instrument', name: 'MS-01', detail: 'Mass spectrometer', signals: ['32', '44', '45', '47', '49'], connected: true },
  { id: 'ms02', kind: 'instrument', name: 'MS-02', detail: 'Mass spectrometer', signals: ['32', '44', '49'], connected: false },
];
const routines: SetupRoutine[] = [
  { id: 'measure', name: 'Timed measurements', revision: 2, steps: 3, fields: [
    { id: 'count', label: 'Measurement count', value: 100, min: 1, integer: true },
    { id: 'interval', label: 'Sample interval', value: 0.5, unit: 's', min: 0.001 },
    { id: 'delay', label: 'Start delay', value: 0, unit: 's', min: 0 },
  ] },
  { id: 'reference', name: 'Reference sequence', revision: 1, steps: 3, fields: [
    { id: 'referenceDuration', label: 'Reference duration', value: 10, unit: 's', min: 0.001 },
    { id: 'wait', label: 'Wait', value: 5, unit: 's', min: 0 },
    { id: 'sampleDuration', label: 'Sample duration', value: 30, unit: 's', min: 0.001 },
  ] },
];
const base = { name: 'Leaf respiration · Sample 026', presetId: 'gas', routineId: 'measure', referenceId: 'reference023' };
const live = { ...base, mode: 'live' as const, sourceId: 'ms01' };

const meta = {
  title: 'Components/ExperimentSetupForm',
  component: ExperimentSetupForm,
  tags: ['autodocs'],
  parameters: { previewWidth: 820 },
  args: {
    presets, sources, routines, initialValues: { ...base, mode: 'recorded', sourceId: 'sample025' },
    preparedMessage: 'This local example retained your configuration. No instrument command was sent.',
    onOpen: fn(() => new Promise<void>(resolve => setTimeout(resolve, 650))),
  },
} satisfies Meta<typeof ExperimentSetupForm>;
export default meta;
type Story = StoryObj<typeof meta>;

const select = (canvasElement: HTMLElement, name: string) => within(canvasElement).getByRole('combobox', { name });
const openButton = (canvasElement: HTMLElement) => within(canvasElement).getByRole('button', { name: /Open experiment|Preparing…/ });
const validation = (canvasElement: HTMLElement) => within(canvasElement).queryAllByRole('alert')[0];

export const RecordedData: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Existing recording' })).toBeChecked();
    // Recorded data has no routine timing.
    await expect(canvas.queryByRole('heading', { name: 'Routine settings' })).toBeNull();
    await expect(canvas.getByText(/leaf-respiration-025\.csv · 601 samples · 300 s/)).toBeVisible();
    await expect(validation(canvasElement)).toBeUndefined();
    await expect(openButton(canvasElement)).toBeEnabled();
  },
};

/** Source checks, the reference recording and preparation, then back to the form. */
export const PrepareRecordedData: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // A source without a required signal is explained in one sentence and blocks opening.
    await chooseOption(select(canvasElement, 'Recording'), 'sample026');
    await expect(validation(canvasElement)).toHaveTextContent('Sample 026 is missing Mass 32. Choose a compatible source.');
    await expect(validation(canvasElement).querySelectorAll('li')).toHaveLength(0);
    await expect(openButton(canvasElement)).toBeDisabled();
    await chooseOption(select(canvasElement, 'Recording'), 'sample025');
    // The reference recording must be chosen when included.
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Include a reference recording' }));
    await chooseOption(select(canvasElement, 'Reference recording'), '');
    await expect(openButton(canvasElement)).toBeDisabled();
    await chooseOption(select(canvasElement, 'Reference recording'), 'reference023');
    await expect(openButton(canvasElement)).toBeEnabled();
    // The chosen revision survives preparation; preparing locks the fields.
    await chooseOption(select(canvasElement, 'Revision'), '2');
    await userEvent.click(openButton(canvasElement));
    await expect(canvas.getByRole('textbox', { name: 'Experiment name' })).toBeDisabled();
    const prepared = await canvas.findByRole('heading', { name: 'Experiment prepared' }, { timeout: 3000 });
    await waitFor(() => expect(prepared).toHaveFocus());
    await expect(args.onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ preset: { id: 'gas', name: 'CO₂ & O₂ analysis', revision: 2 }, routine: null, reference: 'reference023' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Return to setup' }));
    await expect(canvas.getByRole('textbox', { name: 'Experiment name' })).toHaveFocus();
  },
};

export const InstrumentStream: Story = {
  args: { initialValues: live },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Instrument stream' })).toBeChecked();
    await expect(canvas.getByRole('heading', { name: 'Routine settings' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Sample interval' })).toHaveValue('0.5');
    await expect(canvas.getByText('3 steps')).toBeVisible();
    await expect(openButton(canvasElement)).toBeEnabled();
  },
};

/** Routine fields accept a decimal comma; each routine sends its own parameters. */
export const PrepareInstrumentStream: Story = {
  args: { initialValues: live },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Decimal comma is accepted in routine fields.
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Sample interval' })); await userEvent.type(canvas.getByRole('textbox', { name: 'Sample interval' }), '0,25');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Measurement count' })); await userEvent.type(canvas.getByRole('textbox', { name: 'Measurement count' }), '200');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Start delay' })); await userEvent.type(canvas.getByRole('textbox', { name: 'Start delay' }), '0');
    await userEvent.click(openButton(canvasElement));
    await canvas.findByRole('heading', { name: 'Experiment prepared' }, { timeout: 3000 });
    await expect(args.onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ routine: { id: 'measure', revision: 2, parameters: { count: 200, interval: 0.25, delay: 0 } } }));
    // Another routine shows its own fields and sends its own parameters.
    await userEvent.click(canvas.getByRole('button', { name: 'Return to setup' }));
    await chooseOption(select(canvasElement, 'Routine revision'), 'reference');
    await expect(canvas.queryByRole('textbox', { name: 'Measurement count' })).toBeNull();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Wait' })); await userEvent.type(canvas.getByRole('textbox', { name: 'Wait' }), '7');
    await userEvent.click(openButton(canvasElement));
    await canvas.findByRole('heading', { name: 'Experiment prepared' }, { timeout: 3000 });
    await expect(args.onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'live', roles: { massSpectrometer: 'ms01' }, reference: null, routine: { id: 'reference', revision: 1, parameters: { referenceDuration: 10, wait: 7, sampleDuration: 30 } } }));
  },
};

export const WithReference: Story = {
  args: { initialValues: { ...base, mode: 'recorded', sourceId: 'sample025', includeReference: true } },
  play: async ({ canvasElement }) => {
    await expect(select(canvasElement, 'Reference recording')).toHaveValue('Reference 023');
    await expect(validation(canvasElement)).toBeUndefined();
    await expect(openButton(canvasElement)).toBeEnabled();
  },
};

export const RequiredSourceMissing: Story = {
  args: { initialValues: { ...base, mode: 'recorded', sourceId: '' } },
  play: async ({ canvasElement }) => {
    await expect(validation(canvasElement)).toHaveTextContent('Choose a source for the mass spectrometer.');
    await expect(select(canvasElement, 'Recording')).toHaveAttribute('aria-invalid', 'true');
    await expect(openButton(canvasElement)).toBeDisabled();
  },
};

export const MissingRequiredSignal: Story = {
  args: { initialValues: { ...base, mode: 'recorded', sourceId: 'sample026' } },
  play: async ({ canvasElement }) => {
    await expect(validation(canvasElement)).toHaveTextContent('Sample 026 is missing Mass 32. Choose a compatible source.');
    await expect(openButton(canvasElement)).toBeDisabled();
  },
};

export const InstrumentUnavailable: Story = {
  args: { initialValues: { ...live, sourceId: 'ms02' } },
  play: async ({ canvasElement }) => {
    await expect(validation(canvasElement)).toHaveTextContent('MS-02 is offline. Choose an available instrument.');
    await expect(within(canvasElement).getByText('Mass spectrometer · Offline')).toBeVisible();
    await expect(openButton(canvasElement)).toBeDisabled();
  },
};

export const InputErrors: Story = {
  args: { initialValues: { ...live, name: '', parameters: { count: '2.5', interval: '0' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Two or more problems read as a list.
    await expect(validation(canvasElement).querySelectorAll('li')).toHaveLength(3);
    await expect(canvas.getByRole('textbox', { name: 'Experiment name' })).toHaveAttribute('aria-invalid', 'true');
    await expect(openButton(canvasElement)).toBeDisabled();
  },
};

/** An unsafe whole number is still rejected; fixing every problem enables opening. */
export const FixInputErrors: Story = {
  args: { initialValues: { ...live, name: '', parameters: { count: '2.5', interval: '0' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // An unsafe whole number is still rejected; fixing every problem enables opening.
    const count = canvas.getByRole('textbox', { name: 'Measurement count' });
    await userEvent.clear(count); await userEvent.type(count, '9007199254740992');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Experiment name' }), 'Leaf respiration');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Sample interval' })); await userEvent.type(canvas.getByRole('textbox', { name: 'Sample interval' }), '0.5');
    await expect(validation(canvasElement)).toHaveTextContent('Measurement count: enter a safely representable whole number of at least 1.');
    await expect(openButton(canvasElement)).toBeDisabled();
    await userEvent.clear(count); await userEvent.type(count, '10');
    await expect(openButton(canvasElement)).toBeEnabled();
    // Changing the preset selects its latest revision and its requirements.
    await chooseOption(select(canvasElement, 'Preset'), 'isotope');
    await expect(select(canvasElement, 'Revision')).toHaveValue('R1 · Latest');
    await expect(canvas.getByText(/Needs Mass 45/)).toBeVisible();
  },
};

export const Preparing: Story = {
  args: { initialValues: live, initialStatus: 'preparing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Experiment name' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Reset form' })).toBeDisabled();
  },
};

export const PreparationFailed: Story = {
  args: { initialValues: live, initialStatus: 'failed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(/^Could not prepare the experiment\. Your settings are retained\. Retry$/);
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

/** A failed attempt keeps every input; Retry prepares the experiment. */
export const RetryAfterFailure: Story = {
  args: { initialValues: live, initialStatus: 'failed' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    (args.onOpen as Mock).mockRejectedValueOnce(new Error('Preparation failed'));
    const count = canvas.getByRole('textbox', { name: 'Measurement count' });
    await userEvent.clear(count); await userEvent.type(count, '250');
    await userEvent.click(openButton(canvasElement));
    // Failure keeps every input and offers Retry.
    const retry = await canvas.findByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toHaveFocus());
    await expect(canvas.getByRole('textbox', { name: 'Measurement count' })).toHaveValue('250');
    await userEvent.click(retry);
    await canvas.findByRole('heading', { name: 'Experiment prepared' }, { timeout: 3000 });
    await expect(args.onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ routine: expect.objectContaining({ parameters: { count: 250, interval: 0.5, delay: 0 } }) }));
  },
};

/** Inside the app screen: the shared page header carries the title, so the card has none. */
export const UnderPageHeader: Story = {
  args: { hideHeader: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Prepare experiment' })).toBeNull();
    await expect(canvas.getByRole('region', { name: 'Prepare experiment' })).toBeVisible();
    await expect(canvas.queryByText(/^Preset R3$/)).toBeNull();
  },
};
