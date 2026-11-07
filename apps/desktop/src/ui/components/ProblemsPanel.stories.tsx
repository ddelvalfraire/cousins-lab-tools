import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { AffectedPanelFlag, ProblemsPanel, ProblemsTrigger, problemFlag } from './ProblemsPanel';
import type { Problem, ResolvedProblem } from './ProblemsPanel';

const SIGNALS = { id: 'p1', title: 'CO₂ and O₂ signals' };
const READINGS = { id: 'p2', title: 'Current readings' };
const PRESSURE = { id: 'p3', title: 'CO₂ pressure' };
const SAMPLES = { id: 'p4', title: 'Recent samples' };

const LIVE: Problem[] = [
  {
    id: 'i1', severity: 'error', title: 'MS-01 stopped sending data', when: 'Since 14:02:31 · 45 s ago',
    explanation: 'No new samples are arriving, so live values have stopped updating. Samples recorded before 14:02:31 are saved.',
    affects: [SIGNALS, READINGS, SAMPLES],
    actions: [{
      id: 'reconnect', label: 'Reconnect MS-01', kind: 'fix', pending: 'Reconnecting…', waiting: 'Waiting for MS-01…',
      failed: 'MS-01 didn’t answer. Check its cable and power, then try again.', done: 'MS-01 is sending data again.',
    }],
  },
  {
    id: 'i2', severity: 'warning', title: 'CO₂ pressure can’t be calculated', when: 'Since 14:00:05',
    explanation: 'It needs Mass 44 from the zero gas recording, which isn’t set for this experiment.',
    affects: [PRESSURE], actions: [{ id: 'source', label: 'Choose a zero gas recording', kind: 'navigate', tab: 'signals' }],
  },
  {
    id: 'i3', severity: 'warning', title: 'Mass 44 is above the calibrated range', when: 'Since 13:58:40 · 12 readings',
    explanation: 'Readings above 800 mV use a straight-line extension of the calibration, so they are less certain.',
    affects: [READINGS], actions: [{ id: 'curve', label: 'View calibration', kind: 'navigate', tab: 'details' }],
  },
  {
    id: 'i4', severity: 'info', title: '3 samples arrived out of order and were sorted', when: '13:57:12',
    explanation: 'They were placed by their timestamps. No values changed.',
    affects: [], actions: [{ id: 'dismiss', label: 'Dismiss', kind: 'dismiss' }],
  },
];

const RECORDED: Problem[] = [{
  id: 'r1', severity: 'info', title: 'The recording has a 15 s gap', when: 'At 150–165 s',
  explanation: 'No samples were recorded there, so the chart leaves a gap instead of drawing a line across it.',
  affects: [SIGNALS], actions: [{ id: 'show', label: 'Show on chart', kind: 'locate' }],
}];

const RESOLVED: ResolvedProblem[] = [
  { id: 'i1', how: 'fixed', title: 'MS-01 stopped sending data', at: '14:05:20' },
  { id: 'i4', how: 'dismissed', title: '3 samples arrived out of order and were sorted', at: '14:05:31' },
];

const meta = {
  title: 'Components/ProblemsPanel',
  component: ProblemsPanel,
  args: {
    problems: LIVE, resolved: [], selectedId: null, actionStatus: {}, lastChecked: '14:05:12',
    onSelect: fn(), onAction: fn(), onNavigate: fn(), onDismiss: fn(),
  },
  // Selection is owned by the workspace; this render plays that role so selecting works in the canvas.
  render: function Render(args) {
    const [selectedId, setSelectedId] = useState(args.selectedId);
    useEffect(() => setSelectedId(args.selectedId), [args.selectedId]);
    return <ProblemsPanel {...args} selectedId={selectedId} onSelect={id => { args.onSelect(id); setSelectedId(id); }} />;
  },
  // Example context: the sidebar pane beside the experiment (332 px sidebar less its 50 px tab rail).
  decorators: [Story => <div style={{ background: 'var(--dv-paper)', border: '1px solid var(--dv-line)', borderRadius: 8, padding: '16px 16px 16px' }}><Story /></div>],
  parameters: { previewWidth: 282 },
} satisfies Meta<typeof ProblemsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SeveralProblems: Story = {
  name: 'Several problems',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('3 problems need attention · 1 notice')).toBeVisible();
    await expect(canvasElement.querySelector('.dv-prob-copy strong')).toHaveTextContent('MS-01 stopped sending data');
    await expect(canvas.getByText('Needs attention')).toBeVisible();
    await expect(canvas.getByText('Notices')).toBeVisible();

    // Selecting expands and selects; selecting again collapses and clears.
    const head = () => canvas.getByRole('button', { name: /MS-01 stopped sending data/ });
    await userEvent.click(head());
    await expect(head()).toHaveAttribute('aria-expanded', 'true');
    await expect(args.onSelect).toHaveBeenLastCalledWith('i1');
    // The workspace (here, the story args) owns selection; wait for it to come back as selectedId.
    await waitFor(() => expect(canvasElement.querySelector('[data-problem=i1]')).toHaveAttribute('data-selected', 'true'));
    await expect(canvas.getByText(/Samples recorded before 14:02:31 are saved\./)).toBeVisible();
    for (const panel of ['CO₂ and O₂ signals', 'Current readings', 'Recent samples']) await expect(canvas.getByText(panel)).toBeVisible();
    await userEvent.click(head());
    await expect(head()).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onSelect).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(canvasElement.querySelector('[data-problem=i1]')).toHaveAttribute('data-selected', 'false'));

    // Fix runs in place.
    await userEvent.click(head());
    await userEvent.click(canvas.getByRole('button', { name: 'Reconnect MS-01' }));
    await expect(args.onAction).toHaveBeenCalledWith('i1', 'reconnect');

    // Navigate opens a sidebar tab, never a dialog.
    await userEvent.click(canvas.getByRole('button', { name: /CO₂ pressure can’t be calculated/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Choose a zero gas recording' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('signals');
    await expect(document.querySelector('dialog[open], [role=dialog]')).toBeNull();

    // Dismiss a notice, by keyboard.
    canvas.getByRole('button', { name: /3 samples arrived out of order/ }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    canvas.getByRole('button', { name: 'Dismiss' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onDismiss).toHaveBeenCalledWith('i4');
  },
};

export const ProblemSelected: Story = {
  name: 'Problem selected',
  args: { selectedId: 'i1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /MS-01 stopped sending data/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(canvasElement.querySelector('[data-problem=i1]')).toHaveAttribute('data-selected', 'true');
    await expect(canvas.getByRole('button', { name: 'Reconnect MS-01' })).toBeVisible();
  },
};

export const FixInProgress: Story = {
  name: 'Fix in progress',
  args: { selectedId: 'i1', actionStatus: { i1: 'pending' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const fix = canvasElement.querySelector('[data-action="i1:reconnect"]') as HTMLElement;
    await expect(fix).toHaveTextContent('Reconnecting…');
    await expect(fix).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByText('Waiting for MS-01…')).toBeVisible();
    await userEvent.click(fix);
    await expect(args.onAction).not.toHaveBeenCalled();
  },
};

export const FixDidntWork: Story = {
  name: 'Fix didn’t work',
  args: { selectedId: 'i1', actionStatus: { i1: 'failed' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('MS-01 didn’t answer. Check its cable and power, then try again.');
    const retry = canvas.getByRole('button', { name: 'Try again' });
    await userEvent.click(retry);
    await expect(args.onAction).toHaveBeenCalledWith('i1', 'reconnect');
    await expect(canvas.getByText('3 problems need attention · 1 notice')).toBeVisible();
  },
};

export const Fixed: Story = {
  args: { problems: LIVE.slice(1, 3), resolved: RESOLVED, defaultResolvedOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('2 problems need attention')).toBeVisible();
    const toggle = canvas.getByRole('button', { name: '2 resolved in this session' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Fixed at 14:05:20')).toBeVisible();
    await expect(canvas.getByText('Dismissed at 14:05:31')).toBeVisible();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('Fixed at 14:05:20')).toBeNull();
  },
};

export const NoProblems: Story = {
  name: 'No problems',
  args: { problems: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No problems')).toBeVisible();
    await expect(canvas.getByText(/Last checked 14:05:12\./)).toBeVisible();
  },
};

export const RecordingWithAGap: Story = {
  name: 'Recording with a gap',
  args: { problems: RECORDED, selectedId: 'r1' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nothing needs attention · 1 notice')).toBeVisible();
    await expect(canvas.getByText('CO₂ and O₂ signals')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Show on chart' }));
    await expect(args.onAction).toHaveBeenCalledWith('r1', 'show');
  },
};

/** The header chip: error, warning and neutral styling, each with an icon and words. */
export const HeaderTrigger: Story = {
  name: 'Header trigger',
  args: { onNavigate: fn() },
  parameters: { previewWidth: 360 },
  render: args => <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
    <ProblemsTrigger problems={LIVE} onOpen={() => args.onNavigate('problems')} />
    <ProblemsTrigger problems={LIVE.slice(1)} onOpen={() => args.onNavigate('problems')} />
    <ProblemsTrigger problems={RECORDED} onOpen={() => args.onNavigate('problems')} />
    <ProblemsTrigger problems={[]} onOpen={() => args.onNavigate('problems')} />
  </div>,
  play: async ({ canvasElement, args }) => {
    const triggers = [...canvasElement.querySelectorAll<HTMLElement>('.dv-prob-trigger')];
    await expect(triggers.map(t => [t.textContent, t.dataset.severity, !!t.querySelector('svg')])).toEqual([
      ['3 problems need attention', 'error', true],
      ['2 problems need attention', 'warning', true],
      ['1 notice', 'clear', true],
      ['No problems', 'clear', true],
    ]);
    await userEvent.click(triggers[0]);
    await expect(args.onNavigate).toHaveBeenCalledWith('problems');
  },
};

/** A workspace panel highlighted by the selected problem. */
export const HighlightedPanel: Story = {
  name: 'Highlighted panel',
  args: { selectedId: 'i1' },
  parameters: { previewWidth: 960 },
  render: args => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
    {[READINGS, PRESSURE, SAMPLES].map(panel => {
      const flag = problemFlag(args.problems, args.selectedId, panel.id);
      return <AffectedPanelFlag key={panel.id} severity={flag?.severity} label={flag?.label}>
        <section aria-label={panel.title} style={{ background: 'var(--dv-paper)', border: '1px solid var(--dv-line)', borderRadius: 8, padding: '12px 14px 14px', minHeight: 96 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{panel.title}</h3>
        </section>
      </AffectedPanelFlag>;
    })}
  </div>,
  play: async ({ canvasElement }) => {
    const flagged = canvasElement.querySelectorAll('.dv-prob-flagged[data-flag]');
    await expect(flagged).toHaveLength(2);
    await expect(flagged[0]).toHaveAttribute('data-flag', 'error');
    await expect(within(flagged[0] as HTMLElement).getByText('MS-01 stopped sending data')).toBeVisible();
    // A small tile cuts the flag, so the flag keeps the full problem as a tooltip.
    await expect(flagged[0].querySelector('.dv-prob-flag')).toHaveAttribute('title', 'MS-01 stopped sending data');
    await expect(within(flagged[0] as HTMLElement).getByText('Current readings')).toBeVisible();
    await expect(canvasElement.querySelector('[aria-label="CO₂ pressure"]')!.parentElement).not.toHaveAttribute('data-flag');
  },
};
