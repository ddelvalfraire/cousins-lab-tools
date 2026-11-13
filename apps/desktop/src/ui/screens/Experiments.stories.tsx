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
  // The empty state replaces the table with a fade (Swap), so it starts at opacity 0.
  await waitFor(()=>expect(canvas.getByRole('heading',{name:'No experiments match “argon”'})).toBeVisible());
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

const side=(root:HTMLElement)=>root.querySelector<HTMLElement>('.dv-right-sidebar')!;
const listRows=(root:HTMLElement)=>[...root.querySelectorAll('.dv-exp-table tbody tr')];
/** Waits out the swap's fade so only the new experiment is in the pane. */
const sidebarShows=(root:HTMLElement,name:string)=>waitFor(()=>expect([...side(root).querySelectorAll('.dv-cat-detail-identity strong')].map(e=>e.textContent)).toEqual([name]));
const fits=async(root:HTMLElement)=>{for(const el of side(root).querySelectorAll<HTMLElement>('.dv-right-sidebar-content, .dv-sidebar-facts, .dv-cat-detail-identity'))await expect(el.scrollWidth,el.className).toBeLessThanOrEqual(el.clientWidth);};

/** The first row is selected as the page opens and the Details sidebar shows it; its action opens the experiment. */
export const DetailsSidebar:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement),pane=within(side(canvasElement));
  await expect(listRows(canvasElement)[0]).toHaveAttribute('data-selected','true');
  await expect(side(canvasElement)).toHaveAttribute('data-mode','docked');
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','false');
  await sidebarShows(canvasElement,'Leaf respiration · Sample 025');
  for(const text of ['Running','Instrument','CO₂ & O₂ analysis · R3','Oct 30, 2026','15:12:00','87'])await expect(side(canvasElement)).toHaveTextContent(text);
  await userEvent.click(pane.getByRole('button',{name:'Open live: Leaf respiration · Sample 025'}));
  await expect(canvas.getByRole('heading',{level:1,name:'Leaf respiration · Sample 025'})).toBeVisible();
}};

/** A click or Enter on another name selects its row, updates the sidebar and moves focus to it, as in the catalogs. */
export const ChangeSelection:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement),table=within(canvasElement.querySelector('table')!);
  await userEvent.click(table.getByRole('button',{name:'Leaf respiration · Sample 024'}));
  await expect(listRows(canvasElement).map(row=>row.getAttribute('data-selected'))).toEqual(['false','true','false','false']);
  await sidebarShows(canvasElement,'Leaf respiration · Sample 024');
  await expect(side(canvasElement)).toHaveTextContent('Recording file');
  await waitFor(()=>expect(side(canvasElement).querySelector('[role=tabpanel]')).toHaveFocus());
  table.getByRole('button',{name:'Enzyme assay · Extract 08'}).focus();
  await userEvent.keyboard('{Enter}');
  await sidebarShows(canvasElement,'Enzyme assay · Extract 08');
  await expect(listRows(canvasElement)[2]).toHaveAttribute('data-selected','true');
  await expect(canvas.getByRole('heading',{level:1,name:'Experiments'})).toBeVisible();
}};

/** No experiments: the sidebar says what it will show, as the catalogs do. */
export const EmptySidebar:Story={args:{empty:true},play:async({canvasElement})=>{
  await expect(within(side(canvasElement)).getByText('Select an experiment')).toBeVisible();
  await expect(side(canvasElement).querySelector('.dv-sidebar-facts')).toBeNull();
}};

/** A filter that matches nothing leaves nothing selected; clearing it selects the first row again. */
export const FilteredToNothing:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.type(canvas.getByRole('searchbox',{name:'Search experiments'}),'argon');
  await waitFor(()=>expect(within(side(canvasElement)).getByText('Select an experiment')).toBeVisible());
  await userEvent.click(canvas.getAllByRole('button',{name:'Clear filter'})[0]);
  await sidebarShows(canvasElement,'Leaf respiration · Sample 025');
}};

/** Collapse keeps the rail; the Details tab opens the pane again on the same experiment. */
export const SidebarCollapse:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole('button',{name:'Collapse right sidebar'}));
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','true');
  await userEvent.click(canvas.getByRole('tab',{name:'Details'}));
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','false');
  await sidebarShows(canvasElement,'Leaf respiration · Sample 025');
}};

/** At 390 px the pane is a sheet over the list: closed at first, opened by each selection, closed by Escape. */
export const NarrowSheet:Story={parameters:{previewWidth:390},play:async({canvasElement})=>{
  const table=within(canvasElement.querySelector('table')!);
  await expect(side(canvasElement)).toHaveAttribute('data-mode','sheet');
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','true');
  await userEvent.click(table.getByRole('button',{name:'Leaf respiration · Sample 024'}));
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','false');
  await sidebarShows(canvasElement,'Leaf respiration · Sample 024');
  await waitFor(()=>expect(side(canvasElement).querySelector('[role=tabpanel]')).toHaveFocus());
  await userEvent.keyboard('{Escape}');
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','true');
  await userEvent.click(table.getByRole('button',{name:'Enzyme assay · Extract 08'}));
  await expect(side(canvasElement)).toHaveAttribute('data-collapsed','false');
  await sidebarShows(canvasElement,'Enzyme assay · Extract 08');
  await fits(canvasElement);
}};

/** Dark appearance with the first row selected. */
export const DetailsSidebarDark:Story={globals:{appearance:'dark'},play:async({canvasElement})=>{await sidebarShows(canvasElement,'Leaf respiration · Sample 025');await fits(canvasElement);}};
/** Largest text: the facts wrap inside the pane and the header buttons stay on the title line. */
export const DetailsSidebarLargestText:Story={globals:{textSize:'largest'},play:async({canvasElement})=>{
  await sidebarShows(canvasElement,'Leaf respiration · Sample 025');
  await fits(canvasElement);
  await expect(canvasElement.querySelector('.dv-shell-page .dv-page-header')).toHaveAttribute('data-actions','title');
  await expect(canvasElement.querySelector('.dv-shell-page .dv-page-actionbar')).toBeNull();
}};
/** Largest text at 390 px: the sheet opens on a selection and its facts fit. */
export const NarrowSheetLargestText:Story={...NarrowSheet,globals:{textSize:'largest'}};
