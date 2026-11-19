import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useState } from 'react';
import { Panel, StatusBanner } from '@/shared/ui/Primitives';

export interface IntervalResult {
  id: string;
  sample: string;
  start: number;
  end: number;
  value: number;
  context: string;
  revision: number;
  settings?: { zero: number; scale: number };
}
export type CommandState =
  | 'ready'
  | 'running'
  | 'pending'
  | 'rejected'
  | 'unknown';
export function InstrumentControls({
  state = 'ready',
  onStart,
  onStop,
}: {
  state?: CommandState;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState('');
  const blocked = state === 'pending' || state === 'unknown';
  return (
    <Panel title="Instrument controls">
      <Stack>
        <Group justify="space-between">
          <Title order={3}>Mass spectrometer</Title>
          <Text size="xs" c="dimmed">
            {state === 'running' ? 'Acquiring' : 'Fixture state'}
          </Text>
        </Group>
        <NumberInput
          label="Collection interval (ms)"
          defaultValue={500}
          min={1}
          disabled={blocked}
        />
        {state === 'rejected' && (
          <StatusBanner severity="error">
            The controller rejected the interval change. The effective interval
            is unchanged.
          </StatusBanner>
        )}
        {state === 'unknown' && (
          <StatusBanner severity="warning">
            Command outcome unknown. Reconcile with the controller before
            issuing another action.
          </StatusBanner>
        )}
        {state === 'pending' && (
          <StatusBanner>Waiting for controller acknowledgment.</StatusBanner>
        )}
        <Group>
          <Button
            leftSection={<IconPlayerPlay size={15} aria-hidden />}
            disabled={blocked || state === 'running'}
            onClick={() => {
              onStart?.();
              setMessage('Start requested. Await controller acknowledgment.');
            }}
          >
            Start acquisition
          </Button>
          <Button
            color="red"
            variant="light"
            leftSection={<IconPlayerStop size={15} aria-hidden />}
            disabled={blocked || state !== 'running'}
            onClick={() => setConfirm(true)}
          >
            Stop acquisition
          </Button>
        </Group>
        {message && <StatusBanner announce>{message}</StatusBanner>}
        <Text size="xs" c="dimmed">
          Explicit instrument actions. Closing a display does not stop
          acquisition.
        </Text>
        <Modal
          opened={confirm}
          onClose={() => setConfirm(false)}
          title="Stop acquisition?"
          centered
        >
          <Stack>
            <Text size="sm">
              Stop the mass spectrometer acquisition? Previously recorded
              samples remain available.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirm(false)}>
                Keep acquiring
              </Button>
              <Button
                color="red"
                onClick={() => {
                  onStop?.();
                  setConfirm(false);
                  setMessage(
                    'Stop requested. Await controller acknowledgment.',
                  );
                }}
              >
                Request stop
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Panel>
  );
}
