import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconChartLine, IconHelp, IconRefresh } from '@tabler/icons-react';
import { isValidElement, type ReactNode } from 'react';
import identityBoard from '../../../../../design/dvdash-field-review/identity-review.png';
import { formatMeasurement } from '../measurement';
import { Banner } from './Banner';
import { keyedBy } from './keyedBy';
export type Severity = 'info' | 'warning' | 'error' | 'success';
/** The approved banner, keeping the older call signature. Any fix renders inline after the text. */
export function StatusBanner({
  severity = 'info',
  children,
  action,
  announce = false,
}: {
  severity?: Severity;
  children: ReactNode;
  action?: ReactNode;
  announce?: boolean;
}) {
  // Plain text stays inline so the fix follows it on the same line; a list keeps its block wrapper.
  const list = isValidElement(children) && children.type === 'ul';
  return (
    <Banner
      severity={severity}
      action={action}
      announce={announce}
      className={`dv-banner dv-banner-${severity}`}
    >
      {list ? (
        <div className="dv-banner-content">{children}</div>
      ) : (
        <span className="dv-banner-content">{children}</span>
      )}
    </Banner>
  );
}
export interface StatusMessage {
  severity: Severity;
  text: string;
}
/** Related feedback shares one banner; the list remains fully expanded. */
export function StatusMessages({
  messages,
  action,
  announce = false,
}: {
  messages: readonly (StatusMessage | false | null | undefined)[];
  action?: ReactNode;
  announce?: boolean;
}) {
  const items = messages.filter((item): item is StatusMessage => !!item);
  if (!items.length) return null;
  const severity = (['error', 'warning', 'info', 'success'] as const).find(
    (tone) => items.some((item) => item.severity === tone),
  )!;
  const mixed = items.some((item) => item.severity !== severity);
  return (
    <StatusBanner severity={severity} action={action} announce={announce}>
      {items.length === 1 ? (
        items[0].text
      ) : (
        <ul className="dv-message-list">
          {keyedBy(items, (item) => item.text).map(({ key, item }) => (
            <li key={key}>
              {mixed && (
                <strong className="dv-message-tone">{item.severity}: </strong>
              )}
              {item.text}
            </li>
          ))}
        </ul>
      )}
    </StatusBanner>
  );
}
export function Help({ label, children }: { label: string; children: string }) {
  return (
    <Tooltip
      label={children}
      multiline
      w={240}
      events={{ hover: true, focus: true, touch: true }}
    >
      <ActionIcon variant="subtle" size="xs" color="gray" aria-label={label}>
        <IconHelp size={16} aria-hidden />
      </ActionIcon>
    </Tooltip>
  );
}
export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper className="dv-panel">
      <div className="dv-panel-head">
        <div>
          <Title order={2}>{title}</Title>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </div>
        {actions}
      </div>
      <div className="dv-panel-body">{children}</div>
    </Paper>
  );
}
export type ReadoutState =
  | 'recorded'
  | 'live'
  | 'stale'
  | 'missing'
  | 'pending';
export function Readout({
  label,
  value,
  unit,
  state = 'recorded',
  unitDescription,
  contextLabel,
  locale = 'en-US',
}: {
  label: string;
  value: number | null;
  unit: string;
  state?: ReadoutState;
  unitDescription?: string;
  contextLabel?: string;
  locale?: string;
}) {
  const messages: Record<ReadoutState, [Severity, string]> = {
    recorded: ['info', 'Recorded interval · c2'],
    live: ['success', 'Live · receiving samples'],
    stale: ['warning', 'Stale · last received 12 s ago'],
    missing: ['error', `Unavailable · ${label} is missing`],
    pending: ['info', 'Waiting for the first sample'],
  };
  const effectiveState =
    value === null || !Number.isFinite(value)
      ? state === 'pending'
        ? 'pending'
        : 'missing'
      : state;
  const [severity, message] = messages[effectiveState];
  const explanation =
    unitDescription ??
    `Measured in ${unit}. Display updates do not modify original samples.`;
  return (
    <Paper className="dv-panel dv-readout-card">
      <Group gap={6}>
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        <Help label={`About ${label}`}>{explanation}</Help>
      </Group>
      <div className="dv-readout">
        <span className="dv-value">
          {effectiveState === 'missing'
            ? '—'
            : formatMeasurement(value, 3, locale)}
        </span>
        <Tooltip
          label={explanation}
          multiline
          w={240}
          events={{ hover: true, focus: true, touch: true }}
        >
          <span
            className="dv-unit"
            tabIndex={0}
            aria-label={`${unit}: ${explanation}`}
          >
            {unit}
          </span>
        </Tooltip>
      </div>
      <StatusBanner severity={severity}>
        {effectiveState === 'missing' ? message : (contextLabel ?? message)}
      </StatusBanner>
    </Paper>
  );
}
export function WorkspaceHeader({
  title = 'Gas exchange',
  revision = 3,
}: {
  title?: string;
  revision?: number;
}) {
  return (
    <header className="dv-header">
      <div className="dv-header-top">
        <div className="dv-brand">
          <span
            className="dv-brand-concept"
            title="Selected GREEN FIELD concept crop; production vector pending"
          >
            <img src={identityBoard} alt="GREEN FIELD concept mark" />
          </span>
          DVDash
        </div>
        <nav aria-label="Experiment workspace" className="dv-workspace-nav">
          <span>Templates</span>
          <span aria-current="page">Experiment</span>
          <span>Revisions</span>
          <span>Experiments</span>
          <span>Instruments</span>
        </nav>
      </div>
      <div className="dv-header-context">
        <div>
          <Title order={1}>{title}</Title>
          <Text size="xs" c="dimmed">
            Recorded experiment · template R{revision} · MS-01
          </Text>
        </div>
        <Badge color="forest" variant="light">
          Recording
        </Badge>
      </div>
    </header>
  );
}
export function EmptyState({
  title = 'No samples yet',
  message = 'The selected recording contains no samples.',
  onRetry,
  loading = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  loading?: boolean;
}) {
  return (
    <Stack align="center" py="xl" gap="sm">
      {loading ? (
        <Loader size="sm" role="img" aria-label="Loading" />
      ) : (
        <IconChartLine size={30} aria-hidden />
      )}
      <Title order={3}>{title}</Title>
      <Text size="sm" c="dimmed" ta="center" maw={340}>
        {message}
      </Text>
      {onRetry && (
        <Button
          variant="default"
          leftSection={<IconRefresh size={15} aria-hidden />}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </Stack>
  );
}
