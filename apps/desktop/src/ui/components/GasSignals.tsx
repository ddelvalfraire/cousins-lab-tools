import { useMemo, useState } from 'react';
import { Button, Group, NumberInput, Stack, Text, useComputedColorScheme } from '@mantine/core';
import type uPlot from 'uplot';
import { Panel, StatusBanner } from './Primitives';
import { Presence } from './Motion';
import { ScientificPlot } from './SignalChart';
import { seriesColors } from '../theme';

export function GasSignals({ data, interval = [120,180], onIntervalChange, onValidityChange, onCaptureReference }: {
  data: uPlot.AlignedData; interval?: [number, number]; onIntervalChange?: (interval: [number, number]) => void;
  onValidityChange?: (valid: boolean) => void; onCaptureReference?: () => void;
}) {
  const [start, setStart] = useState<number | string>(interval[0]), [end, setEnd] = useState<number | string>(interval[1]);
  const [zoom, setZoom] = useState(false), [visible, setVisible] = useState([true,true]), [message, setMessage] = useState('');
  const colors = seriesColors[useComputedColorScheme('light')];
  const min = data[0][0] ?? 0, max = data[0][data[0].length - 1] ?? 360;
  const valid = typeof start === 'number' && typeof end === 'number' && start >= min && end <= max && start < end;
  const presented = useMemo<uPlot.AlignedData>(() => [data[0], visible[0] ? data[1] : Array.from({length:data[1].length},() => null), visible[1] ? data[2] : Array.from({length:data[2].length},() => null)], [data,visible]);
  const update = (a: number | string, b: number | string) => {
    setStart(a); setEnd(b); setMessage('');
    const ok = typeof a === 'number' && typeof b === 'number' && a >= min && b <= max && a < b;
    onValidityChange?.(ok);
    if (ok) onIntervalChange?.([a,b]);
  };
  return <Panel title="Gas signals" description="Select the interval used for the readouts and result."><Stack gap="md">
    <Group gap="xs"><Button size="xs" variant={zoom ? 'default' : 'filled'} onClick={() => setZoom(false)}>Full recording</Button><Button size="xs" variant={zoom ? 'filled' : 'default'} disabled={!valid} onClick={() => setZoom(true)}>Zoom to selection</Button></Group>
    <Group gap="xs">{['CO₂','O₂'].map((label,index) => <Button key={label} size="compact-xs" variant="default" aria-pressed={visible[index]} onClick={() => setVisible(current => current.map((value,i) => i === index ? !value : value))}><span className="dv-legend"><span><i style={{ borderColor: index ? colors[2] : colors[0], borderTopStyle: index ? 'dashed' : 'solid' }} />{label} <span className="dv-muted">nmol/mL</span></span></span></Button>)}</Group>
    <ScientificPlot data={presented} xLabel="Time (s)" yLabel="Concentration (nmol/mL)" series={[{ label:'CO₂',unit:'nmol/mL',color:colors[0] },{ label:'O₂',unit:'nmol/mL',color:colors[2] }]} selection={interval} range={zoom && valid ? [Number(start),Number(end)] : undefined} onSelection={pair => update(pair[0],pair[1])} />
    <div className="dv-input-grid"><NumberInput label="Selection start (s)" value={start} onChange={value => update(value,end)} min={min} max={max} /><NumberInput label="Selection end (s)" value={end} onChange={value => update(start,value)} min={min} max={max} /></div>
    <Presence show={!valid}><StatusBanner severity="error">Enter an interval within the recording, with its start before its end.</StatusBanner></Presence>
    <Group><Button variant="default" size="xs" disabled={!valid} onClick={() => { onCaptureReference?.(); setMessage('Reference interval captured for this local example.'); }}>Capture reference interval</Button></Group>
    <Presence show={!!message}><StatusBanner announce>{message}</StatusBanner></Presence>
    <Text size="xs" c="dimmed">Selection and display controls do not alter recorded samples.</Text>
  </Stack></Panel>;
}
