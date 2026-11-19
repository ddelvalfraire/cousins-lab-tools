import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { reduceMotion } from '../../../.storybook/settleMotion';
import { REVEAL_MS } from './revealTarget';
import { renderScreen } from './screen-story';
import { DVDashWorkspace } from './Workspace';

const meta = {
  title: 'Screens/Settings',
  component: DVDashWorkspace,
  render: renderScreen,
  parameters: { layout: 'fullscreen', previewWidth: 'viewport' },
  args: { initialPage: 'settings' },
} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Appearance: Story = {};
/** Settings at the Largest text size, the page that offers it. */
export const AppearanceLargestText: Story = {
  globals: { textSize: 'largest' },
};

const page = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('#dvdash-screen-main')!;
const target = (canvasElement: HTMLElement, id: string) =>
  canvasElement.querySelector<HTMLElement>(`[data-search-target="${id}"]`)!;
/** The box lies inside the page's scroller, which is where search scrolls, not the window. */
const inView = (canvasElement: HTMLElement, box: HTMLElement) => {
  const view = page(canvasElement).getBoundingClientRect(),
    rect = box.getBoundingClientRect();
  return rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1;
};
const highlight = (box: HTMLElement) => box.dataset.searchReveal;
/** Whether the browser would draw a focus ring: it treats the element as keyboard focused and gives it an outline. */
const ringShown = (element: Element) =>
  element.matches(':focus-visible') &&
  getComputedStyle(element).outlineStyle !== 'none';
const highlightAnimations = (box: HTMLElement) =>
  document
    .getAnimations()
    .filter(
      (animation) =>
        (animation.effect as KeyframeEffect | null)?.target === box,
    );
async function pick(canvasElement: HTMLElement, query: string, option: RegExp) {
  const canvas = within(canvasElement);
  await userEvent.keyboard('{Control>}k{/Control}');
  await userEvent.type(
    canvas.getByRole('combobox', { name: 'Search all DVDash' }),
    query,
  );
  await userEvent.click(await canvas.findByRole('option', { name: option }));
}

/** From the bottom of Settings, search finds "Decimal separator": the page scrolls up to it, focuses its field and highlights it, then the highlight fades. */
export const SearchScrollsToSetting: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      scroller = page(canvasElement);
    scroller.scrollTop = scroller.scrollHeight;
    const box = target(canvasElement, 'settings.numbers.decimal');
    await waitFor(() => expect(inView(canvasElement, box)).toBe(false));
    await pick(canvasElement, 'decimal', /^Decimal separator/);
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    const pulsing = highlightAnimations(box).length;
    await expect(
      canvas.getByRole('combobox', { name: 'Decimal separator' }),
    ).toHaveFocus();
    await expect(
      ringShown(canvas.getByRole('combobox', { name: 'Decimal separator' })),
      'A field opened from search keeps its focus ring',
    ).toBe(true);
    await waitFor(() => expect(inView(canvasElement, box)).toBe(true));
    await expect(window.scrollY).toBe(0);
    await expect(
      canvasElement.querySelector('.dv-shell-sr[role=status]'),
    ).toHaveTextContent('Decimal separator, Settings, Numbers.');
    await expect(
      pulsing,
      'The highlight animates while it shows',
    ).toBeGreaterThan(0);
    await waitFor(() => expect(highlight(box)).toBeUndefined(), {
      timeout: REVEAL_MS + 1000,
    });
    await expect(
      canvas.getByRole('combobox', { name: 'Decimal separator' }),
    ).toHaveFocus();
  },
};

/** Under reduced motion the page jumps straight to the Export section and the highlight is static, with nothing animating. */
export const SearchScrollsToSectionReducedMotion: Story = {
  parameters: { previewWidth: 390 },
  beforeEach: reduceMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      scroller = page(canvasElement);
    scroller.scrollTop = 0;
    const box = target(canvasElement, 'settings.export');
    await expect(inView(canvasElement, box)).toBe(false);
    await pick(canvasElement, 'export', /^Export Settings$/);
    await waitFor(() => expect(highlight(box)).toBe('static'));
    // Already there in the frame the highlight appears: no smooth scroll.
    await expect(inView(canvasElement, box)).toBe(true);
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Export' }),
    ).toHaveFocus();
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Export' }),
    ).toSatisfy((heading: Element) => heading.matches(':focus-visible'));
    await expect(
      ringShown(canvas.getByRole('heading', { level: 3, name: 'Export' })),
      'A heading opened from search is not a control and shows no focus ring',
    ).toBe(false);
    await expect(highlightAnimations(box)).toEqual([]);
    await waitFor(() => expect(highlight(box)).toBeUndefined(), {
      timeout: REVEAL_MS + 1000,
    });
    // The heading took focus from code only; once focus leaves it, it is not a tab stop.
    await userEvent.tab();
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Export' }),
    ).not.toHaveAttribute('tabindex');
  },
};

/** Choosing a place that is already in view focuses and highlights it without moving the page. */
export const SearchTargetAlreadyVisible: Story = {
  play: async ({ canvasElement }) => {
    const scroller = page(canvasElement);
    scroller.scrollTop = 0;
    const before = scroller.scrollTop,
      box = target(canvasElement, 'settings.appearance.theme');
    await pick(canvasElement, 'theme', /^Theme/);
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    await expect(
      within(canvasElement).getByRole('radio', { name: 'Light' }),
    ).toHaveFocus();
    await expect(scroller.scrollTop).toBe(before);
  },
};

/** Scrolling or typing ends the highlight early, with its fade out. */
export const HighlightEndsWhenTheUserMoves: Story = {
  play: async ({ canvasElement }) => {
    const box = target(canvasElement, 'settings.recordings.folder');
    await pick(canvasElement, 'recordings folder', /^Recordings folder/);
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    page(canvasElement).dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, bubbles: true }),
    );
    await expect(highlight(box)).toBe('leave');
    await waitFor(() => expect(highlight(box)).toBeUndefined(), {
      timeout: 500,
    });
    await pick(canvasElement, 'recordings folder', /^Recordings folder/);
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    await userEvent.keyboard('{Tab}');
    await expect(highlight(box)).toBe('leave');
  },
};

/**
 * Search finds Text size by the words people use for it. Choosing Largest scales the whole page at once, announces the
 * save, and the page still fits its width. The story puts the size back afterwards.
 */
export const TextSizeFromSearch: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      box = target(canvasElement, 'settings.appearance.textSize'),
      root = document.documentElement;
    await pick(canvasElement, 'font size', /^Text size/);
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    await expect(canvas.getByRole('radio', { name: 'Default' })).toHaveFocus();
    const heading = canvas.getByRole('heading', { level: 1 }),
      before = parseFloat(getComputedStyle(heading).fontSize);
    await userEvent.click(canvas.getByRole('radio', { name: 'Largest' }));
    try {
      await expect(root).toHaveAttribute('data-dv-text-size', 'largest');
      await expect(parseFloat(getComputedStyle(heading).fontSize)).toBeCloseTo(
        before * 1.5,
        1,
      );
      await waitFor(() =>
        expect(
          canvasElement.querySelector('.dv-settings-announcer'),
        ).toHaveTextContent('Text size saved.'),
      );
      const scroller = page(canvasElement);
      await expect(
        scroller.scrollWidth,
        'Settings fits its width at Largest',
      ).toBeLessThanOrEqual(scroller.clientWidth);
    } finally {
      await userEvent.click(canvas.getByRole('radio', { name: 'Default' }));
    }
    await expect(root).toHaveAttribute('data-dv-text-size', 'default');
  },
};

/** A deep link to a section on a cold start scrolls to it and highlights it once the page is laid out. */
export const DeepLinkToSection: Story = {
  parameters: { previewWidth: 390 },
  args: { initialTarget: 'settings.export' },
  play: async ({ canvasElement }) => {
    const box = target(canvasElement, 'settings.export');
    await waitFor(() => expect(highlight(box)).toBe('pulse'));
    await expect(
      within(canvasElement).getByRole('heading', { level: 3, name: 'Export' }),
    ).toHaveFocus();
    await waitFor(() => expect(inView(canvasElement, box)).toBe(true));
  },
};
