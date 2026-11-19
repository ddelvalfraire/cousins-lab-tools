import {
  ActionIcon,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Table,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
} from '@tabler/icons-react';
import { useState } from 'react';
import type uPlot from 'uplot';
import { keyedBy } from '@/shared/lib/keyedBy';
import { formatMeasurement } from '@/shared/lib/measurement';
import { seriesColors } from '@/shared/theme/theme';
import { Panel } from './Primitives';
import { type PlotSeries, ScientificPlot } from './ScientificPlot';

export function DataPlotPanel({
  title,
  data,
  series,
  xLabel = 'Time (s)',
  yLabel = 'Signal (mV)',
  selection,
  onSelection,
  height = 260,
  limits,
  logarithmic = false,
}: {
  title: string;
  data: uPlot.AlignedData;
  series: PlotSeries[];
  xLabel?: string;
  yLabel?: string;
  selection?: [number, number];
  onSelection?: (value: [number, number]) => void;
  height?: number;
  limits?: [number, number];
  logarithmic?: boolean;
}) {
  const [view, setView] = useState('chart');
  const colors = seriesColors[useComputedColorScheme('light')];
  const samples = view === 'table' ? keyedBy(Array.from(data[0]), String) : [];
  return (
    <Panel
      title={title}
      actions={
        <SegmentedControl
          size="xs"
          aria-label={`${title} presentation`}
          value={view}
          onChange={setView}
          data={[
            { label: 'Chart', value: 'chart' },
            { label: 'Table', value: 'table' },
          ]}
        />
      }
    >
      <Stack gap="sm">
        <div className="dv-legend">
          {series.map((s, i) => (
            <span key={s.label}>
              <i
                style={{
                  borderColor: s.color ?? colors[i % colors.length],
                  borderTopStyle: i === 1 ? 'dashed' : 'solid',
                }}
              />
              {s.label} <span className="dv-muted">{s.unit}</span>
            </span>
          ))}
        </div>
        {view === 'chart' ? (
          <ScientificPlot
            data={data}
            series={series}
            xLabel={xLabel}
            yLabel={yLabel}
            selection={selection}
            onSelection={onSelection}
            height={height}
            minimumWidth={300}
            limits={limits}
            logarithmic={logarithmic}
          />
        ) : (
          <section
            className="dv-table-frame"
            aria-label={`${title} samples`}
            tabIndex={0}
            style={{ height }}
          >
            <Table striped>
              <Table.Caption>{title} · displayed samples</Table.Caption>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{xLabel}</Table.Th>
                  {series.map((s) => (
                    <Table.Th key={s.label}>
                      {s.label} ({s.unit})
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {samples.map(({ key, item: x, index: i }) => (
                  <Table.Tr key={key}>
                    <Table.Td>{formatMeasurement(x)}</Table.Td>
                    {series.map((s, j) => (
                      <Table.Td key={s.label}>
                        {formatMeasurement(data[j + 1]?.[i] ?? null)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </section>
        )}
      </Stack>
    </Panel>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
export function PlaybackControls({
  duration = 360,
  position = 360,
  onPositionChange,
}: {
  duration?: number;
  position?: number;
  onPositionChange?: (position: number) => void;
}) {
  const [speed, setSpeed] = useState<string | null>('1');
  const [local, setLocal] = useState(position);
  const cursor = onPositionChange ? position : local;
  const update = (value: number) =>
    onPositionChange ? onPositionChange(value) : setLocal(value);
  const playback = useInterval(() => {
    const next = Math.min(duration, cursor + Number(speed));
    update(next);
    if (next >= duration) playback.stop();
  }, 1000);
  const playing = playback.active;
  const changeSpeed = (value: string | null) => {
    setSpeed(value);
    // A new speed waits a full second before its first step.
    if (playing) {
      playback.stop();
      playback.start();
    }
  };
  return (
    <fieldset className="dv-playback" aria-label="Recording playback">
      <ActionIcon
        size="lg"
        variant="filled"
        radius="xl"
        aria-label={playing ? 'Pause playback' : 'Play recording'}
        onClick={() => {
          if (!playing && cursor >= duration) update(0);
          playback.toggle();
        }}
      >
        {playing ? (
          <IconPlayerPause size={18} aria-hidden />
        ) : (
          <IconPlayerPlay size={18} aria-hidden />
        )}
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label="Restart recording"
        onClick={() => {
          playback.stop();
          update(0);
        }}
      >
        <IconPlayerSkipBack size={17} aria-hidden />
      </ActionIcon>
      <Text className="dv-playback-time">
        <strong>{clock(cursor)}</strong> / {clock(duration)}
      </Text>
      <div className="dv-playback-slider">
        <Slider
          thumbLabel="Playback position in seconds"
          min={0}
          max={duration}
          value={cursor}
          onChange={(value) => {
            playback.stop();
            update(value);
          }}
          label={clock}
          step={1}
        />
      </div>
      <Select
        aria-label="Playback speed"
        w={88}
        allowDeselect={false}
        value={speed}
        onChange={changeSpeed}
        data={[
          { value: '0.5', label: '0.5×' },
          { value: '1', label: '1×' },
          { value: '2', label: '2×' },
        ]}
      />
    </fieldset>
  );
}
