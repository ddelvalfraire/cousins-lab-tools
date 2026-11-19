import { composeStories } from '@storybook/react-vite';
import { type ComponentType, createElement } from 'react';

// The gallery consumes standard CSF stories. It never defines component states.
type StoryModule = Parameters<typeof composeStories>[0];
type PortableStory = ComponentType & {
  id: string;
  storyName: string;
  parameters: { previewWidth?: number; gallery?: boolean };
};
const modules = import.meta.glob<StoryModule>(
  [
    './components/*.stories.tsx',
    '../features/*/*.stories.tsx',
    '../shared/*/*.stories.tsx',
  ],
  {
    eager: true,
  },
);
export const reviewCases = Object.values(modules)
  .flatMap((module) => {
    const title = String(module.default.title);
    const stories = composeStories(module) as Record<string, PortableStory>;
    // Stories that open a modal dialog or drawer on load cover the whole gallery page, so they stay on their own pages.
    return Object.entries(stories)
      .filter(([, Story]) => Story.parameters.gallery !== false)
      .map(([name, Story]) => ({
        id: Story.id,
        group: title.split('/')[0],
        width: Story.parameters.previewWidth ?? 720,
        title: `${title.split('/').slice(1).join('/')} / ${Story.storyName ?? name}`,
        render: () => createElement(Story as ComponentType),
      }));
  })
  .sort((a, b) => a.title.localeCompare(b.title));
