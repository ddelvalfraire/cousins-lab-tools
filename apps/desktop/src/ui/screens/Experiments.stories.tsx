import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
import { chooseOption } from '../components/chooseOption';
const meta={title:'Screens/Experiments',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'experiments',empty:false}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Home:Story={};
/** The experiments list at the Largest text size. */
export const HomeLargestText:Story={globals:{textSize:'largest'}};
export const FirstUse:Story={args:{empty:true}};
export const NewExperimentFlow:Story={play:async({canvasElement})=>{const canvas=within(canvasElement);await userEvent.click(canvas.getByRole('button',{name:'New experiment…'}));await expect(canvas.getByRole('heading',{name:'New experiment',level:1})).toBeVisible();await userEvent.clear(canvas.getByLabelText('Experiment name',{exact:true}));await userEvent.type(canvas.getByLabelText('Experiment name',{exact:true}),'Review specimen');await userEvent.click(canvas.getByRole('button',{name:'Open experiment'}));await expect(canvas.getByRole('heading',{name:'Review specimen',level:1})).toBeVisible();}};

/** The page scope filters the Experiments list; All DVDash searches every catalog instead. */
export const SearchScope:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement),scope=canvas.getByRole('combobox',{name:'Search scope'});
  await expect(scope).toHaveValue('Experiments');
  await userEvent.type(canvas.getByRole('searchbox',{name:'Search experiments'}),'enzyme');
  await expect(canvas.getByText('Filtered by “enzyme”')).toBeVisible();
  await expect(canvasElement.querySelectorAll('tbody tr')).toHaveLength(1);
  await expect(canvas.queryByRole('listbox')).toBeNull();
  await chooseOption(scope,'All DVDash');
  await waitFor(()=>expect(canvas.queryByText('Filtered by “enzyme”')).toBeNull());
  await expect(canvas.getByRole('group',{name:'Experiments'})).toHaveTextContent('Enzyme assay · Extract 08');
  await userEvent.type(canvas.getByRole('combobox',{name:'Search all DVDash'}),'{Enter}');
  await expect(canvas.getByRole('heading',{level:1,name:'Enzyme assay · Extract 08'})).toBeVisible();
  // The experiment page has no filter yet, so its scope option is offered but disabled.
  await expect(canvas.getByRole('combobox',{name:'Search scope'})).toHaveValue('All DVDash');
  await userEvent.click(canvas.getByRole('combobox',{name:'Search scope'}));
  await expect(await within(document.body).findByRole('option',{name:'This experiment'})).toHaveAttribute('aria-disabled','true');
  await userEvent.keyboard('{Escape}');
}};

/** A page filter with no match shows the list's own empty state. */
export const SearchNoMatch:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.type(canvas.getByRole('searchbox',{name:'Search experiments'}),'argon');
  await expect(canvas.getByRole('heading',{name:'No experiments match “argon”'})).toBeVisible();
  await userEvent.click(canvas.getAllByRole('button',{name:'Clear filter'})[0]);
  await expect(canvas.getByRole('searchbox',{name:'Search experiments'})).toHaveValue('');
}};

/** Records open their own page: an instrument opens the catalog with it selected. N opens a new experiment. */
export const OpenFromCommandCenter:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  canvasElement.querySelector<HTMLElement>('main')!.focus();
  await userEvent.keyboard('{Control>}k{/Control}');
  await userEvent.type(canvas.getByRole('combobox',{name:'Search all DVDash'}),'temperature probe');
  await userEvent.keyboard('{Enter}');
  await expect(canvas.getByRole('heading',{level:1,name:'Instruments'})).toBeVisible();
  await waitFor(()=>expect(canvasElement.querySelector('.dv-right-sidebar')).toHaveTextContent('Temperature probe'));
  canvasElement.querySelector<HTMLElement>('main')!.focus();
  await userEvent.keyboard('n');
  await expect(canvas.getByRole('heading',{name:'New experiment',level:1})).toBeVisible();
}};
