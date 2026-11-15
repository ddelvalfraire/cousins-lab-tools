import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
import { chooseOption } from '../components/chooseOption';
import { reduceMotion, settleMotion } from '../components/settleMotion';

/** The live experiment page (Sample 025 is acquiring). Frozen states for review against the approved mockups. */
const meta={title:'Screens/Experiment',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'experiment',initialExperiment:'sample-025'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;

const dark={globals:{appearance:'dark'}} as const;
const narrow={parameters:{previewWidth:390}} as const;
/** The stop dialog (GuardDialog, shared with the unsaved-changes dialog) renders Mantine's modal <header>, which axe counts as a second banner beside the window bar. Reported; scoped to the dialog stories. */
const dialogA11y={a11y:{config:{rules:[{id:'landmark-no-duplicate-banner',enabled:false},{id:'landmark-unique',enabled:false}]}}} as const;
const box=(root:HTMLElement,selector:string)=>root.querySelector(selector)!.getBoundingClientRect();
/** The header and body sit in what the sidebar leaves, with equal margins: the title's left margin inside the card equals the gap before the sidebar. */
const expectCentredBesideSidebar=async(root:HTMLElement)=>{
  const card=box(root,'.dv-shell-page'),side=box(root,'.dv-right-sidebar'),title=box(root,'.dv-page-title'),actions=box(root,'.dv-page-actions'),body=box(root,'.dv-xw-page .dv-workspace-main > *');
  await expect(Math.round(title.left-card.left-1)).toBe(Math.round(side.left-actions.right));
  await expect(Math.round(body.left)).toBe(Math.round(title.left));
  await expect(Math.round(body.right)).toBe(Math.round(actions.right));
};

/** A recorded experiment opened from the list (frame-width check in the e2e suite). */
export const Recorded:Story={parameters:{previewWidth:'viewport'},args:{initialExperiment:'sample-024'}};

/** Acquiring: status and Stop in the header action bar; live streams beside the Details sidebar. */
export const Live:Story={
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(box(canvasElement,'.dv-page-header-title').height).toBe(88);
    await expect(box(canvasElement,'.dv-page-actionbar').height).toBe(48);
    const side=box(canvasElement,'.dv-right-sidebar'),card=box(canvasElement,'.dv-shell-page');
    // Docked to the card's right edge at its full height, beside the header (inside its 1 px border): 332 px wide, 292 px when the card is 1050 px or narrower.
    await expect(side.width).toBe(card.width>1052?332:292);
    await expect(side.top-card.top).toBe(1);
    await expect(card.right-side.right).toBe(1);
    await expect(card.bottom-side.bottom).toBe(1);
    await expectCentredBesideSidebar(canvasElement);
    await expect(canvas.getByRole('heading',{level:2,name:'Details'})).toBeVisible();
    await expect(canvasElement.querySelector('.dv-page-meta')).toHaveTextContent(/Acquiring.*87 samples.*00:43.*No problems/);
    await expect(canvas.getByRole('button',{name:'Stop acquisition'})).toBeVisible();
    await expect(canvasElement.querySelectorAll('.dv-xw-stream')).toHaveLength(3);
  },
};
export const LiveDark:Story={...dark};
/** The live experiment at the Largest text size. */
export const LiveLargestText:Story={globals:{textSize:'largest'}};
/** Narrow: the tab rail stays docked at the card's right edge and the pane opens as a sheet over the streams. */
export const LiveNarrow:Story={...narrow,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement),aside=canvasElement.querySelector('.dv-right-sidebar')!;
    await expect(aside).toHaveAttribute('data-mode','sheet');
    await expect(box(canvasElement,'.dv-shell-page').right-aside.getBoundingClientRect().right).toBe(1);
    await expect(canvas.queryByRole('tabpanel')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('tab',{name:'Details'}));
    await waitFor(()=>expect(canvas.getByRole('heading',{level:2,name:'Details'})).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(()=>expect(canvas.getByRole('tab',{name:'Details'})).toHaveFocus());
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};
export const LiveNarrowDark:Story={...narrow,...dark};

/** Stop asks first; recording continues while the dialog is open. */
export const StopConfirmation:Story={args:{experimentView:{stopDialogOpen:true}},parameters:dialogA11y,
  play:async({canvasElement})=>{
    const dialog=within(canvasElement.ownerDocument.body).getByRole('dialog');
    await expect(within(dialog).getByRole('heading',{name:'Stop acquisition for Sample 025?'})).toBeVisible();
    await expect(within(dialog).getByRole('button',{name:'Keep acquiring'})).toBeVisible();
  },
};
export const StopConfirmationDark:Story={...StopConfirmation,...dark};
export const StopConfirmationNarrow:Story={...StopConfirmation,parameters:{...dialogA11y,previewWidth:390}};
export const StopConfirmationNarrowDark:Story={...StopConfirmation,parameters:{...dialogA11y,previewWidth:390},...dark};

/** Waiting for the instrument to confirm the stop. */
export const Stopping:Story={args:{experimentView:{acquisition:'stopping',frozen:true}},parameters:dialogA11y,
  play:async({canvasElement})=>{
    const dialog=within(canvasElement.ownerDocument.body).getByRole('dialog');
    await expect(within(dialog).getByRole('button',{name:'Stopping…'})).toBeDisabled();
    await expect(dialog).toHaveTextContent('Waiting for MS-01 to confirm…');
  },
};
export const StoppingDark:Story={...Stopping,...dark};
export const StoppingNarrow:Story={...Stopping,parameters:{...dialogA11y,previewWidth:390}};
export const StoppingNarrowDark:Story={...Stopping,parameters:{...dialogA11y,previewWidth:390},...dark};

/** Stopping keeps the samples as a recording and the page switches to playback. */
export const StopToRecorded:Story={parameters:dialogA11y,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement),body=within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button',{name:'Stop acquisition'}));
    await userEvent.click(within(await body.findByRole('dialog')).getByRole('button',{name:'Stop acquisition'}));
    await waitFor(()=>expect(canvas.getByRole('group',{name:'Recording playback'})).toBeVisible(),{timeout:5000});
    await waitFor(()=>expect(body.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(canvasElement.querySelector('.dv-acq-status')).toHaveTextContent('Acquisition stopped. 87 samples saved as a recording.');
    await expect(canvasElement.querySelector('.dv-page-meta')).toHaveTextContent(/Recorded.*87 samples.*00:43/);
    await expect(canvas.getByRole('button',{name:'Review & export'})).toBeVisible();
  },
};

const stopAcquisition=async(canvasElement:HTMLElement)=>{
  const canvas=within(canvasElement),body=within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole('button',{name:'Stop acquisition'}));
  await userEvent.click(within(await body.findByRole('dialog')).getByRole('button',{name:'Stop acquisition'}));
};
/** Reports, when called, whether anything in the story started an enter or leave animation since this was set up. */
const watchMotion=(root:HTMLElement)=>{
  let seen=false;
  const observer=new MutationObserver(()=>{ seen||=!!root.querySelector('[data-motion]'); });
  observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-motion']});
  return ()=>{ observer.disconnect(); return seen||!!root.querySelector('[data-motion]'); };
};

/** Stopping cross-fades the page: the live streams fade out over the recording, inert, then leave the page. */
export const StopCrossFades:Story={parameters:dialogA11y,
  play:async({canvasElement})=>{
    await stopAcquisition(canvasElement);
    const leaving=await waitFor(()=>{ const node=canvasElement.querySelector('[data-motion=leave]:has(> .dv-xw-live)'); expect(node).not.toBeNull(); return node!; },{timeout:5000});
    await expect(leaving).toHaveAttribute('inert');
    await expect(within(canvasElement).getByRole('group',{name:'Recording playback'}).closest('[inert]'),'the recording is usable while it fades in').toBeNull();
    await settleMotion();
    await waitFor(()=>expect(canvasElement.querySelector('.dv-xw-live')).toBeNull());
    await waitFor(()=>expect(canvasElement.querySelector('[data-motion]')).toBeNull());
  },
};
/** Under reduced motion the recording replaces the live streams at once, with nothing fading. */
export const StopCrossFadesReducedMotion:Story={parameters:dialogA11y,beforeEach:reduceMotion,
  play:async({canvasElement})=>{
    const motionSeen=watchMotion(canvasElement);
    await stopAcquisition(canvasElement);
    await waitFor(()=>expect(within(canvasElement).getByRole('group',{name:'Recording playback'})).toBeVisible(),{timeout:5000});
    await expect(canvasElement.querySelector('.dv-xw-live')).toBeNull();
    await expect(motionSeen(),'nothing entered or left with an animation').toBe(false);
  },
};

/** Collapsed sidebar: only the 52 px tab rail stays. */
export const SidebarCollapsed:Story={args:{experimentView:{sidebarCollapsed:true}},
  play:async({canvasElement})=>{
    await expect(box(canvasElement,'.dv-right-sidebar').width).toBe(52);
    await expect(within(canvasElement).queryByRole('tabpanel')).not.toBeInTheDocument();
    await waitFor(()=>expectCentredBesideSidebar(canvasElement));
  },
};
export const SidebarCollapsedDark:Story={...SidebarCollapsed,...dark};
export const SidebarCollapsedNarrow:Story={args:{experimentView:{sidebarCollapsed:true}},...narrow};
export const SidebarCollapsedNarrowDark:Story={...SidebarCollapsedNarrow,...dark};

/** Signals tab: hiding a signal removes its card. */
export const SignalsTab:Story={args:{experimentView:{tab:'signals'}},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('switch',{name:'Show Temperature'}));
    await expect(canvasElement.querySelector('[data-stream=temperature]')).toBeNull();
    await userEvent.click(canvas.getByRole('switch',{name:'Show Temperature'}));
    await expect(canvasElement.querySelector('[data-stream=temperature]')).not.toBeNull();
  },
};
export const SignalsTabDark:Story={args:{experimentView:{tab:'signals'}},...dark};
export const SignalsTabNarrow:Story={args:{experimentView:{tab:'signals'}},...narrow};
export const SignalsTabNarrowDark:Story={args:{experimentView:{tab:'signals'}},...narrow,...dark};

/** Display tab: decimal places change the Mass 44 reading; limits unlock with a fixed range. */
export const DisplayTab:Story={args:{experimentView:{tab:'display'}},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByLabelText('Minimum Y')).toBeDisabled();
    await chooseOption(canvas.getByLabelText('Scale'),'fixed');
    await expect(canvas.getByLabelText('Minimum Y')).toBeEnabled();
    await chooseOption(canvas.getByLabelText('Decimal places'),'3');
    await expect(canvasElement.querySelector('[data-live-value=mass44]')!.textContent).toMatch(/^\d+\.\d{3}$/);
    await chooseOption(canvas.getByLabelText('Scale'),'auto');
    await chooseOption(canvas.getByLabelText('Decimal places'),'2');
  },
};
export const DisplayTabDark:Story={args:{experimentView:{tab:'display'}},...dark};
export const DisplayTabNarrow:Story={args:{experimentView:{tab:'display'}},...narrow};
export const DisplayTabNarrowDark:Story={args:{experimentView:{tab:'display'}},...narrow,...dark};

/** Problems present: header trigger, tab count and grouped list. */
export const ProblemsPresent:Story={args:{experimentView:{tab:'problems',problems:'present',frozen:true}},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole('button',{name:'3 problems need attention'})).toBeVisible();
    await expect(canvas.getByRole('tab',{name:/^Problems\s*,\s*3$/})).toHaveAttribute('aria-selected','true');
    await expect(canvas.getByText('3 problems need attention · 1 notice')).toBeVisible();
  },
};
export const ProblemsPresentDark:Story={args:{experimentView:{tab:'problems',problems:'present',frozen:true}},...dark};
export const ProblemsPresentNarrow:Story={args:{experimentView:{tab:'problems',problems:'present',frozen:true}},...narrow};
export const ProblemsPresentNarrowDark:Story={args:{experimentView:{tab:'problems',problems:'present',frozen:true}},...narrow,...dark};

/** A selected problem flags the panels it affects. */
export const ProblemSelected:Story={args:{experimentView:{tab:'problems',problems:'present',selectedProblem:'i1',frozen:true}},
  play:async({canvasElement})=>{
    const flagged=[...canvasElement.querySelectorAll('.dv-xw-panel')].filter(el=>el.querySelector('[data-flag=error]')).map(el=>el.getAttribute('data-panel'));
    await expect(flagged).toEqual(['mass44','mass45']);
    await expect(canvasElement.querySelectorAll('.dv-prob-flag')).toHaveLength(2);
  },
};
export const ProblemSelectedDark:Story={args:{experimentView:{tab:'problems',problems:'present',selectedProblem:'i1',frozen:true}},...dark};
export const ProblemSelectedNarrow:Story={args:{experimentView:{tab:'problems',problems:'present',selectedProblem:'i1',frozen:true}},...narrow};
export const ProblemSelectedNarrowDark:Story={args:{experimentView:{tab:'problems',problems:'present',selectedProblem:'i1',frozen:true}},...narrow,...dark};

/** No problems: the Problems tab says so and when it last checked. */
export const NoProblems:Story={args:{experimentView:{tab:'problems'}},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole('button',{name:'No problems'})).toBeVisible();
    await expect(canvas.getByText('Last checked 14:05:12. New problems appear here as they happen.')).toBeVisible();
  },
};
export const NoProblemsDark:Story={args:{experimentView:{tab:'problems'}},...dark};
export const NoProblemsNarrow:Story={args:{experimentView:{tab:'problems'}},...narrow};
export const NoProblemsNarrowDark:Story={args:{experimentView:{tab:'problems'}},...narrow,...dark};

/** Mass 44 is missing; the other streams keep updating. */
export const PartialSignals:Story={args:{unavailable:true}};
