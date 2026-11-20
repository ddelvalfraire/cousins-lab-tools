import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconDots,
  IconDownload,
  IconSettings,
  IconSun,
  IconUpload,
} from '@tabler/icons-react';
import { useState } from 'react';
import { brand } from '@/shared/theme/theme';
import { Help, Panel, StatusBanner } from './Primitives';

export function ColorPalette() {
  return (
    <Stack>
      <Title order={2}>GREEN FIELD</Title>
      <div className="dv-grid">
        {Object.entries(brand).map(([name, value]) => (
          <div className="dv-foundation-swatch" key={name}>
            <div style={{ background: value, height: 64 }} />
            <Stack gap={2} p="sm">
              <Text fw={600} tt="capitalize">
                {name}
              </Text>
              <Text size="xs" c="dimmed">
                {value}
              </Text>
            </Stack>
          </div>
        ))}
      </div>
      <StatusBanner>
        Brand colors do not replace scientific series identities or severity
        colors.
      </StatusBanner>
      <Text size="xs" c="dimmed">
        System font is provisional. The header shows the DVDash icon from
        assets/branding/dvdash beside the wordmark set in the system font.
      </Text>
    </Stack>
  );
}
export function Typography() {
  return (
    <Stack>
      <Title order={1}>Gas exchange</Title>
      <Title order={2}>Calibration results</Title>
      <Title order={3}>Selected interval</Title>
      <Text>Use the selected recording to inspect signal changes.</Text>
      <Text size="sm" c="dimmed">
        Sample 024 · template revision 3
      </Text>
      <div className="dv-readout">
        <span className="dv-value">12.480</span>
        <span className="dv-unit">mV</span>
      </div>
    </Stack>
  );
}
export function LayoutPrimitives() {
  return (
    <Stack>
      <Text size="sm">
        Compose Mantine Stack, Group, Grid, Paper and Divider directly. No
        separate spacing-component library.
      </Text>
      {[8, 16, 24].map((space) => (
        <Group key={space}>
          <Text size="xs" w={65}>
            {space} px
          </Text>
          <div style={{ height: 14, width: space, background: brand.jade }} />
        </Group>
      ))}
      <Divider label="Section boundary" />
      <div className="dv-grid">
        <Paper p="md" className="dv-panel">
          <Title order={3}>Signal group</Title>
          <Text size="sm" c="dimmed">
            Independent panels share layout spacing.
          </Text>
        </Paper>
        <Paper p="md" className="dv-panel">
          <Title order={3}>Result group</Title>
          <Text size="sm" c="dimmed">
            Cards wrap without clipping long content.
          </Text>
        </Paper>
      </div>
    </Stack>
  );
}
export function StandardControls() {
  const [message, setMessage] = useState('');
  return (
    <Stack>
      <Group>
        <Button onClick={() => setMessage('Primary action selected.')}>
          Save revision
        </Button>
        <Button
          variant="default"
          onClick={() => setMessage('Secondary action selected.')}
        >
          Cancel
        </Button>
        <Button
          variant="subtle"
          onClick={() => setMessage('Tertiary action selected.')}
        >
          Compare
        </Button>
        <Button disabled>Unavailable</Button>
      </Group>
      <Group>
        <Badge color="forest">Recording</Badge>
        <Badge color="yellow">Needs review</Badge>
        <Help label="About revision status">
          A saved revision is immutable.
        </Help>
        <ActionIcon
          variant="default"
          aria-label="Display preferences"
          onClick={() => setMessage('Preferences selected.')}
        >
          <IconSun size={17} aria-hidden />
        </ActionIcon>
      </Group>
      {message && <StatusBanner announce>{message}</StatusBanner>}
    </Stack>
  );
}
export function Overlays() {
  const [modal, setModal] = useState(false),
    [drawer, setDrawer] = useState(false),
    [message, setMessage] = useState('');
  return (
    <Panel
      title="Panel actions"
      actions={
        <Menu>
          <Menu.Target>
            <ActionIcon variant="default" aria-label="Panel options">
              <IconDots size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconUpload size={14} aria-hidden />}
              onClick={() => setMessage('Import selected in this example.')}
            >
              Import definition
            </Menu.Item>
            <Menu.Item
              leftSection={<IconDownload size={14} aria-hidden />}
              onClick={() => setMessage('Export selected in this example.')}
            >
              Export definition
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSettings size={14} aria-hidden />}
              onClick={() => setDrawer(true)}
            >
              Panel settings
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
    >
      <Stack>
        <Group>
          <Button variant="default" onClick={() => setModal(true)}>
            Review revision
          </Button>
          <Button variant="default" onClick={() => setDrawer(true)}>
            Open settings
          </Button>
        </Group>
        {message && <StatusBanner announce>{message}</StatusBanner>}
        <Modal
          opened={modal}
          onClose={() => setModal(false)}
          title="Review revision"
          centered
        >
          <Stack>
            <Text>Earlier results retain their original revision context.</Text>
            <Button onClick={() => setModal(false)}>Close review</Button>
          </Stack>
        </Modal>
        <Drawer
          opened={drawer}
          onClose={() => setDrawer(false)}
          title="Panel settings"
          position="right"
        >
          <Text size="sm">
            Use the dedicated scale and precision panel for scientific display
            settings.
          </Text>
        </Drawer>
      </Stack>
    </Panel>
  );
}
