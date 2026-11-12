import { useEffect, useId, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Chip } from './Chip';
import { DvSelect, type DvSelectOption } from './DvSelect';
import { PageHeader } from './PageHeader';
import { RightSidebar, SidebarFacts, SidebarIcon, SidebarSection, WorkspaceBody, type RightSidebarProps, type RightSidebarTab } from './RightSidebar';

const tabs: RightSidebarTab[] = [
  { id: 'details', label: 'Details', icon: <SidebarIcon name="details" /> },
  { id: 'signals', label: 'Signals', icon: <SidebarIcon name="signals" /> },
  { id: 'display', label: 'Display', icon: <SidebarIcon name="display" /> },
];

function SampleSelect({ label, initial, options }: { label: string; initial: string; options: DvSelectOption[] }) {
  const [value, setValue] = useState(initial), id = useId();
  return <div className="dv-sidebar-field"><label htmlFor={id}>{label}</label><DvSelect id={id} value={value} options={options} onChange={setValue} /></div>;
}

/** Sample settings for each tab, as in right-sidebar-review.html. */
function Pane({ tab }: { tab?: string }) {
  if (tab === 'signals') return <>
    <SidebarSection title="Visible signals">
      <SidebarFacts items={[['Mass 44', 'MS-01 · mV'], ['Mass 45', 'MS-01 · mV'], ['Temperature', 'T-01 · °C']]} />
    </SidebarSection>
    <SidebarSection title="Derived outputs">
      <div className="dv-sidebar-item"><span className="dv-sidebar-item-mark"><SidebarIcon name="signals" /></span><div><strong>Dissolved CO₂</strong><small>Mass 44 → nmol/mL</small></div></div>
    </SidebarSection>
  </>;
  if (tab === 'display') return <>
    <SidebarSection title="Mass 44">
      <SampleSelect label="Scale" initial="auto" options={[{ value: 'auto', label: 'Automatic' }, { value: 'fixed', label: 'Fixed range' }]} />
      <SampleSelect label="Decimal places" initial="3" options={['1', '2', '3', '4'].map(n => ({ value: n, label: n }))} />
    </SidebarSection>
    <SidebarSection title="Axis units"><SidebarFacts items={[['Horizontal', 'Time · s'], ['Vertical', 'Signal · mV']]} /></SidebarSection>
  </>;
  return <>
    <SidebarSection>
      <label className="dv-sidebar-field">Sample name<input defaultValue="Sample 025" /></label>
      <span className="dv-sidebar-save"><SidebarIcon name="check" />Saved</span>
    </SidebarSection>
    <SidebarSection title="Pinned preset">
      <div className="dv-sidebar-item"><span className="dv-sidebar-item-mark"><SidebarIcon name="panels" /></span><div><strong>CO₂ & O₂ analysis</strong><small>Experiment layout</small></div></div>
      <Chip icon={<SidebarIcon name="revisions" />}>R3</Chip>
    </SidebarSection>
    <SidebarSection title="Recording">
      <SidebarFacts items={[['Mode', 'Selected streams'], ['Inputs', '2 of 3 streams'], ['Derived output', 'Dissolved CO₂']]} />
    </SidebarSection>
  </>;
}

/** The sidebar in its page: a window-high page, the sidebar docked to its right edge beneath the shared header. */
function InPage(args: RightSidebarProps) {
  const [tab, setTab] = useState(args.activeTab), [collapsed, setCollapsed] = useState(args.collapsed);
  useEffect(() => setTab(args.activeTab), [args.activeTab]);
  useEffect(() => setCollapsed(args.collapsed), [args.collapsed]);
  return <div className="dv-right-sidebar-example-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--dv-bg)' }}>
    <PageHeader title="Leaf respiration" breadcrumbs={[{ label: 'Workspace', onClick: () => {} }, { label: 'Experiments', onClick: () => {} }, { label: 'Leaf respiration' }]} />
    <WorkspaceBody sidebar={<RightSidebar {...args} activeTab={tab} collapsed={collapsed}
      onTabChange={id => { setTab(id); args.onTabChange?.(id); }}
      onCollapsedChange={value => { setCollapsed(value); args.onCollapsedChange?.(value); }}><Pane tab={tab} /></RightSidebar>}>
      <div className="dv-right-sidebar-example-main" style={{ height: 460, border: '1px dashed var(--dv-line)', borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--dv-ink-muted)', fontSize: 12 }}>Page content</div>
    </WorkspaceBody>
  </div>;
}

const meta = {
  title: 'Components/RightSidebar', component: RightSidebar, tags: ['autodocs'],
  parameters: { layout: 'fullscreen', previewWidth: 1440 },
  args: { tabs, activeTab: 'details', collapsed: false, subtitle: 'Leaf respiration', label: 'Page tools', tabsLabel: 'Experiment tools', onTabChange: fn(), onCollapsedChange: fn() },
  render: args => <InPage {...args} />,
} satisfies Meta<typeof RightSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;

const sidebar = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('.dv-right-sidebar')!;

export const Details: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Docked: 332 px wide, touching the page's right edge and bottom, from the header down; a rule on its left only.
    const box = sidebar(canvasElement).getBoundingClientRect(), page = canvasElement.querySelector('.dv-right-sidebar-example-page')!.getBoundingClientRect();
    await expect(box.width).toBe(332);
    await expect(box.right).toBe(page.right);
    await expect(box.bottom).toBe(page.bottom);
    await expect(box.top).toBe(canvasElement.querySelector('.dv-page-header')!.getBoundingClientRect().bottom);
    const style = getComputedStyle(sidebar(canvasElement));
    await expect([style.borderLeftWidth, style.borderRightWidth, style.borderTopWidth, style.borderBottomWidth, style.borderRadius]).toEqual(['1px', '0px', '0px', '0px', '0px']);
    await expect(canvas.getByRole('heading', { level: 2, name: 'Details' })).toBeVisible();
    // Only the selected tab is in the tab order; arrows move between tabs.
    const details = canvas.getByRole('tab', { name: 'Details' });
    await expect(details).toHaveAttribute('tabindex', '0');
    await expect(canvas.getByRole('tab', { name: 'Signals' })).toHaveAttribute('tabindex', '-1');
    details.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('tab', { name: 'Signals' })).toHaveFocus();
    await expect(canvas.getByRole('tab', { name: 'Signals' })).toHaveAttribute('aria-selected', 'true');
    await expect(args.onTabChange).toHaveBeenLastCalledWith('signals');
    await userEvent.keyboard('{End}');
    await expect(canvas.getByRole('tab', { name: 'Display' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(canvas.getByRole('tab', { name: 'Display' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect(canvas.getByRole('tab', { name: 'Details' })).toHaveFocus();
  },
};

export const Signals: Story = { args: { activeTab: 'signals' } };

export const Display: Story = { args: { activeTab: 'display' } };

/** Collapsed: only the 52 px rail stays. Choosing a tab opens the pane again. */
export const Collapsed: Story = {
  args: { collapsed: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(sidebar(canvasElement).getBoundingClientRect().width).toBe(52);
    await expect(canvas.queryByRole('tabpanel')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('tab', { name: 'Signals' }));
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(sidebar(canvasElement).getBoundingClientRect().width).toBe(332));
    await expect(canvas.getByRole('tabpanel')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse right sidebar' }));
    await expect(args.onCollapsedChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Signals' })).toHaveFocus());
  },
};

/** A tab can carry a count, e.g. open issues. */
export const WithBadge: Story = {
  args: { tabs: tabs.map(tab => tab.id === 'signals' ? { ...tab, badge: 2 } : tab) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('tab', { name: /^Signals\s*,\s*2$/ })).toBeVisible();
  },
};

/** Narrow page: the rail stays docked at the right edge; a tab opens the pane as a sheet over the content. Escape closes it. */
export const Narrow: Story = {
  parameters: { previewWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement), side = sidebar(canvasElement);
    const page = canvasElement.querySelector('.dv-right-sidebar-example-page')!.getBoundingClientRect();
    await expect(side).toHaveAttribute('data-mode', 'sheet');
    await expect(side).toHaveAttribute('data-collapsed', 'true');
    await expect(side.getBoundingClientRect().width).toBe(52);
    await expect(side.getBoundingClientRect().right).toBe(page.right);
    await expect(canvas.queryByRole('tabpanel')).not.toBeInTheDocument();
    const signals = canvas.getByRole('tab', { name: 'Signals' });
    await userEvent.click(signals);
    await expect(signals).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(canvas.getByRole('tabpanel')).toBeVisible());
    // The sheet covers the content; the main column keeps its width.
    await expect(canvasElement.querySelector('.dv-workspace-main')!.getBoundingClientRect().right).toBe(side.getBoundingClientRect().left);
    await userEvent.keyboard('{Escape}');
    await expect(signals).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(signals).toHaveFocus());
    await waitFor(() => expect(canvas.queryByRole('tabpanel')).not.toBeInTheDocument());
  },
};
