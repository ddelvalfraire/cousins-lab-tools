import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
import { ScreenShell } from './ScreenShell';
import { RoutinesPage } from './CatalogPages';
import { experiments } from './screen-fixtures';
import { toAcquisition, toRecents } from './approved-fixtures';
import type { RoutineCatalogProps } from '../components/RoutineCatalog';

/** A frozen catalog state inside the frame. Navigation is recorded, not followed. */
function FrozenRoutines(state:Partial<RoutineCatalogProps>){
  const navigate=fn();
  return <ScreenShell page="routines" navigate={navigate} recents={toRecents(experiments)} acquisition={toAcquisition(experiments)}>
    <RoutinesPage navigate={navigate} onUseRoutine={fn()} onEditRoutine={fn()} {...state}/>
  </ScreenShell>;
}

const meta={title:'Screens/Routines',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'routines'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
/** Ends on the New experiment page, whose own heading-order violation also fails the Preparation stories; the catalog part passes. */
const endsOnSetup={a11y:{test:'todo'}} as const;
const rows=(canvasElement:HTMLElement)=>[...canvasElement.querySelectorAll('.dv-cat-routine')];

/** Navigable catalog in the workspace fixture. */
export const Catalog:Story={};
/** routine-catalog-review.html, Catalog example: sorted by name, sidebar collapsed to its rail. */
export const Default:Story={render:()=><FrozenRoutines/>,play:async({canvasElement})=>{
  await expect(rows(canvasElement)).toHaveLength(3);
  await expect(rows(canvasElement)[0]).toHaveTextContent('Baseline then sample');
  await expect(within(canvasElement).getAllByRole('button',{name:/^Step \d+ /})).toHaveLength(19);
}};
export const SelectedRow:Story={render:()=><FrozenRoutines initialSelected="baseline"/>,play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole('heading',{level:3,name:'Baseline then sample'})).toBeVisible();
  await expect(within(canvasElement).getByText('55 s')).toBeVisible();
}};
export const StepsTab:Story={render:()=><FrozenRoutines initialSelected="baseline" initialTab="steps"/>,play:async({canvasElement})=>{await expect(within(canvasElement).getByRole('heading',{name:'4 ordered steps'})).toBeVisible();}};
export const SelectedStep:Story={render:()=><FrozenRoutines initialSelected="baseline" initialTab="steps" initialStep={1}/>,play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole('button',{name:/^Step 2 Baseline/})).toHaveAttribute('aria-current','true');
  await expect(within(canvasElement).getByRole('heading',{name:'Capture baseline'})).toBeVisible();
}};
export const InputsTab:Story={render:()=><FrozenRoutines initialSelected="baseline" initialTab="inputs"/>,play:async({canvasElement})=>{await expect(within(canvasElement).getByRole('heading',{name:'Default parameters'})).toBeVisible();}};
export const SortedDescending:Story={render:()=><FrozenRoutines initialAscending={false}/>,play:async({canvasElement})=>{await expect(rows(canvasElement)[0]).toHaveTextContent('Repeated sampling');}};
export const Filtered:Story={render:()=><FrozenRoutines query="Reference"/>,play:async({canvasElement})=>{
  await expect(rows(canvasElement)).toHaveLength(1);
  await expect(within(canvasElement).getByText('Filtered by “Reference”')).toBeVisible();
}};
export const NoResults:Story={render:()=><FrozenRoutines query="argon"/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole('heading',{name:'No matching routines'})).toBeVisible();
}};
/** Clear search in the no-results state brings every row back. */
export const ClearSearch:Story={render:()=><FrozenRoutines query="argon"/>,play:async({canvasElement})=>{
  await userEvent.click(within(canvasElement).getByRole('button',{name:'Clear search'}));
  await expect(rows(canvasElement)).toHaveLength(3);
}};
export const Empty:Story={render:()=><FrozenRoutines routines={[]}/>,play:async({canvasElement})=>{await expect(within(canvasElement).getByRole('heading',{name:'No routines yet'})).toBeVisible();}};
export const SidebarCollapsed:Story={render:()=><FrozenRoutines initialSelected="baseline" initialCollapsed/>,play:async({canvasElement})=>{await expect(canvasElement.querySelector('.dv-right-sidebar')).toHaveAttribute('data-collapsed','true');}};
/** Selecting a step in a row opens it in the Steps tab; back returns to the full list. */
export const InspectStep:Story={render:()=><FrozenRoutines/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole('button',{name:/^Step 3 Annotate/}));
  await expect(canvas.getByRole('heading',{name:'Sample added'})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'All 4 steps'}));
  await expect(canvas.getByRole('heading',{name:'4 ordered steps'})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:/Routine, sorted A to Z/}));
  await expect(rows(canvasElement)[0]).toHaveTextContent('Repeated sampling');
}};
/** Use routine opens experiment setup with that routine. */
export const UseRoutine:Story={parameters:endsOnSetup,play:async({canvasElement})=>{const canvas=within(canvasElement);await userEvent.click(canvas.getByRole('button',{name:'Reference and sample'}));await userEvent.click(canvas.getByRole('button',{name:'Use routine: Reference and sample'}));await expect(canvas.getByRole('heading',{level:1,name:'New experiment'})).toBeVisible();}};
export const EditRoutine:Story={play:async({canvasElement})=>{const canvas=within(canvasElement);await userEvent.click(canvas.getByRole('button',{name:'Reference and sample'}));await userEvent.click(canvas.getByRole('button',{name:'Edit routine: Reference and sample'}));await expect(canvas.getByRole('heading',{level:1,name:'Reference and sample'})).toBeVisible();await expect(canvas.getAllByRole('article',{name:/^Step \d of 3:/})).toHaveLength(3);}};
