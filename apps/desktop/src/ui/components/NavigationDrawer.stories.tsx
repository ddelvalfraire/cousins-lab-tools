import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  type CurrentAcquisition,
  NavigationDrawer,
  type RecentExperiment,
} from './SideNavigation';
import { useResettingCopy } from './useResettingCopy';

const recents: RecentExperiment[] = [
  {
    id: '025',
    title: 'Sample 025',
    subtitle: 'Leaf respiration',
    state: 'live',
  },
  {
    id: '08',
    title: 'Extract 08',
    subtitle: 'Enzyme assay',
    state: 'opened',
    tone: 'violet',
  },
];
const acquisition: CurrentAcquisition = {
  experimentId: '025',
  title: 'Sample 025',
  source: 'Simulator',
  samples: 87,
  elapsed: '00:43',
  trace: [
    10, 11, 12.6, 14.7, 16.9, 18.5, 18.9, 18, 16.1, 13.9, 11.9, 10.7, 10.9,
    12.6, 15.5, 18.2, 20, 21, 20.9, 19.7, 17.5, 14.5, 12.2, 11.5, 13.6, 17,
  ],
};

function DrawerExample(args: ComponentProps<typeof NavigationDrawer>) {
  const [active, setActive] = useResettingCopy(args.active);
  return (
    <NavigationDrawer
      {...args}
      active={active}
      onNavigate={(destination) => {
        setActive(destination);
        args.onNavigate?.(destination);
      }}
      onOpenExperiment={(id) => {
        setActive('experiments');
        args.onOpenExperiment?.(id);
      }}
    />
  );
}

const meta = {
  title: 'Components/NavigationDrawer',
  component: NavigationDrawer,
  tags: ['autodocs'],
  parameters: { previewWidth: 390 },
  args: {
    active: 'experiments',
    recents,
    acquisition,
    onNavigate: fn(),
    onOpenExperiment: fn(),
  },
  render: (args) => <DrawerExample {...args} />,
} satisfies Meta<typeof NavigationDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

const openDrawer = async (canvasElement: HTMLElement) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    within(canvasElement).getByRole('button', { name: 'Open navigation' }),
  );
  const drawer = await body.findByRole('dialog', { name: 'Navigation' });
  await waitFor(() => expect(drawer).toBeVisible());
  return drawer;
};
const drawerClosed = (canvasElement: HTMLElement) =>
  waitFor(() =>
    expect(
      within(canvasElement.ownerDocument.body).queryByRole('dialog', {
        name: 'Navigation',
      }),
    ).not.toBeInTheDocument(),
  );

/** Compact window: a menu button opens the sidebar as a focus-trapped drawer. */
export const CompactWindow: Story = {
  play: async ({ canvasElement, args }) => {
    const menu = within(canvasElement).getByRole('button', {
      name: 'Open navigation',
    });
    // Escape closes and returns focus; Tab stays inside while open.
    let drawer = await openDrawer(canvasElement);
    await waitFor(() =>
      expect(
        within(drawer).getByRole('button', { name: 'Experiments' }),
      ).toHaveFocus(),
    );
    for (let i = 0; i < 15; i++) await userEvent.tab();
    await expect(
      drawer.contains(canvasElement.ownerDocument.activeElement),
    ).toBe(true);
    await userEvent.keyboard('{Escape}');
    await drawerClosed(canvasElement);
    await waitFor(() => expect(menu).toHaveFocus());
    // The close button closes it.
    drawer = await openDrawer(canvasElement);
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Close navigation' }),
    );
    await drawerClosed(canvasElement);
    await waitFor(() => expect(menu).toHaveFocus());
    // Choosing a destination closes it.
    drawer = await openDrawer(canvasElement);
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Instruments' }),
    );
    await drawerClosed(canvasElement);
    await expect(args.onNavigate).toHaveBeenLastCalledWith('instruments');
    await waitFor(() => expect(menu).toHaveFocus());
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  },
};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const drawer = await openDrawer(canvasElement);
    await waitFor(() =>
      expect(
        within(drawer).getByRole('button', { name: 'Experiments' }),
      ).toHaveFocus(),
    );
    await expect(
      within(drawer).getByRole('region', { name: 'Recent experiments' }),
    ).toBeVisible();
    await expect(
      within(drawer).queryByRole('button', { name: 'Collapse' }),
    ).not.toBeInTheDocument();
  },
};
