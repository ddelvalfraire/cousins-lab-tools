import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { chooseOption } from '@/shared/testing/chooseOption';
import { Chip } from '@/shared/ui/Chip';
import { InspectorIcon } from '@/shared/ui/InspectorParts';
import { PageHeader } from '@/shared/ui/PageHeader';
import { WorkspaceBody } from '@/shared/ui/RightSidebar';
import { settleMotion } from '../../../.storybook/settleMotion';
import {
  type AlignmentEvent,
  AlignmentPreviewChart,
  type AlignmentRecording,
  type AlignmentSettings,
  type AlignmentStatus,
  RecordingAlignmentInspector,
  useAlignmentEditor,
} from './RecordingAlignment';

/** Synthetic recordings: the same response, 15 s apart. */
const trace = (origin: number) =>
  Array.from({ length: 301 }, (_, t) => ({
    t,
    y:
      0.303 +
      0.85 * Math.exp(-(((t - origin - 18) / 13) ** 2)) +
      0.14 * Math.exp(-(((t - origin - 55) / 18) ** 2)),
  }));
const sample: AlignmentRecording = {
  id: 'sample',
  name: 'Sample 025',
  file: 'leaf-respiration-025.csv',
  line: 'solid',
  signal: 'Mass 44',
  unit: 'mV',
  duration: 300,
  samples: 301,
  available: true,
  clockStart: '09:14:00',
  events: { sample: 120, valve: 90 },
  data: trace(120),
};
const reference: AlignmentRecording = {
  ...sample,
  id: 'reference',
  name: 'Reference 024',
  file: 'leaf-reference-024.csv',
  line: 'dashed',
  clockStart: '09:14:15',
  events: { sample: 135, valve: 102 },
  data: trace(135),
};
const events: AlignmentEvent[] = [
  { id: 'sample', label: 'Sample introduced' },
  { id: 'valve', label: 'Valve opened' },
];
const saved: AlignmentSettings = {
  method: 'elapsed',
  event: 'sample',
  origins: { sample: '120', reference: '135' },
};
const stored = () => new Promise<void>((resolve) => setTimeout(resolve, 650));
const failsOnce = () => {
  let failed = false;
  return () => {
    if (failed) return stored();
    failed = true;
    return Promise.reject(new Error('Not saved'));
  };
};

type Scenario =
  | 'event'
  | 'elapsed'
  | 'clock'
  | 'clock-missing'
  | 'event-missing'
  | 'invalid'
  | 'no-reference'
  | 'save-error'
  | 'saving';
/** The comparison page: chart preview beside the recording inspector, beneath the shared header. */
function AlignmentExample({
  scenario = 'event',
  onSave,
}: {
  scenario?: Scenario;
  onSave?: (settings: AlignmentSettings) => Promise<void> | void;
}) {
  const recordings = [
    scenario === 'clock-missing' ? { ...sample, clockStart: null } : sample,
    scenario === 'clock-missing'
      ? { ...reference, clockStart: null }
      : scenario === 'no-reference'
        ? { ...reference, available: false }
        : reference,
  ];
  const method =
    scenario === 'elapsed'
      ? 'elapsed'
      : scenario === 'clock' || scenario === 'clock-missing'
        ? 'clock'
        : 'event';
  const initialSettings: AlignmentSettings = {
    method,
    event: 'sample',
    origins: {
      sample: '120',
      reference:
        scenario === 'event-missing'
          ? ''
          : scenario === 'invalid'
            ? '350'
            : '135',
    },
  };
  const initialStatus: AlignmentStatus =
    scenario === 'save-error'
      ? 'failed'
      : scenario === 'saving'
        ? 'saving'
        : 'idle';
  const editor = useAlignmentEditor({
    recordings,
    saved,
    initialSettings,
    initialStatus,
    onSave,
  });
  return (
    <div style={{ background: 'var(--dv-bg)' }}>
      <PageHeader
        title="Leaf respiration"
        breadcrumbs={[
          { label: 'Experiments', onClick: () => {} },
          { label: 'Leaf respiration' },
        ]}
        meta={<Chip icon={<InspectorIcon name="align" />}>2 recordings</Chip>}
      />
      <WorkspaceBody
        sidebar={
          <RecordingAlignmentInspector
            editor={editor}
            recordings={recordings}
            events={events}
          />
        }
      >
        <AlignmentPreviewChart
          editor={editor}
          recordings={recordings}
          events={events}
          title="Mass 44"
          clockDate="14 Apr 2026"
        />
      </WorkspaceBody>
    </div>
  );
}

const meta = {
  title: 'Components/AlignmentInspector',
  component: AlignmentExample,
  tags: ['autodocs'],
  // 1302 px gives the 898 px main column of a 1280 px page padded 16 px, since WorkspaceBody pads 24 px.
  parameters: { layout: 'fullscreen', previewWidth: 1302 },
  args: { scenario: 'event', onSave: fn(stored) },
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'event',
        'elapsed',
        'clock',
        'clock-missing',
        'event-missing',
        'invalid',
        'no-reference',
        'save-error',
        'saving',
      ],
    },
    onSave: { control: false },
  },
} satisfies Meta<typeof AlignmentExample>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Skip the screen-reader announcement copy of a message. */
const visibleOnly = 'script, style, .dv-insp-sr';

const apply = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('button', {
    name: /^(Apply alignment|Applying…)$/,
  });
const method = (canvasElement: HTMLElement) =>
  within(canvasElement).getByLabelText('Align recordings by');
const chart = (canvasElement: HTMLElement, axis: RegExp) =>
  within(canvasElement).getByRole('region', { name: axis });

/** Draft differs from the saved alignment (elapsed): the chart previews it before Apply. */
export const SharedEvent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Alignment' }),
    ).toBeVisible();
    await expect(canvas.getByText('Preview')).toBeVisible();
    await expect(
      chart(canvasElement, /Time from sample introduced \(s\)/),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText('Time since recording start', {
        selector: '[id$="-sample"]',
      }),
    ).toHaveValue('120');
    await expect(canvas.getByText('−135 s')).toBeVisible();
    await expect(apply(canvasElement)).toBeEnabled();
  },
};
export const EachRecordingsStart: Story = {
  args: { scenario: 'elapsed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'Each recording starts at 0 s. This does not imply simultaneous acquisition.',
      ),
    ).toBeVisible();
    await expect(canvas.queryByText('Preview')).toBeNull();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
export const ClockTime: Story = {
  args: { scenario: 'clock' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('09:14:15')).toBeVisible();
  },
};
export const MissingClockTimestamps: Story = {
  args: { scenario: 'clock-missing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText(
        'Comparable clock timestamps are missing. Use elapsed time or a shared event.',
      ),
    ).toHaveLength(2);
    await expect(canvas.getAllByText('Unavailable')).toHaveLength(2);
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
export const EventNeedsATime: Story = { args: { scenario: 'event-missing' } };
export const InvalidEventTime: Story = {
  args: { scenario: 'invalid' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText('Enter each event time between 0 and 300 s.'),
    ).toHaveLength(2);
    await expect(canvas.getByDisplayValue('350')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(canvas.getByText('—')).toBeVisible();
    await expect(apply(canvasElement)).toBeDisabled();
  },
};
export const ReferenceUnavailable: Story = {
  args: { scenario: 'no-reference' },
};
export const SaveFailed: Story = {
  args: { scenario: 'save-error', onSave: fn(failsOnce()) },
};
export const Saving: Story = {
  args: { scenario: 'saving' },
  play: async ({ canvasElement }) => {
    await expect(apply(canvasElement)).toHaveTextContent('Applying…');
    await expect(apply(canvasElement)).toBeDisabled();
    await expect(method(canvasElement)).toBeDisabled();
    await expect(
      within(canvasElement).getByRole('button', { name: 'Discard' }),
    ).toBeDisabled();
  },
};

/** Changing the reference mode previews at once; Discard restores the saved mode; Apply stores the draft. */
export const PreviewDiscardAndApply: Story = {
  args: { scenario: 'elapsed' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await chooseOption(method(canvasElement), 'event');
    await waitFor(() => expect(canvas.getByText('Preview')).toBeVisible());
    await expect(
      canvas.getByText('Set the same event to 0 s in both recordings.'),
    ).toBeVisible();
    await expect(
      chart(canvasElement, /Time from sample introduced \(s\)/),
    ).toBeVisible();
    await chooseOption(canvas.getByLabelText('Event'), 'valve');
    await expect(canvas.getByDisplayValue('90')).toBeVisible();
    await expect(canvas.getByDisplayValue('102')).toBeVisible();
    await expect(
      chart(canvasElement, /Time from valve opened \(s\)/),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Discard' }));
    await expect(method(canvasElement)).toHaveValue('Elapsed since each start');
    await expect(method(canvasElement)).toHaveFocus();
    await waitFor(() => expect(canvas.queryByText('Preview')).toBeNull());
    await chooseOption(method(canvasElement), 'clock');
    await expect(
      canvas.getByRole('heading', { name: 'Recording start times' }),
    ).toBeVisible();
    await userEvent.click(apply(canvasElement));
    await expect(apply(canvasElement)).toHaveTextContent('Applying…');
    await expect(method(canvasElement)).toBeDisabled();
    await waitFor(
      () =>
        expect(
          canvas.getByText('Alignment saved.', { ignore: visibleOnly }),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(args.onSave).toHaveBeenLastCalledWith({
      method: 'clock',
      event: 'sample',
      origins: { sample: '120', reference: '135' },
    });
    await waitFor(() => expect(canvas.queryByText('Preview')).toBeNull());
    await waitFor(() => expect(method(canvasElement)).toHaveFocus());
    await expect(apply(canvasElement)).toBeDisabled();
    await settleMotion();
  },
};

/** An event time outside the recording blocks Apply and is marked on its field. */
export const EventTimeGuard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByDisplayValue('135');
    await userEvent.clear(field);
    await expect(
      canvas.getAllByText('Enter each event time between 0 and 300 s.'),
    ).toHaveLength(2);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(apply(canvasElement)).toBeDisabled();
    await userEvent.type(field, '140');
    await waitFor(() =>
      expect(
        canvas.queryByText('Enter each event time between 0 and 300 s.'),
      ).toBeNull(),
    );
    await expect(canvas.getByText('−140 s')).toBeVisible();
    await expect(apply(canvasElement)).toBeEnabled();
  },
};

/** A failed save keeps the preview; Retry stores it. */
export const RetryAfterFailedSave: Story = {
  args: { onSave: fn(failsOnce()) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(apply(canvasElement));
    const retry = await canvas.findByRole(
      'button',
      { name: 'Retry' },
      { timeout: 2000 },
    );
    await waitFor(() =>
      expect(
        canvas.getByText(
          /Could not save the alignment\. Your preview is retained\./,
        ),
      ).toBeVisible(),
    );
    await waitFor(() => expect(retry).toHaveFocus());
    await expect(canvas.getByText('Preview')).toBeVisible();
    await userEvent.click(retry);
    await waitFor(
      () =>
        expect(
          canvas.getByText('Alignment saved.', { ignore: visibleOnly }),
        ).toBeVisible(),
      { timeout: 2000 },
    );
    await expect(args.onSave).toHaveBeenCalledTimes(2);
    await settleMotion();
  },
};

/** Sources lists each recording; the alignment actions stay with the Align tab. */
export const SourcesTab: Story = {
  args: { scenario: 'no-reference' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Sources' }));
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Sources' }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Apply alignment' }),
    ).toBeNull();
    const detail = within(
      canvas.getByRole('region', { name: 'Reference 024' }),
    );
    await waitFor(() => expect(detail.getByText('Unavailable')).toBeVisible());
    await expect(detail.getByText('leaf-reference-024.csv')).toBeVisible();
  },
};
