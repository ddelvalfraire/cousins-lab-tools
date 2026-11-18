import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRoot } from 'react-dom/client';
import { expect, waitFor } from 'storybook/test';
import { AppearanceProvider, STORAGE_KEY, useAppearance } from '../appearance';
import { dvdashTheme } from '../theme';

const SCHEME_ATTRIBUTE = 'data-mantine-color-scheme';
const html = () => document.documentElement;

function ShowingScheme() {
  const appearance = useAppearance();
  return <p>Showing the {appearance.scheme} scheme.</p>;
}

/** Reads the root's scheme from a ref callback, which runs after the provider's mount work in the same commit. */
function AfterProvider({ onFrame }: { onFrame: (scheme: string) => void }) {
  return (
    <span
      ref={(node) => {
        if (node) onFrame(html().getAttribute(SCHEME_ATTRIBUTE) ?? '');
      }}
    />
  );
}

/** Renders an uncontrolled provider in its own root and reports the scheme the browser would paint first. */
function renderUncontrolled() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const firstFrame = new Promise<string>((resolve) => {
    root.render(
      <>
        <AppearanceProvider theme={dvdashTheme} />
        <AfterProvider onFrame={resolve} />
      </>,
    );
  });
  return {
    firstFrame,
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

const meta = {
  title: 'Foundations/Appearance provider',
  component: ShowingScheme,
  parameters: { previewWidth: 480 },
} satisfies Meta<typeof ShowingScheme>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A saved scheme is on the root before the app's first frame, so a dark window never paints light first. A scheme
 * saved by another window reaches this one too.
 */
export const SavedSchemeAppliesBeforeFirstPaint: Story = {
  play: async () => {
    const saved = localStorage.getItem(STORAGE_KEY),
      shown = html().getAttribute(SCHEME_ATTRIBUTE) ?? 'light';
    localStorage.setItem(STORAGE_KEY, 'dark');
    const app = renderUncontrolled();
    try {
      await expect(await app.firstFrame).toBe('dark');
      localStorage.setItem(STORAGE_KEY, 'light');
      // The provider listens from its first passive effect, which may run after the first frame.
      await waitFor(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: STORAGE_KEY,
            newValue: 'light',
            storageArea: localStorage,
          }),
        );
        expect(html()).toHaveAttribute(SCHEME_ATTRIBUTE, 'light');
      });
      await waitFor(() =>
        expect(html()).not.toHaveAttribute('data-dv-theme-reveal'),
      );
    } finally {
      app.unmount();
      if (saved === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, saved);
      html().setAttribute(SCHEME_ATTRIBUTE, shown);
    }
  },
};
