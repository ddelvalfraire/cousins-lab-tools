import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PageHeader } from '../components/PageHeader';
import { ScreenShell, type ScreenRoute, type ScreenShellProps } from './ScreenShell';
import type { CurrentAcquisition, RecentExperiment } from '../components/SideNavigation';
import { acquisitionTrace } from './approved-fixtures';

/** The main-sidebar review's sample recents and acquisition. */
const recents:RecentExperiment[]=[{id:'025',title:'Sample 025',subtitle:'Leaf respiration',state:'live'},{id:'08',title:'Extract 08',subtitle:'Enzyme assay',state:'opened',tone:'violet'}];
const acquisition:CurrentAcquisition={experimentId:'025',title:'Sample 025',source:'Simulator',samples:87,elapsed:'00:43',trace:acquisitionTrace};

const titles:Partial<Record<ScreenRoute,string>>={experiments:'Experiments',presets:'Presets',routines:'Routines',instruments:'Instruments',settings:'Settings'};

/** The frame around a placeholder page, as in main-sidebar-review.html. Routing is simulated. */
function FrameExample(args:ScreenShellProps){
  const [page,setPage]=useState<ScreenRoute>(args.page);
  const title=titles[page]??'Leaf respiration · Sample 025';
  return <ScreenShell {...args} page={page} navigate={(next,id)=>{setPage(next);args.navigate(next,id);}}>
    <PageHeader title={title} breadcrumbs={[{label:'Workspace',onClick:()=>setPage('experiments')},...(page==='experiment'?[{label:'Experiments',onClick:()=>setPage('experiments')}]:[]),{label:page==='experiment'?'Sample 025':title}]}/>
    <div className="dv-frame-placeholder">Page content</div>
  </ScreenShell>;
}

const meta={
  title:'Screens/Frame', component:ScreenShell,
  parameters:{layout:'fullscreen',previewWidth:'viewport'},
  args:{page:'experiments',navigate:fn(),recents,acquisition,onAppearanceChange:fn(),onShortcuts:fn(),children:null},
  render:args=><FrameExample {...args}/>,
} satisfies Meta<typeof ScreenShell>;
export default meta;
type Story=StoryObj<typeof meta>;

const box=(canvasElement:HTMLElement,selector:string)=>canvasElement.querySelector(selector)!.getBoundingClientRect();

export const Expanded:Story={
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(box(canvasElement,'.dv-shell-topbar').height).toBe(58);
    await expect(box(canvasElement,'.dv-side-navigation').width).toBe(184);
    const card=canvasElement.querySelector<HTMLElement>('.dv-shell-page')!, style=getComputedStyle(card);
    await expect(style.borderTopWidth).toBe('1px');
    await expect(style.borderTopLeftRadius).toBe('10px');
    // 8 px of frame to the right of and below the card.
    const shell=box(canvasElement,'.dv-shell'), page=card.getBoundingClientRect();
    await expect(Math.round(shell.right-page.right)).toBe(8);
    await expect(Math.round(shell.bottom-page.bottom)).toBe(8);
    // The logo is in the window bar, not the sidebar.
    await expect(canvasElement.querySelector('.dv-side-navigation .dv-brand-concept')).toBeNull();
    await expect(canvas.getByRole('button',{name:'DVDash experiments home'})).toBeVisible();
    await expect(canvas.getByRole('combobox',{name:'Search scope'})).toHaveDisplayValue('Experiments');
  },
};

/** Sidebar destinations route the page; the window bar switches appearance. */
export const Navigation:Story={
  play:async({canvasElement,args})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button',{name:'Use dark appearance'}));
    await expect(args.onAppearanceChange).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button',{name:'Presets'}));
    await expect(canvas.getByRole('heading',{level:1,name:'Presets'})).toBeVisible();
    await expect(args.navigate).toHaveBeenLastCalledWith('presets',undefined);
    await expect(canvas.getByRole('combobox',{name:'Search scope'})).toHaveDisplayValue('Presets');
    await userEvent.click(canvas.getAllByRole('button',{name:/Sample 025/})[0]);
    await expect(canvas.getByRole('heading',{level:1,name:'Leaf respiration · Sample 025'})).toBeVisible();
    await expect(canvas.getByRole('combobox',{name:'Search scope'})).toHaveDisplayValue('This experiment');
  },
};

export const Collapsed:Story={
  args:{defaultCollapsed:true},
  play:async({canvasElement})=>{
    await expect(box(canvasElement,'.dv-side-navigation').width).toBe(58);
    await expect(Math.round(box(canvasElement,'.dv-shell-page').left)).toBe(58);
    await expect(canvasElement.querySelector('.dv-shell-wordmark')).toHaveTextContent('DVDash');
  },
};

/** Collapse and expand move the card with the rail. */
export const CollapseAndExpand:Story={
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button',{name:'Collapse'}));
    await waitFor(()=>expect(box(canvasElement,'.dv-side-navigation').width).toBe(58));
    await waitFor(()=>expect(Math.round(box(canvasElement,'.dv-shell-page').left)).toBe(58));
    await userEvent.click(canvas.getByRole('button',{name:'Expand'}));
    await waitFor(()=>expect(box(canvasElement,'.dv-side-navigation').width).toBe(184));
    await waitFor(()=>expect(Math.round(box(canvasElement,'.dv-shell-page').left)).toBe(184));
  },
};

export const InsideAnExperiment:Story={args:{page:'experiment'}};

/** Compact window: the sidebar becomes a drawer opened from the window bar's menu button. */
export const CompactWindow:Story={
  parameters:{previewWidth:390},
  play:async({canvasElement,args})=>{
    const canvas=within(canvasElement), body=within(canvasElement.ownerDocument.body);
    await expect(canvasElement.querySelector('.dv-shell-sidebar')).not.toBeVisible();
    const menu=canvas.getByRole('button',{name:'Open navigation'});
    await expect(menu).toBeVisible();
    await userEvent.click(menu);
    const drawer=await body.findByRole('dialog',{name:'Navigation'});
    await waitFor(()=>expect(drawer).toBeVisible());
    await userEvent.click(within(drawer).getByRole('button',{name:'Presets'}));
    await waitFor(()=>expect(body.queryByRole('dialog',{name:'Navigation'})).not.toBeInTheDocument());
    await expect(args.navigate).toHaveBeenLastCalledWith('presets',undefined);
    await waitFor(()=>expect(menu).toHaveFocus());
    // Reopen and return to Experiments, leaving the example on its first page.
    await userEvent.click(menu);
    await userEvent.click(within(await body.findByRole('dialog',{name:'Navigation'})).getByRole('button',{name:'Experiments'}));
    await waitFor(()=>expect(body.queryByRole('dialog',{name:'Navigation'})).not.toBeInTheDocument());
    await waitFor(()=>expect(menu).toHaveFocus());
  },
};
