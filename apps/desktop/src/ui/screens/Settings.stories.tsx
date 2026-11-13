import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
import { REVEAL_MS } from './revealTarget';
import { REDUCED_MOTION_QUERY } from '../motion';
const meta={title:'Screens/Settings',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'settings'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Appearance:Story={};

const page=(canvasElement:HTMLElement)=>canvasElement.querySelector<HTMLElement>('#dvdash-screen-main')!;
const target=(canvasElement:HTMLElement,id:string)=>canvasElement.querySelector<HTMLElement>(`[data-search-target="${id}"]`)!;
/** The box lies inside the page's scroller, which is where search scrolls, not the window. */
const inView=(canvasElement:HTMLElement,box:HTMLElement)=>{ const view=page(canvasElement).getBoundingClientRect(), rect=box.getBoundingClientRect(); return rect.top>=view.top-1&&rect.bottom<=view.bottom+1; };
const highlight=(box:HTMLElement)=>box.dataset.searchReveal;
const highlightAnimations=(box:HTMLElement)=>document.getAnimations().filter(animation=>(animation.effect as KeyframeEffect|null)?.target===box);
async function pick(canvasElement:HTMLElement,query:string,option:RegExp){
  const canvas=within(canvasElement);
  await userEvent.keyboard('{Control>}k{/Control}');
  await userEvent.type(canvas.getByRole('combobox',{name:'Search all DVDash'}),query);
  await userEvent.click(await canvas.findByRole('option',{name:option}));
}
/** Reports reduced motion to scripts, as the OS setting does. The stylesheet's media query is covered in the browser tests. */
function reduceMotion(){
  const original=window.matchMedia;
  window.matchMedia=(query:string)=>query===REDUCED_MOTION_QUERY
    ? { matches:true, media:query, onchange:null, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent:()=>false } as MediaQueryList
    : original.call(window,query);
  return ()=>{ window.matchMedia=original; };
}

/** From the bottom of Settings, search finds "Decimal separator": the page scrolls up to it, focuses its field and highlights it, then the highlight fades. */
export const SearchScrollsToSetting:Story={
  parameters:{previewWidth:390},
  play:async({canvasElement})=>{
    const canvas=within(canvasElement), scroller=page(canvasElement);
    scroller.scrollTop=scroller.scrollHeight;
    const box=target(canvasElement,'settings.numbers.decimal');
    await waitFor(()=>expect(inView(canvasElement,box)).toBe(false));
    await pick(canvasElement,'decimal',/^Decimal separator/);
    await waitFor(()=>expect(highlight(box)).toBe('pulse'));
    await expect(canvas.getByRole('combobox',{name:'Decimal separator'})).toHaveFocus();
    await waitFor(()=>expect(inView(canvasElement,box)).toBe(true));
    await expect(window.scrollY).toBe(0);
    await expect(canvasElement.querySelector('.dv-shell-sr[role=status]')).toHaveTextContent('Decimal separator, Settings, Numbers.');
    await expect(highlightAnimations(box).length).toBeGreaterThan(0);
    await waitFor(()=>expect(highlight(box)).toBeUndefined(),{timeout:REVEAL_MS+1000});
    await expect(canvas.getByRole('combobox',{name:'Decimal separator'})).toHaveFocus();
  },
};

/** Under reduced motion the page jumps straight to the Export section and the highlight is static, with nothing animating. */
export const SearchScrollsToSectionReducedMotion:Story={
  parameters:{previewWidth:390},
  beforeEach:reduceMotion,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement), scroller=page(canvasElement);
    scroller.scrollTop=0;
    const box=target(canvasElement,'settings.export');
    await expect(inView(canvasElement,box)).toBe(false);
    await pick(canvasElement,'export',/^Export Settings$/);
    await waitFor(()=>expect(highlight(box)).toBe('static'));
    // Already there in the frame the highlight appears: no smooth scroll.
    await expect(inView(canvasElement,box)).toBe(true);
    await expect(canvas.getByRole('heading',{level:3,name:'Export'})).toHaveFocus();
    await expect(highlightAnimations(box)).toEqual([]);
    await waitFor(()=>expect(highlight(box)).toBeUndefined(),{timeout:REVEAL_MS+1000});
    // The heading took focus from code only; once focus leaves it, it is not a tab stop.
    await userEvent.tab();
    await expect(canvas.getByRole('heading',{level:3,name:'Export'})).not.toHaveAttribute('tabindex');
  },
};

/** Choosing a place that is already in view focuses and highlights it without moving the page. */
export const SearchTargetAlreadyVisible:Story={
  play:async({canvasElement})=>{
    const scroller=page(canvasElement);
    scroller.scrollTop=0;
    const before=scroller.scrollTop, box=target(canvasElement,'settings.appearance.theme');
    await pick(canvasElement,'theme',/^Theme/);
    await waitFor(()=>expect(highlight(box)).toBe('pulse'));
    await expect(within(canvasElement).getByRole('radio',{name:'Light'})).toHaveFocus();
    await expect(scroller.scrollTop).toBe(before);
  },
};

/** Scrolling or typing ends the highlight early, with its fade out. */
export const HighlightEndsWhenTheUserMoves:Story={
  play:async({canvasElement})=>{
    const box=target(canvasElement,'settings.recordings.folder');
    await pick(canvasElement,'recordings folder',/^Recordings folder/);
    await waitFor(()=>expect(highlight(box)).toBe('pulse'));
    page(canvasElement).dispatchEvent(new WheelEvent('wheel',{deltaY:40,bubbles:true}));
    await expect(highlight(box)).toBe('leave');
    await waitFor(()=>expect(highlight(box)).toBeUndefined(),{timeout:500});
    await pick(canvasElement,'recordings folder',/^Recordings folder/);
    await waitFor(()=>expect(highlight(box)).toBe('pulse'));
    await userEvent.keyboard('{Tab}');
    await expect(highlight(box)).toBe('leave');
  },
};

/** A deep link to a section on a cold start scrolls to it and highlights it once the page is laid out. */
export const DeepLinkToSection:Story={
  parameters:{previewWidth:390},
  args:{initialTarget:'settings.export'},
  play:async({canvasElement})=>{
    const box=target(canvasElement,'settings.export');
    await waitFor(()=>expect(highlight(box)).toBe('pulse'));
    await expect(within(canvasElement).getByRole('heading',{level:3,name:'Export'})).toHaveFocus();
    await waitFor(()=>expect(inView(canvasElement,box)).toBe(true));
  },
};
