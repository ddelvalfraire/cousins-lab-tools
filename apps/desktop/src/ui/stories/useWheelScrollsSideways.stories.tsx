import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useWheelScrollsSideways } from '../components/useWheelScrollsSideways';

const labels = ['All', 'Actions', 'Settings', 'Experiments', 'Presets'];

/** A row of tabs wider than its box, as the command center's result types are in a narrow window. */
function SidewaysRow() {
  const ref = useWheelScrollsSideways();
  return (
    <div
      ref={ref}
      data-testid="row"
      style={{ width: 160, overflowX: 'auto', whiteSpace: 'nowrap' }}
    >
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          style={{ width: 120, display: 'inline-block' }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const meta = {
  title: 'Foundations/Wheel scrolls sideways',
  component: SidewaysRow,
  parameters: { previewWidth: 320 },
} satisfies Meta<typeof SidewaysRow>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A vertical wheel turn moves the row sideways and keeps the page from scrolling. */
export const VerticalWheelScrollsTheRow: Story = {
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByTestId('row');
    const turn = new WheelEvent('wheel', {
      deltaY: 40,
      bubbles: true,
      cancelable: true,
    });
    row.dispatchEvent(turn);
    await expect(row.scrollLeft).toBe(40);
    await expect(turn.defaultPrevented).toBe(true);
  },
};
