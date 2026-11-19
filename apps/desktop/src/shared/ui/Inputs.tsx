import {
  Button,
  Checkbox,
  FileInput,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconFileImport } from '@tabler/icons-react';
import { type ReactNode, useId, useState } from 'react';
import {
  Panel,
  type Severity,
  StatusBanner,
  StatusMessages,
} from './Primitives';
import { ScientificQuantityInput } from './ScientificQuantityInput';

export type FieldKind =
  | 'quantity'
  | 'count'
  | 'timing'
  | 'text'
  | 'choice'
  | 'multiple'
  | 'boolean'
  | 'file'
  | 'note';
export function ParameterField({
  kind = 'quantity',
  invalid = false,
  warning = false,
  disabled = false,
  label,
}: {
  kind?: FieldKind;
  invalid?: boolean;
  warning?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [number, setNumber] = useState<number | string>(
    kind === 'count' ? 10 : kind === 'timing' ? 500 : 12.48,
  );
  const [text, setText] = useState('Sample 024');
  const error = invalid
    ? kind === 'quantity'
      ? 'Enter a value between 0 and 20 mV.'
      : 'Enter a supported value before saving.'
    : undefined;
  const shared = {
    disabled,
    error: !!error,
    'aria-describedby': error || warning ? id : undefined,
  };
  const title =
    label ??
    {
      quantity: 'Signal offset (mV)',
      count: 'Sample count',
      timing: 'Interval (ms)',
      text: 'Sample name',
      choice: 'Signal',
      multiple: 'Visible signals',
      boolean: 'Include reference recording',
      file: 'Recording file',
      note: 'Experiment notes',
    }[kind];
  if (kind === 'quantity')
    return (
      <ScientificQuantityInput
        label={label ?? 'Raw signal'}
        disabled={disabled}
        invalid={invalid}
        warning={warning}
      />
    );
  let field: ReactNode;
  if (kind === 'count' || kind === 'timing')
    field = (
      <NumberInput
        {...shared}
        label={title}
        value={number}
        onChange={setNumber}
        allowDecimal={kind === 'timing'}
        min={0}
      />
    );
  else if (kind === 'text')
    field = (
      <TextInput
        {...shared}
        label={title}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
    );
  else if (kind === 'choice')
    field = (
      <Select
        {...shared}
        label={title}
        defaultValue="Mass 44"
        data={['Mass 44', 'Mass 49']}
      />
    );
  else if (kind === 'multiple')
    field = (
      <MultiSelect
        {...shared}
        label={title}
        defaultValue={['Mass 44', 'Mass 49']}
        data={['Mass 44', 'Mass 49', 'Mass 28']}
      />
    );
  else if (kind === 'boolean') field = <Checkbox {...shared} label={title} />;
  else if (kind === 'file')
    field = (
      <FileInput
        {...shared}
        label={title}
        leftSection={<IconFileImport size={16} aria-hidden />}
        placeholder="Choose a recording"
        accept=".csv,.json"
      />
    );
  else
    field = (
      <Textarea
        {...shared}
        label={title}
        minRows={3}
        placeholder="Add an observation"
      />
    );
  return (
    <div>
      {field}
      {(error || warning) && (
        <div id={id} className="dv-field-feedback">
          <StatusBanner severity={error ? 'error' : 'warning'}>
            {error ?? 'This setting differs from the saved experiment.'}
          </StatusBanner>
        </div>
      )}
    </div>
  );
}
export function ParameterForm({ invalid = false }: { invalid?: boolean }) {
  const [count, setCount] = useState<number | string>(100),
    [interval, setInterval] = useState<number | string>(0.05);
  const valid =
    typeof count === 'number' &&
    typeof interval === 'number' &&
    count > 0 &&
    interval > 0;
  return (
    <Panel title="Quantities, counts and timing">
      <Stack>
        <div className="dv-quantity-form">
          <ScientificQuantityInput invalid={invalid} />
          <NumberInput
            label="Measurement count"
            value={count}
            onChange={setCount}
            min={1}
            allowDecimal={false}
          />
          <NumberInput
            label="Sample interval (s)"
            value={interval}
            onChange={setInterval}
            min={0.001}
            decimalScale={3}
            step={0.01}
          />
        </div>
        <div className="dv-form-summary">
          <Text size="xs" c="dimmed">
            Estimated measurement time
          </Text>
          <Text size="sm">
            <strong>
              {valid ? (Number(count) * Number(interval)).toFixed(2) : '—'} s
            </strong>{' '}
            <span className="dv-muted">plus device overhead</span>
          </Text>
        </div>
      </Stack>
    </Panel>
  );
}
export function SourceBindings({
  missing = false,
  incompatible = false,
}: {
  missing?: boolean;
  incompatible?: boolean;
}) {
  const [source, setSource] = useState<string | null>(
    missing ? null : 'recording-024',
  );
  const [message, setMessage] = useState('');
  return (
    <Panel title="Data sources">
      <Stack>
        <Select
          label="Mass spectrometer role"
          placeholder="Choose a source"
          value={source}
          onChange={setSource}
          data={[
            { value: 'recording-024', label: 'Sample 024 · recording' },
            { value: 'recording-025', label: 'Sample 025 · recording' },
          ]}
        />
        <Select
          label="Signal binding"
          data={['Mass 44 · mV', 'Mass 49 · mV']}
          defaultValue="Mass 44 · mV"
          disabled={!source}
        />
        {(!source || incompatible) && (
          <StatusBanner severity={incompatible ? 'error' : 'warning'}>
            {incompatible
              ? 'The selected source does not supply the required voltage signal.'
              : 'Choose a source for the mass spectrometer role. Other panels remain usable.'}
          </StatusBanner>
        )}
        <Button
          variant="default"
          disabled={!source || incompatible}
          onClick={() =>
            setMessage(
              'Source selection prepared. No experiment or acquisition was changed.',
            )
          }
        >
          Prepare source selection
        </Button>
        {message && <StatusBanner>{message}</StatusBanner>}
      </Stack>
    </Panel>
  );
}
export function FormFeedback({ severity = 'error' }: { severity?: Severity }) {
  const id = useId();
  return (
    <Stack>
      <TextInput
        label="Sample name"
        defaultValue="Sample 024"
        error={severity === 'error'}
        attributes={{ input: { 'aria-describedby': id } }}
      />
      <div id={id}>
        <StatusMessages
          messages={[
            severity === 'error' && {
              severity,
              text: 'Sample name: enter a supported value before saving.',
            },
            severity === 'warning' && {
              severity,
              text: 'Sample name differs from the saved experiment.',
            },
            {
              severity,
              text:
                severity === 'error'
                  ? 'Review the highlighted fields before saving.'
                  : 'Existing results keep their saved settings.',
            },
          ]}
        />
      </div>
    </Stack>
  );
}
