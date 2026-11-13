import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';

/**
 * Recorded experiments. The first stories open Sample 024's recording with the compact sticky playback transport;
 * the last four are the Review & export page.
 */
const meta={title:'Screens/Review',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'review'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;

const recorded={initialPage:'experiment',initialExperiment:'sample-024'} as const;
const dark={globals:{appearance:'dark'}} as const;
const narrow={parameters:{previewWidth:390}} as const;
/** The Review & export page uses the frame width of the other screens. */
const page={parameters:{previewWidth:'viewport'}} as const;
const box=(root:HTMLElement,selector:string)=>root.querySelector(selector)!.getBoundingClientRect();

/** Paused at 42 s, as in sticky-playback-review.html. Keyboard steps and jumps move the playhead. */
export const PlaybackPaused:Story={args:{...recorded},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const transport=canvas.getByRole('group',{name:'Recording playback'});
    await expect(transport.getBoundingClientRect().height).toBe(52);
    await expect(getComputedStyle(transport).position).toBe('sticky');
    await expect(transport).toHaveTextContent('00:42.0');
    await expect(transport).toHaveTextContent('Sample 85 / 601');
    await expect(canvas.getByRole('button',{name:'Play recording'})).toBeVisible();
    await expect(box(canvasElement,'.dv-xw-chart').height).toBe(228);
    await expect(canvasElement.querySelector('tbody tr')).toHaveTextContent('0.0');
    await userEvent.click(canvas.getByRole('button',{name:'Show current sample'}));
    await expect(canvasElement.querySelector('tr[data-current=true]')).toHaveTextContent('42.0');
    await userEvent.click(canvas.getByRole('button',{name:'First sample page'}));
    await expect(canvasElement.querySelector('.dv-page-meta')).toHaveTextContent(/Recorded.*601 samples.*05:00.*No problems/);
  },
};
export const PlaybackPausedDark:Story={args:{...recorded},...dark};
export const PlaybackPausedNarrow:Story={args:{...recorded},...narrow};
export const PlaybackPausedNarrowDark:Story={args:{...recorded},...narrow,...dark};

/** Playing (held at 42 s for review): the primary button pauses. */
export const PlaybackPlaying:Story={args:{...recorded,experimentView:{playing:true,frozen:true}},
  play:async({canvasElement})=>{
    await expect(within(canvasElement).getByRole('button',{name:'Pause playback'})).toBeVisible();
  },
};
export const PlaybackPlayingDark:Story={args:{...recorded,experimentView:{playing:true,frozen:true}},...dark};
export const PlaybackPlayingNarrow:Story={args:{...recorded,experimentView:{playing:true,frozen:true}},...narrow};
export const PlaybackPlayingNarrowDark:Story={args:{...recorded,experimentView:{playing:true,frozen:true}},...narrow,...dark};

/** Keyboard: Home, arrows and End move the playhead from anywhere in the workspace. Show current sample pages the table to it. */
export const KeyboardScrubbing:Story={args:{...recorded},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const slider=canvas.getByRole('slider',{name:'Playback position'});
    canvas.getByRole('button',{name:'Next sample'}).focus();
    await userEvent.keyboard('{Home}');
    await expect(slider).toHaveAttribute('aria-valuetext','00:00.0 of 05:00.0');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(slider).toHaveAttribute('aria-valuetext','00:01.5 of 05:00.0');
    await userEvent.click(canvas.getByRole('button',{name:'Show current sample'}));
    await expect(canvasElement.querySelector('tr[data-current=true]')).toHaveTextContent('1.5');
    canvas.getByRole('button',{name:'Next sample'}).focus();
    await userEvent.click(canvas.getByRole('button',{name:'Next sample'}));
    await expect(slider).toHaveAttribute('aria-valuetext','00:02.0 of 05:00.0');
    await userEvent.keyboard('{End}');
    await expect(slider).toHaveAttribute('aria-valuetext','05:00.0 of 05:00.0');
    await expect(canvas.getByRole('button',{name:'Replay recording'})).toBeVisible();
  },
};

/** Collapsed sidebar beside the recording. */
export const RecordedSidebarCollapsed:Story={args:{...recorded,experimentView:{sidebarCollapsed:true}},
  play:async({canvasElement})=>{ await expect(box(canvasElement,'.dv-right-sidebar').width).toBe(52); },
};
export const RecordedSidebarCollapsedDark:Story={args:{...recorded,experimentView:{sidebarCollapsed:true}},...dark};
export const RecordedSidebarCollapsedNarrow:Story={args:{...recorded,experimentView:{sidebarCollapsed:true}},...narrow};
export const RecordedSidebarCollapsedNarrowDark:Story={args:{...recorded,experimentView:{sidebarCollapsed:true}},...narrow,...dark};

export const RecordedSignalsTab:Story={args:{...recorded,experimentView:{tab:'signals'}}};
export const RecordedSignalsTabDark:Story={args:{...recorded,experimentView:{tab:'signals'}},...dark};
export const RecordedDisplayTab:Story={args:{...recorded,experimentView:{tab:'display'}}};
export const RecordedDisplayTabDark:Story={args:{...recorded,experimentView:{tab:'display'}},...dark};

/** Recording with a gap: one notice; selecting it flags the charts, which leave the gap blank. */
export const RecordedProblems:Story={args:{...recorded,experimentView:{tab:'problems',problems:'present',selectedProblem:'r1',frozen:true}},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getByRole('button',{name:'1 notice'})).toBeVisible();
    await expect(canvasElement.querySelector('[data-panel=charts] [data-flag]')).toHaveAttribute('data-flag','warning');
    await expect(canvasElement.querySelector('.dv-xw-chart .dv-trace-line')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
  },
};
export const RecordedProblemsDark:Story={args:{...recorded,experimentView:{tab:'problems',problems:'present',selectedProblem:'r1',frozen:true}},...dark};
export const RecordedProblemsNarrow:Story={args:{...recorded,experimentView:{tab:'problems',problems:'present',selectedProblem:'r1',frozen:true}},...narrow};
export const RecordedProblemsNarrowDark:Story={args:{...recorded,experimentView:{tab:'problems',problems:'present',selectedProblem:'r1',frozen:true}},...narrow,...dark};

export const RecordedNoProblems:Story={args:{...recorded,experimentView:{tab:'problems'}}};
export const RecordedNoProblemsDark:Story={args:{...recorded,experimentView:{tab:'problems'}},...dark};

/** Review & export page: the recording's signals beside its details (source-binding-review.html chart, right-sidebar-review.html facts). */
export const RecordingOverview:Story={...page,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole('heading',{level:2,name:'Recording details'})).toBeVisible();
  await expect(canvas.getByRole('region',{name:/Mass 44, Mass 45, Mass 49 · Signal \(mV\) by Time since source start/})).toBeVisible();
  await expect(canvas.getByText('Selected interval: 120–140 s')).toBeVisible();
  await expect(canvas.queryByRole('tab',{name:'Export'})).toBeNull();
}};
/** The recording beside its reference, aligned in the sidebar (alignment-inspector-review.html). */
export const Alignment:Story={...page,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole('tab',{name:'Align & compare'}));
  await expect(canvas.getByRole('heading',{level:2,name:'Alignment'})).toBeVisible();
  await expect(canvas.getByText('Each recording starts at 0 s. This does not imply simultaneous acquisition.')).toBeVisible();
}};
/** Saved interval results with the selected result's details (saved-result-inspector-review.html). */
export const Results:Story={...page,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole('tab',{name:'Results'}));
  await expect(canvas.getByRole('heading',{level:2,name:'Saved results'})).toBeVisible();
  await expect(canvas.getByRole('heading',{level:2,name:'Result details'})).toBeVisible();
  await expect(canvas.getByText('(1.508 − 0.303) × 83 = 100.015')).toBeVisible();
  await expect(canvas.getByText('1–3 of 6')).toBeVisible();
}};
/** Export recording opens the export dialog (recording-export-review.html). */
export const Export:Story={...page,play:async({canvasElement})=>{
  await userEvent.click(within(canvasElement).getByRole('button',{name:'Export recording'}));
  const dialog=await within(canvasElement.ownerDocument.body).findByRole('dialog');
  // The dialog mounts after the click and fades in.
  await waitFor(()=>expect(within(dialog).getByText('601 rows · 4 signals')).toBeVisible());
  await expect(within(dialog).getByRole('button',{name:'Export CSV'})).toBeEnabled();
}};
