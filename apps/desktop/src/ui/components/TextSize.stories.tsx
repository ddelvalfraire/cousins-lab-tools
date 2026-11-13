import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Group, Paper, Select, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { AppearanceProvider, useAppearance } from '../appearance';
import { dvdashTheme } from '../theme';
import { TEXT_SIZE_ATTRIBUTE, TEXT_SIZE_KEY, textScales, type TextSize } from '../textSize';

const steps = (Object.keys(textScales) as TextSize[]).map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

/** Each step sets the root font size; DVDash's own text and Mantine's, portalled lists and tooltips included, follow it. */
function TextSizeDemo() {
  const appearance = useAppearance();
  return <Stack gap="md">
    <Group gap="xs" role="group" aria-label="Text size">
      {steps.map(option => <Button key={option.value} variant={appearance.textSize === option.value ? 'filled' : 'default'} aria-pressed={appearance.textSize === option.value}
        onClick={() => appearance.setTextSize(option.value)}>{option.label}</Button>)}
    </Group>
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Text fw={600} data-testid="title">Sample 024</Text>
        <Text size="sm" c="dimmed" data-testid="meta">Recorded 14:05:12 · Mass 44, 45 and 46</Text>
        <TextInput label="Name" defaultValue="Sample 024" />
        <Select label="Shows" data={['Mass 44', 'Mass 45', 'Mass 46']} defaultValue="Mass 44" />
        <Group gap="xs"><Tooltip label="Opens the recorded experiment" opened withinPortal><Button size="xs">Open</Button></Tooltip><Button size="xs" variant="default">Rename</Button></Group>
      </Stack>
    </Paper>
  </Stack>;
}

const meta = { title: 'Foundations/Text size', component: TextSizeDemo, parameters: { previewWidth: 480 } } satisfies Meta<typeof TextSizeDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

const html = () => document.documentElement;
const px = (element: Element) => parseFloat(getComputedStyle(element).fontSize);

/** Largest makes the root 150 %, and text inside and outside the story root (a Select list, a tooltip) grows by the same factor. */
export const ScalesEverything: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
    const tooltip = await body.findByRole('tooltip');
    await userEvent.click(canvas.getByRole('combobox', { name: 'Shows' }));
    const option = await body.findByRole('option', { name: 'Mass 45' });
    const before = { title: px(canvas.getByTestId('title')), meta: px(canvas.getByTestId('meta')), option: px(option), tooltip: px(tooltip), input: canvas.getByRole('textbox', { name: 'Name' }).getBoundingClientRect().height };
    await userEvent.keyboard('{Escape}');
    await expect(px(html())).toBe(16);

    await userEvent.click(canvas.getByRole('button', { name: 'Largest' }));
    await expect(html()).toHaveAttribute(TEXT_SIZE_ATTRIBUTE, 'largest');
    await expect(px(html())).toBe(16 * textScales.largest);
    await expect(px(canvas.getByTestId('title'))).toBeCloseTo(before.title * textScales.largest, 1);
    await expect(px(canvas.getByTestId('meta'))).toBeCloseTo(before.meta * textScales.largest, 1);
    await expect(px(await body.findByRole('tooltip')), 'the portalled tooltip follows the root').toBeCloseTo(before.tooltip * textScales.largest, 1);
    await expect(canvas.getByRole('textbox', { name: 'Name' }).getBoundingClientRect().height, 'a text field grows with its text').toBeCloseTo(before.input * textScales.largest, 0);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Shows' }));
    await expect(px(await body.findByRole('option', { name: 'Mass 45' })), 'the portalled list follows the root').toBeCloseTo(before.option * textScales.largest, 1);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(canvas.getByRole('button', { name: 'Default' }));
    await expect(html()).toHaveAttribute(TEXT_SIZE_ATTRIBUTE, 'default');
    await expect(px(html())).toBe(16);
  },
};

/**
 * Renders an uncontrolled provider in its own root, then reads the root font size in a layout effect that runs after the
 * provider's in the same commit: what the browser would paint first.
 */
function firstFrameSize() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const sizes = new Promise<{ attribute: string | null; size: number }>(resolve => {
    function AfterProvider() {
      useLayoutEffect(() => resolve({ attribute: html().getAttribute(TEXT_SIZE_ATTRIBUTE), size: px(html()) }), []);
      return null;
    }
    root.render(<><AppearanceProvider theme={dvdashTheme} /><AfterProvider /></>);
  });
  return { sizes, unmount: () => { root.unmount(); container.remove(); } };
}

/**
 * A saved size is on the root before the app's first frame, so text never paints at Default and then jumps. A change
 * saved by another window reaches this one too.
 */
export const SavedSizeAppliesBeforeFirstPaint: Story = {
  play: async () => {
    const saved = localStorage.getItem(TEXT_SIZE_KEY), shown = html().getAttribute(TEXT_SIZE_ATTRIBUTE) as TextSize;
    localStorage.setItem(TEXT_SIZE_KEY, 'larger');
    const app = firstFrameSize();
    try {
      await expect(await app.sizes).toEqual({ attribute: 'larger', size: 16 * textScales.larger });
      localStorage.setItem(TEXT_SIZE_KEY, 'large');
      // The provider listens from its first passive effect, which may run after the first frame.
      await waitFor(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: TEXT_SIZE_KEY, newValue: 'large' }));
        expect(html()).toHaveAttribute(TEXT_SIZE_ATTRIBUTE, 'large');
      });
    } finally {
      app.unmount();
      if (saved === null) localStorage.removeItem(TEXT_SIZE_KEY); else localStorage.setItem(TEXT_SIZE_KEY, saved);
      html().setAttribute(TEXT_SIZE_ATTRIBUTE, shown);
    }
  },
};
