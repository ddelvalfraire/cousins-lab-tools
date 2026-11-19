import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconArrowRight, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState, Panel, StatusBanner } from '@/shared/ui/Primitives';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  revision: number;
  panels: number;
}
export function TemplateCard({
  template,
  onOpen,
}: {
  template: TemplateSummary;
  onOpen?: (id: string) => void;
}) {
  const [message, setMessage] = useState(false);
  return (
    <Paper className="dv-panel" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Badge variant="light" color="forest">
            {template.panels} panels
          </Badge>
          <Text size="xs" c="dimmed">
            Revision {template.revision}
          </Text>
        </Group>
        <Title order={3}>{template.name}</Title>
        <Text size="sm" c="dimmed">
          {template.description}
        </Text>
        <Button
          variant="default"
          rightSection={<IconArrowRight size={15} aria-hidden />}
          onClick={() => (onOpen ? onOpen(template.id) : setMessage(true))}
        >
          Open template
        </Button>
        {message && (
          <StatusBanner>
            Template selected. Choose compatible data sources to continue.
          </StatusBanner>
        )}
      </Stack>
    </Paper>
  );
}
export function TemplateLibrary({
  templates = [],
  empty = false,
  loading = false,
  failed = false,
}: {
  templates?: TemplateSummary[];
  empty?: boolean;
  loading?: boolean;
  failed?: boolean;
}) {
  const [search, setSearch] = useState('');
  const matches = empty
    ? []
    : templates.filter((item) =>
        item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      );
  return (
    <Panel title="Template library">
      <Stack>
        <TextInput
          label="Search templates"
          leftSection={<IconSearch size={15} aria-hidden />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="Search by name"
        />
        {loading ? (
          <EmptyState
            title="Loading templates"
            message="Reading the local catalog."
            loading
          />
        ) : failed ? (
          <StatusBanner severity="error">
            The catalog is unavailable. Your recordings have not changed.
          </StatusBanner>
        ) : matches.length ? (
          <div className="dv-grid">
            {matches.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={search ? 'No matching templates' : 'No templates yet'}
            message={
              search
                ? 'Try a different name.'
                : 'Import a definition or create one through the catalog API.'
            }
          />
        )}
      </Stack>
    </Panel>
  );
}
export function DefinitionEditor({
  state = 'editing',
  onSave,
}: {
  state?: 'editing' | 'pending' | 'conflict' | 'failed' | 'unknown';
  onSave?: (draft: { name: string; note: string }) => void;
}) {
  const [name, setName] = useState('Gas exchange'),
    [note, setNote] = useState(''),
    [saved, setSaved] = useState(false);
  const messages = {
    editing: '',
    pending:
      'Saving the submitted revision. Further edits remain in your draft.',
    conflict:
      'The saved head changed. Compare revisions; your draft is retained.',
    failed: 'The revision could not be saved. Your draft is retained.',
    unknown:
      'Save outcome unknown. Reconcile the existing request before retrying.',
  };
  return (
    <Panel title="Template revision">
      <Stack>
        <TextInput
          label="Template name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setSaved(false);
          }}
        />
        <TextInput
          label="Change note"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        {messages[state] && (
          <StatusBanner
            severity={
              state === 'conflict' || state === 'unknown'
                ? 'warning'
                : state === 'failed'
                  ? 'error'
                  : 'info'
            }
          >
            {messages[state]}
          </StatusBanner>
        )}
        <Button
          disabled={
            !name.trim() ||
            state === 'pending' ||
            state === 'unknown' ||
            state === 'conflict'
          }
          onClick={() => {
            onSave?.({ name, note });
            setSaved(true);
          }}
        >
          Save template revision
        </Button>
        {saved && (
          <StatusBanner announce>
            Save requested. Await catalog acknowledgment.
          </StatusBanner>
        )}
      </Stack>
    </Panel>
  );
}
