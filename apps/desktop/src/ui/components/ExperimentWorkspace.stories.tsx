import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PlaybackChartCard, PlaybackTransport, RecordedSamples, StreamCard, sampleIndexAt, type PlaybackTransportProps } from './ExperimentWorkspace';
import { liveStreams, recordedChannels, recordedSamples, recordedSamplesWithGap } from './ExperimentWorkspace.fixtures';

/** The compact sticky playback transport (sticky-playback-review.html). Position and play state are owned by the page.
 *  The page's workspace container is what switches the bar to two rows when narrow, so the harness provides one. */
function Transport(args: PlaybackTransportProps) {
  const [position, setPosition] = useState(args.position), [playing, setPlaying] = useState(args.playing), [speed, setSpeed] = useState(args.speed);
  return <div className="dv-workspace-body"><div className="dv-xw-recorded"><PlaybackTransport {...args} position={position} playing={playing} speed={speed}
    sampleIndex={sampleIndexAt(recordedSamples, position)}
    onSeek={value => { setPosition(value); args.onSeek(value); }} onPlayingChange={value => { setPlaying(value); args.onPlayingChange(value); }} onSpeedChange={value => { setSpeed(value); args.onSpeedChange(value); }} /></div></div>;
}

const meta = {
  title: 'Components/ExperimentWorkspace', component: PlaybackTransport, parameters: { previewWidth: 1010 },
  args: { position: 42, duration: 300, playing: false, speed: 1, sampleIndex: 84, sampleCount: 601, step: 0.5, onSeek: fn(), onPlayingChange: fn(), onSpeedChange: fn() },
  render: args => <Transport {...args} />,
} satisfies Meta<typeof PlaybackTransport>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Paused at 42 s: steps move by one sample; the slider seeks and pauses. */
export const TransportPaused: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('.dv-xw-transport')!.getBoundingClientRect().height).toBe(52);
    await userEvent.click(canvas.getByRole('button', { name: 'Next sample' }));
    await expect(args.onSeek).toHaveBeenLastCalledWith(42.5);
    await expect(canvas.getByRole('group', { name: 'Recording playback' })).toHaveTextContent('Sample 86 / 601');
    await userEvent.click(canvas.getByRole('button', { name: 'Play recording' }));
    await expect(args.onPlayingChange).toHaveBeenLastCalledWith(true);
    await expect(canvas.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  },
};
export const TransportPlaying: Story = { args: { playing: true } };
/** At the end the primary button replays from the start. */
export const TransportEnded: Story = { args: { position: 300 },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Replay recording' }));
    await expect(args.onSeek).toHaveBeenCalledWith(0);
  },
};

/** Live stream cards: live, no recent data, not captured. */
export const StreamCards: Story = {
  render: () => <div className="dv-xw-live"><div className="dv-xw-streams">
    <StreamCard stream={liveStreams[0]} /><StreamCard stream={liveStreams[1]} stale /><StreamCard stream={liveStreams[2]} />
  </div></div>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No recent data')).toBeVisible();
    await expect(canvasElement.querySelector('.dv-xw-stream svg[role=img]')!.getBoundingClientRect().height).toBe(100);
  },
};

/** Playback charts; the second recording has a 15 s gap, so its line breaks there. */
export const PlaybackCharts: Story = {
  render: () => <div className="dv-xw-recorded"><div className="dv-xw-charts">
    <PlaybackChartCard channel={recordedChannels[0]} rows={recordedSamples} position={42} duration={300} />
    <PlaybackChartCard channel={recordedChannels[1]} rows={recordedSamplesWithGap} position={42} duration={300} />
  </div></div>,
  play: async ({ canvasElement }) => {
    const lines = canvasElement.querySelectorAll('.dv-trace-line');
    await expect(lines[0].getAttribute('d')!.match(/M/g)).toHaveLength(1);
    await expect(lines[1].getAttribute('d')!.match(/M/g)).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-pb-value=mass44]')).toHaveTextContent('2.200');
  },
};

/** Paginated samples; Show current sample pages to the playhead. */
export const Samples: Story = {
  render: () => <div className="dv-xw-recorded"><RecordedSamples rows={recordedSamples} position={42} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('1–10 of 601 samples')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Show current sample' }));
    await expect(canvasElement.querySelector('tr[data-current=true]')).toHaveTextContent('42.0');
    await expect(canvas.getByText('9 / 61')).toBeVisible();
  },
};
