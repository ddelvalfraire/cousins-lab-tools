import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  type CurrentAcquisition,
  type RecentExperiment,
  SideNavigation,
  type SideNavigationProps,
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
const germanLabels = {
  experiments: 'Experimente',
  presets: 'Voreinstellungen',
  routines: 'Messroutinen',
  instruments: 'Messinstrumente',
  settings: 'Einstellungen',
  workspace: 'Arbeitsbereich',
  recent: 'Letzte Experimente',
  collapse: 'Einklappen',
  expand: 'Ausklappen',
};

/** Stateful host: routing and the collapsed state belong to the app. */
function SidebarExample(args: SideNavigationProps) {
  const [active, setActive] = useResettingCopy(args.active),
    [collapsed, setCollapsed] = useResettingCopy(args.collapsed),
    [detail, setDetail] = useResettingCopy(args.detail);
  return (
    <div style={{ height: 684, width: 'fit-content' }}>
      <SideNavigation
        {...args}
        active={active}
        collapsed={collapsed}
        detail={detail}
        onNavigate={(destination) => {
          setActive(destination);
          setDetail(false);
          args.onNavigate?.(destination);
        }}
        onOpenExperiment={(id) => {
          setActive('experiments');
          setDetail(true);
          args.onOpenExperiment?.(id);
        }}
        onCollapsedChange={(value) => {
          setCollapsed(value);
          args.onCollapsedChange?.(value);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Components/SideNavigation',
  component: SideNavigation,
  tags: ['autodocs'],
  parameters: { layout: 'centered', previewWidth: 320 },
  args: {
    active: 'experiments',
    collapsed: false,
    detail: false,
    recents,
    acquisition,
    onNavigate: fn(),
    onOpenExperiment: fn(),
    onCollapsedChange: fn(),
  },
  argTypes: {
    active: {
      control: 'select',
      options: [
        'experiments',
        'presets',
        'routines',
        'instruments',
        'settings',
      ],
    },
  },
  render: (args) => <SidebarExample {...args} />,
} satisfies Meta<typeof SideNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

const sidebar = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('.dv-side-navigation')!;
const current = (canvasElement: HTMLElement) =>
  sidebar(canvasElement).querySelectorAll('[aria-current="page"]');

export const Expanded: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(current(canvasElement)).toHaveLength(1);
    await expect(current(canvasElement)[0]).toHaveTextContent('Experiments');
    await expect(sidebar(canvasElement).getBoundingClientRect().width).toBe(
      184,
    );
    const presets = canvas.getByRole('button', { name: 'Presets' });
    await userEvent.click(presets);
    await expect(presets).toHaveAttribute('aria-current', 'page');
    await expect(current(canvasElement)).toHaveLength(1);
    await expect(presets).toHaveFocus();
    await expect(args.onNavigate).toHaveBeenLastCalledWith('presets');
    await userEvent.click(canvas.getByRole('button', { name: 'Experiments' }));
    await expect(
      canvas.getByRole('button', { name: 'Experiments' }),
    ).toHaveAttribute('aria-current', 'page');
  },
};

export const Collapsed: Story = {
  args: { collapsed: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await expect(sidebar(canvasElement).getBoundingClientRect().width).toBe(58);
    // Names stay as accessible names and appear as a tooltip on keyboard focus.
    const routines = canvas.getByRole('button', { name: 'Routines' });
    await expect(routines).toBeVisible();
    routines.focus();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    await expect(routines).toHaveFocus();
    await expect(getComputedStyle(routines, '::after').content).toBe(
      '"Routines"',
    );
    // Recents become a flyout: Escape closes it and returns focus to the trigger.
    const trigger = canvas.getByRole('button', { name: 'Recent experiments' });
    await userEvent.click(trigger);
    const flyout = await body.findByRole('dialog', {
      name: 'Recent experiments',
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(within(flyout).getAllByRole('button')[0]).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Recent experiments' }),
      ).not.toBeInTheDocument(),
    );
    await expect(trigger).toHaveFocus();
    // Choosing an item closes the flyout and opens the experiment.
    await userEvent.click(trigger);
    await userEvent.click(
      within(
        await body.findByRole('dialog', { name: 'Recent experiments' }),
      ).getByRole('button', { name: /Sample 025/ }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Recent experiments' }),
      ).not.toBeInTheDocument(),
    );
    await expect(args.onOpenExperiment).toHaveBeenLastCalledWith('025');
    await expect(
      canvas.getByRole('button', { name: 'Experiments' }),
    ).toHaveFocus();
    // The acquisition card is a rail icon.
    await expect(
      canvas.getByRole('button', {
        name: 'Open current acquisition, Sample 025',
      }),
    ).toBeVisible();
    await expect(
      sidebar(canvasElement).querySelector('.dv-navigation-acquisition'),
    ).not.toBeVisible();
    // Expand and collapse keep focus on the toggle.
    const expand = canvas.getByRole('button', { name: 'Expand' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(expand);
    await expect(sidebar(canvasElement)).toHaveAttribute(
      'data-collapsed',
      'false',
    );
    await expect(
      canvas.getByRole('button', { name: 'Collapse' }),
    ).toHaveFocus();
    await expect(
      canvas.getByRole('button', { name: 'Collapse' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse' }));
    await expect(sidebar(canvasElement)).toHaveAttribute(
      'data-collapsed',
      'true',
    );
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith(true);
  },
};

export const InsideAnExperiment: Story = {
  args: { detail: true },
  play: async ({ canvasElement }) => {
    await expect(current(canvasElement)).toHaveLength(1);
    await expect(current(canvasElement)[0]).toHaveTextContent('Experiments');
  },
};

export const SettingsSelected: Story = {
  args: { active: 'settings' },
  play: async ({ canvasElement }) => {
    await expect(current(canvasElement)).toHaveLength(1);
    await expect(current(canvasElement)[0]).toHaveTextContent('Settings');
  },
};

export const LongTranslatedLabels: Story = {
  args: { labels: germanLabels },
  play: async ({ canvasElement }) => {
    const side = sidebar(canvasElement),
      right = side.getBoundingClientRect().right;
    const labels = [...side.querySelectorAll('.dv-navigation-label')];
    await expect(labels.length).toBeGreaterThan(0);
    await expect(
      labels.every(
        (label) => label.getBoundingClientRect().right <= right + 0.5,
      ),
    ).toBe(true);
    await expect(side.scrollWidth).toBeLessThanOrEqual(side.clientWidth);
  },
};

export const NothingRunningOrRecent: Story = {
  args: { recents: [], acquisition: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('region', { name: 'Recent experiments' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('region', { name: 'Current acquisition' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Settings' }),
    ).toBeVisible();
  },
};
