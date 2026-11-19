import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  CalibrationCurve,
  type CalibrationStandard,
  fitCalibration,
} from './CalibrationCurve';

/** Illustrative standards from the approved calibration-curve review. */
const five: CalibrationStandard[] = [
  { id: 'Zero', concentration: 0, signal: 0.31 },
  { id: 'Std 1', concentration: 200, signal: 82.6 },
  { id: 'Std 2', concentration: 400, signal: 165.9 },
  { id: 'Std 3', concentration: 800, signal: 329.4 },
  { id: 'Std 4', concentration: 1600, signal: 661.8 },
];
const withChange = (index: number, change: Partial<CalibrationStandard>) =>
  five.map((p, i) => (i === index ? { ...p, ...change } : p));

const meta = {
  title: 'Components/CalibrationCurve',
  component: CalibrationCurve,
  tags: ['autodocs'],
  parameters: { previewWidth: 760 },
  args: {
    standards: five,
    axisMax: { concentration: 1800, signal: 750 },
    initialView: 'chart',
    title: 'CO₂ calibration · Mass 44',
    caption: 'Calibration standards for CO₂ · Mass 44',
  },
  argTypes: {
    standards: { control: 'object' },
    initialView: { control: 'inline-radio', options: ['chart', 'table'] },
  },
} satisfies Meta<typeof CalibrationCurve>;
export default meta;
type Story = StoryObj<typeof meta>;

const rows = (canvasElement: HTMLElement) =>
  within(
    within(canvasElement).getByRole('region', {
      name: 'Calibration standards for CO₂ · Mass 44',
    }),
  )
    .getAllByRole('row')
    .slice(1);

/** Five standards, all used. The view switch is reachable from the keyboard. */
export const FiveStandards: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/5 of 5 standards used/)).toBeVisible();
    await expect(
      canvas.getByRole('img', {
        name: /CO₂ calibration · Mass 44.*Linear fit/,
      }),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Chart' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    canvas.getByRole('button', { name: 'Chart' }).focus();
    await userEvent.keyboard('{Tab}{Enter}');
    await expect(canvas.getByRole('button', { name: 'Table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      canvas.getByRole('region', {
        name: 'Calibration standards for CO₂ · Mass 44',
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('img', { name: /Linear fit/, hidden: true }),
    ).not.toBeVisible();
    const body = rows(canvasElement);
    await expect(body).toHaveLength(5);
    await expect(body[3]).toHaveTextContent('329.40');
    await expect(canvas.queryByRole('alert')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Chart' }));
  },
};

/** Std 2 reads high and is excluded: it stays in the chart and table but leaves the fit. */
export const OneExcluded: Story = {
  args: { standards: withChange(2, { signal: 181.2, excluded: true }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const fit = fitCalibration(args.standards!);
    await expect(fit.n).toBe(4);
    await expect(fit.r2).toBeGreaterThan(0.999);
    await expect(canvas.getByText(/4 of 5 standards used/)).toBeVisible();
    await expect(
      canvas.getByText('Excluded', { selector: '.dv-curve-legend span' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Table' }));
    const row = rows(canvasElement)[2];
    await expect(row).toHaveTextContent('Excluded');
    await expect(row).toHaveTextContent('181.20');
    await userEvent.click(canvas.getByRole('button', { name: 'Chart' }));
  },
};

/** Std 3 has no reading: one warning reads as a sentence and the table shows a dash. */
export const MissingReading: Story = {
  args: { standards: withChange(3, { signal: null }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvasElement.querySelector('.dv-curve-messages')!;
    await expect(banner).toHaveTextContent(
      /^Std 3 has no reading\. Record it in the calibration checklist to include it\.$/,
    );
    await expect(banner.querySelectorAll('li')).toHaveLength(0);
    await expect(
      canvas.getByText('No reading', { selector: '.dv-curve-legend span' }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Table' }));
    const row = rows(canvasElement)[3];
    await expect(row).toHaveTextContent('No reading');
    await expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^—$/);
    await userEvent.click(canvas.getByRole('button', { name: 'Chart' }));
  },
};

/** Only one usable reading: no fit line, and the warnings are listed. */
export const TooFewStandards: Story = {
  args: {
    standards: [
      five[0],
      { ...five[1], signal: null },
      { ...five[2], signal: null },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelectorAll('.dv-curve-messages li'),
    ).toHaveLength(3);
    await expect(
      canvas.getByText(/^No fit · 1 of 3 standards have a usable reading$/),
    ).toBeVisible();
    await expect(canvas.queryByText('Fit line')).toBeNull();
  },
};

/** Table view, as opened from a saved layout. */
export const Table: Story = { args: { initialView: 'table' } };
