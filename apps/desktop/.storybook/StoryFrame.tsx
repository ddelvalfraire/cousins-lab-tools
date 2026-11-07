import type { ReactNode } from 'react';

/** Example width in px, or `'viewport'` for full-window screens (the application frame) that fill the canvas. */
export type PreviewWidth = number | 'viewport';

/** Example context only: never constrain the production component itself. */
export function StoryFrame({ width = 720, children }: { width?: PreviewWidth; children: ReactNode }) {
  return <div data-story-frame style={{ width: '100%', maxWidth: width === 'viewport' ? 'none' : width, marginInline: 'auto', minWidth: 0 }}>{children}</div>;
}
