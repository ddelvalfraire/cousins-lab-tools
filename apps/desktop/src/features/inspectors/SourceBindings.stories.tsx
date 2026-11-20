import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { Chip } from '@/shared/ui/Chip';
import { InspectorIcon } from '@/shared/ui/InspectorParts';
import { PageHeader } from '@/shared/ui/PageHeader';
import { WorkspaceBody } from '@/shared/ui/RightSidebar';
import {
  type PanelBinding,
  type PanelChannel,
  PanelSourceChart,
  PanelSourceInspector,
  type PanelSourceOption,
  type PanelSourceStatus,
  type StreamState,
  usePanelSource,
} from './PanelSource';

/** Synthetic sources. */
const rows = (count: number, n: number) =>
  Array.from({ length: count }, (_, i) => ({
    t: i / 2,
    44:
      1.55 +
      n * 0.09 +
      0.2 * Math.sin(i / 19) +
      0.35 * Math.exp(-(((i / 2 - 110) / 20) ** 2)),
    45: 0.85 + n * 0.04 + 0.12 * Math.sin(i / 25),
    49: 0.35 + 0.09 * Math.sin(i / 22),
  }));
const voltage = { unit: 'mV', quantity: 'voltage signals' };
const sources: PanelSourceOption[] = [
  {
    id: 'sample025',
    name: 'Sample 025',
    file: 'leaf-respiration-025.csv',
    kind: 'Recorded',
    group: 'Recordings',
    duration: 300,
    samples: 601,
    channels: ['44', '45', '49'],
    ...voltage,
    data: rows(601, 0),
  },
  {
    id: 'sample026',
    name: 'Sample 026',
    file: 'leaf-respiration-026.csv',
    kind: 'Recorded',
    group: 'Recordings',
    duration: 180,
    samples: 361,
    channels: ['44', '45'],
    ...voltage,
    data: rows(361, 1),
  },
  {
    id: 'temperature',
    name: 'Temperature log',
    file: 'temperature-025.csv',
    kind: 'Recorded',
    group: 'Recordings',
    duration: 300,
    samples: 601,
    channels: ['temperature'],
    unit: '°C',
    quantity: 'temperature',
    data: [],
  },
  {
    id: 'ms01',
    name: 'MS-01',
    file: 'Mass spectrometer · instrument stream',
    kind: 'Live',
    group: 'Instrument streams',
    duration: 300,
    samples: 601,
    channels: ['44', '45', '49'],
    ...voltage,
    data: rows(601, 3),
  },
];
const channels: PanelChannel[] = [
  { id: '44', label: 'Mass 44', line: 'solid' },
  { id: '45', label: 'Mass 45', line: 'dashed' },
  { id: '49', label: 'Mass 49', line: 'dotted' },
];
const all = ['44', '45', '49'];
const switched = () => new Promise<void>((resolve) => setTimeout(resolve, 650));
const failsOnce = () => {
  let failed = false;
  return () => {
    if (failed) return switched();
    failed = true;
    return Promise.reject(new Error('Not switched'));
  };
};

type Scenario =
  | 'recorded'
  | 'choose'
  | 'missing'
  | 'incompatible'
  | 'switching'
  | 'failed'
  | 'waiting'
  | 'stale'
  | 'live';
/** A panel page: the panel's chart beside its source inspector, beneath the shared header. */
function PanelSourceExample({
  scenario = 'recorded',
  onApply,
}: {
  scenario?: Scenario;
  onApply?: (binding: PanelBinding) => Promise<void> | void;
}) {
  const live =
    scenario === 'waiting' || scenario === 'stale' || scenario === 'live';
  const applied: PanelBinding = {
    source: live ? 'ms01' : 'sample025',
    signals: all,
  };
  const draft: PanelBinding =
    scenario === 'missing'
      ? { ...applied, source: 'sample026' }
      : scenario === 'incompatible'
        ? { ...applied, source: 'temperature' }
        : scenario === 'choose'
          ? { ...applied, source: '' }
          : scenario === 'switching' || scenario === 'failed'
            ? { source: 'sample026', signals: ['44', '45'] }
            : applied;
  const initialStatus: PanelSourceStatus =
    scenario === 'switching'
      ? 'switching'
      : scenario === 'failed'
        ? 'failed'
        : 'idle';
  const stream: StreamState | undefined = live
    ? scenario === 'live'
      ? 'receiving'
      : scenario
    : undefined;
  const editor = usePanelSource({
    sources,
    channels,
    requires: voltage,
    applied,
    initialDraft: draft,
    interval: live ? null : [120, 140],
    initialStatus,
    onApply,
  });
  return (
    <div style={{ background: 'var(--dv-bg)' }}>
      <PageHeader
        title="Gas signals"
        breadcrumbs={[
          { label: 'Experiments', onClick: () => {} },
          { label: 'Gas signals' },
        ]}
        meta={<Chip icon={<InspectorIcon name="signal" />}>Panel source</Chip>}
      />
      <WorkspaceBody
        sidebar={
          <PanelSourceInspector
            editor={editor}
            sources={sources}
            channels={channels}
            stream={stream}
          />
        }
      >
        <PanelSourceChart
          editor={editor}
          sources={sources}
          channels={channels}
          title="Mass signals"
          stream={stream}
        />
      </WorkspaceBody>
    </div>
  );
}

const meta = {
  title: 'Components/SourceBindings',
  component: PanelSourceExample,
  tags: ['autodocs'],
  // 1302 px gives the 898 px main column of the mockup's 1280 px page (WorkspaceBody pads 24 px where the mockup pads 16 px).
  parameters: { layout: 'fullscreen', previewWidth: 1302 },
  args: { scenario: 'recorded', onApply: fn(switched) },
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'recorded',
        'choose',
        'missing',
        'incompatible',
        'switching',
        'failed',
        'waiting',
        'stale',
        'live',
      ],
    },
    onApply: { control: false },
  },
} satisfies Meta<typeof PanelSourceExample>;
export default meta;
type Story = StoryObj<typeof meta>;

const apply = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('button', {
    name: /^(Apply to panel|Switching…)$/,
  });
const source = (canvasElement: HTMLElement) =>
  within(canvasElement).getByLabelText('Data source');
const signal = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).getByRole('checkbox', { name: new RegExp(`^${name}`) });
const chartSource = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.dv-src-current')!;

export const RecordedSource: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Panel source' }),
    ).toBeVisible();
    await expect(
      canvas.getByText('Selected interval: 120–140 s'),
    ).toBeVisible();
    await expect(canvas.getByText('3 selected')).toBeVisible();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
export const ChooseASource: Story = {
  args: { scenario: 'choose' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Choose a data source.'),
    ).toBeVisible();
    for (const name of ['Mass 44', 'Mass 45', 'Mass 49'])
      await expect(signal(canvasElement, name)).toBeDisabled();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
/** A visible signal the new source lacks blocks Apply; it stays checked so it can be removed. */
export const MissingSignal: Story = {
  args: { scenario: 'missing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'Mass 49 is missing from this source. Remove it from this panel or choose another source.',
      ),
    ).toBeVisible();
    await expect(signal(canvasElement, 'Mass 49')).toBeChecked();
    await expect(signal(canvasElement, 'Mass 49')).toBeEnabled();
    await expect(canvas.getByText('Unavailable')).toBeVisible();
    await expect(
      canvas.getByText(
        'Switching source clears this panel’s selected interval. Saved results are retained.',
      ),
    ).toBeVisible();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
export const IncompatibleUnits: Story = {
  args: { scenario: 'incompatible' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'This chart needs voltage signals in mV. This source provides temperature in °C.',
      ),
    ).toBeVisible();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
/** The chart keeps the applied source while the switch is pending. */
export const SwitchingSource: Story = {
  args: { scenario: 'switching' },
  play: async ({ canvasElement }) => {
    await expect(apply(canvasElement)).toHaveTextContent('Switching…');
    await expect(apply(canvasElement)).toBeDisabled();
    await expect(source(canvasElement)).toBeDisabled();
    await expect(chartSource(canvasElement)).toHaveTextContent(
      'Sample 025 · leaf-respiration-025.csv',
    );
    await expect(
      within(canvasElement).getByText('Selected interval: 120–140 s'),
    ).toBeVisible();
  },
};
export const SwitchFailed: Story = {
  args: { scenario: 'failed', onApply: fn(failsOnce()) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        /Could not switch the panel source\. The previous source is still shown\./,
      ),
    ).toBeVisible();
    await expect(chartSource(canvasElement)).toHaveTextContent('Sample 025');
  },
};
export const WaitingForSamples: Story = {
  args: { scenario: 'waiting' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Waiting for the first sample'),
    ).toBeVisible();
    await expect(
      canvas.getByText('The stream is connected. No samples received yet.'),
    ).toBeVisible();
    await expect(canvas.getByText('Full source · 300 s')).toBeVisible();
  },
};
export const StaleStream: Story = {
  args: { scenario: 'stale' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Stale · last received 12 s ago. Last samples remain visible.',
      ),
    ).toBeVisible();
  },
};
export const ReceivingSamples: Story = { args: { scenario: 'live' } };

/** Applying a different source switches the chart and clears the panel's interval. */
export const SwitchResetsInterval: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await chooseOption(source(canvasElement), 'sample026');
    await waitFor(() =>
      expect(
        canvas.getByText(/Mass 49 is missing from this source/),
      ).toBeVisible(),
    );
    await expect(chartSource(canvasElement)).toHaveTextContent('Sample 025');
    await userEvent.click(signal(canvasElement, 'Mass 49'));
    await expect(signal(canvasElement, 'Mass 49')).toBeDisabled();
    await expect(canvas.getByText('2 selected')).toBeVisible();
    await userEvent.click(apply(canvasElement));
    await expect(apply(canvasElement)).toHaveTextContent('Switching…');
    await expect(chartSource(canvasElement)).toHaveTextContent('Sample 025');
    await waitFor(
      () =>
        expect(chartSource(canvasElement)).toHaveTextContent(
          'Sample 026 · leaf-respiration-026.csv',
        ),
      { timeout: 2000 },
    );
    await expect(args.onApply).toHaveBeenLastCalledWith({
      source: 'sample026',
      signals: ['44', '45'],
    });
    await expect(canvas.getByText('Full source · 180 s')).toBeVisible();
    await waitFor(() => expect(source(canvasElement)).toHaveFocus());
    await expect(apply(canvasElement)).toBeDisabled();
    await userEvent.click(canvas.getByRole('tab', { name: 'Source' }));
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Applied source' }),
    ).toBeVisible();
    await waitFor(() => expect(canvas.getByText('Not selected')).toBeVisible());
    await expect(
      canvas.queryByRole('button', { name: 'Apply to panel' }),
    ).toBeNull();
  },
};

/** Changing only the visible signals keeps the interval. */
export const SignalChangeKeepsInterval: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(signal(canvasElement, 'Mass 45'));
    await expect(canvas.queryByText(/Switching source clears/)).toBeNull();
    await userEvent.click(apply(canvasElement));
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('.dv-insp-legend'),
        ).not.toHaveTextContent('Mass 45'),
      { timeout: 2000 },
    );
    await expect(
      canvas.getByText('Selected interval: 120–140 s'),
    ).toBeVisible();
    await userEvent.click(signal(canvasElement, 'Mass 44'));
    await userEvent.click(signal(canvasElement, 'Mass 49'));
    await waitFor(() =>
      expect(canvas.getByText('Choose at least one signal.')).toBeVisible(),
    );
    await expect(apply(canvasElement)).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(signal(canvasElement, 'Mass 44')).toBeChecked();
    await expect(source(canvasElement)).toHaveFocus();
  },
};

/** A failed switch leaves the applied chart and interval; Retry switches. */
export const RetryAfterFailedSwitch: Story = {
  args: { onApply: fn(failsOnce()) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await chooseOption(source(canvasElement), 'sample026');
    await userEvent.click(signal(canvasElement, 'Mass 49'));
    await userEvent.click(apply(canvasElement));
    const retry = await canvas.findByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toHaveFocus());
    await expect(chartSource(canvasElement)).toHaveTextContent('Sample 025');
    await expect(
      canvas.getByText('Selected interval: 120–140 s'),
    ).toBeVisible();
    await userEvent.click(retry);
    await waitFor(
      () => expect(chartSource(canvasElement)).toHaveTextContent('Sample 026'),
      { timeout: 2000 },
    );
    await expect(canvas.getByText('Full source · 180 s')).toBeVisible();
    await expect(args.onApply).toHaveBeenCalledTimes(2);
  },
};
