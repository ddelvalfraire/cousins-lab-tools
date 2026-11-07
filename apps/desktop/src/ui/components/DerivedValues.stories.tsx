import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { DerivedValues, type DerivedOutput } from './DerivedValues';

const outputs: DerivedOutput[] = [
  { name: 'CO₂ pressure', unit: 'µbar', equation: '(Mass 44 − zero offset) × conversion factor', where: [['zero offset', '0.303 mV'], ['conversion factor', '83 µbar/mV']], signals: ['Mass 44'] },
  { name: 'Rate of change', unit: 'µbar/s', equation: 'slope of CO₂ pressure over the last 5 s', uses: ['CO₂ pressure'] },
  { name: 'O₂ fraction', unit: 'no unit', equation: 'Mass 32 ÷ (Mass 32 + Mass 28)', signals: ['Mass 32', 'Mass 28'] },
];
const longName = 'Kohlendioxid-Partialdruck nach Temperaturkorrektur';

const meta = {
  title: 'Components/DerivedValues',
  component: DerivedValues,
  tags: ['autodocs'],
  parameters: { previewWidth: 860 },
  args: { outputs },
} satisfies Meta<typeof DerivedValues>;
export default meta;
type Story = StoryObj<typeof meta>;

const rows = (canvasElement: HTMLElement) => within(canvasElement).getAllByRole('listitem');

export const PresetDefinition: Story = {
  play: async ({ canvasElement }) => {
    const [first, second] = rows(canvasElement);
    await expect(rows(canvasElement)).toHaveLength(3);
    await expect(within(canvasElement).getByText('3 outputs')).toBeVisible();
    await expect(within(first).getByRole('heading')).toHaveTextContent('CO₂ pressure');
    await expect(first.querySelector('.dv-derived-unit')).toHaveTextContent('µbar');
    await expect(first.querySelector('.dv-derived-equation')).toHaveTextContent('=equals (Mass 44 − zero offset) × conversion factor');
    await expect(first.querySelector('.dv-derived-where')).toHaveTextContent('where zero offset = 0.303 mV and conversion factor = 83 µbar/mV');
    await expect(second.querySelector('.dv-derived-where')).toBeNull();
    // Plain text only: no tokens, chips, legend or banner.
    await expect(canvasElement.querySelectorAll('code, .dv-chip, .dv-legend, .dv-banner, [role="alert"]')).toHaveLength(0);
  },
};

export const SourceMissingSignal: Story = {
  args: { missingSignals: ['Mass 44'] },
  play: async ({ canvasElement }) => {
    const [first, second, third] = rows(canvasElement);
    await expect(first).toHaveAttribute('data-unavailable', 'true');
    await expect(first.querySelector('.dv-derived-problem')).toHaveTextContent('Can’t be calculated: this source has no Mass 44.');
    await expect(second).toHaveAttribute('data-unavailable', 'true');
    await expect(second.querySelector('.dv-derived-problem')).toHaveTextContent('Can’t be calculated: it needs CO₂ pressure.');
    await expect(third).not.toHaveAttribute('data-unavailable');
    await expect(third.querySelector('.dv-derived-problem')).toBeNull();
  },
};

export const LongNamesAndFormula: Story = {
  args: {
    outputs: [
      { ...outputs[0], name: longName, equation: '(Mass 44 − zero offset) × conversion factor × 273.15 ÷ (temperature + 273.15)', where: [...outputs[0].where!, ['temperature', '25 °C']] },
      { ...outputs[1], equation: `slope of ${longName} over the last 5 s`, uses: [longName] },
      outputs[2],
    ],
  },
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('.dv-derived') as HTMLElement;
    await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
    await expect(rows(canvasElement)[0].querySelector('.dv-derived-where')).toHaveTextContent('and temperature = 25 °C');
  },
};
