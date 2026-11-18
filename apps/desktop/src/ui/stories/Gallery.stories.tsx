import {
  Badge,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { StoryFrame } from '../../../.storybook/StoryFrame';
import { reviewCases } from '../catalog';

function AllComponentsGallery() {
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState<string | null>('All');
  // Some stories move focus to a button when they open, which scrolls the page; start the gallery at the top instead.
  useEffect(() => {
    const reset = () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.scrollTo(0, 0);
    };
    const timer = window.setTimeout(reset, 400);
    return () => window.clearTimeout(timer);
  }, []);
  const matches = reviewCases.filter(
    (item) =>
      (group === 'All' || group === item.group) &&
      item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <Stack gap="xl">
      <Title order={1}>All components</Title>
      <Group grow align="start">
        <TextInput
          label="Search components"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Select
          label="Component family"
          allowDeselect={false}
          data={['All', ...new Set(reviewCases.map((item) => item.group))]}
          value={group}
          onChange={setGroup}
        />
      </Group>
      <Text size="sm">{matches.length} stories</Text>
      {matches.map((item) => (
        <section
          className="dv-review-item dv-stack"
          id={item.id}
          key={item.id}
          aria-label={item.title}
        >
          <div>
            <Badge variant="light">{item.group}</Badge>
            <Title order={2} mt="xs">
              {item.title}
            </Title>
          </div>
          <div className="dv-canvas">
            <StoryFrame width={item.width}>{item.render()}</StoryFrame>
          </div>
        </section>
      ))}
      {!matches.length && <Text>No matching components.</Text>}
    </Stack>
  );
}
const meta = {
  title: 'Gallery/All components',
  component: AllComponentsGallery,
  tags: ['!test'],
  parameters: { previewWidth: 1120 },
} satisfies Meta<typeof AllComponentsGallery>;
export default meta;
export const AllComponents: StoryObj<typeof meta> = {};
