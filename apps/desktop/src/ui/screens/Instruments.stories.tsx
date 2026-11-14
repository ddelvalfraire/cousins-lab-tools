import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
import { ScreenShell } from './ScreenShell';
import { InstrumentsPage } from './CatalogPages';
import { experiments } from './screen-fixtures';
import { toAcquisition, toRecents } from './approved-fixtures';
import type { InstrumentCatalogProps } from '../components/InstrumentCatalog';

/** A frozen catalog state inside the frame. Navigation is recorded, not followed. */
function FrozenInstruments(state:Partial<InstrumentCatalogProps>){
  const navigate=fn();
  return <ScreenShell page="instruments" navigate={navigate} recents={toRecents(experiments)} acquisition={toAcquisition(experiments)}>
    <InstrumentsPage navigate={navigate} {...state}/>
  </ScreenShell>;
}

const meta={title:'Screens/Instruments',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'instruments'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
const rows=(canvasElement:HTMLElement)=>[...canvasElement.querySelectorAll('.dv-cat-table tbody tr')];

/** Navigable catalog in the workspace fixture. */
export const Profiles:Story={};
/** instrument-catalog-review.html, Mixed connections example: sorted by name, sidebar collapsed to its rail. */
export const Default:Story={render:()=><FrozenInstruments/>,play:async({canvasElement})=>{
  await expect(rows(canvasElement)).toHaveLength(3);
  await expect(rows(canvasElement)[0]).toHaveTextContent('Mass spectrometer');
  await expect(within(canvasElement).getByText('Disconnected')).toBeVisible();
}};
export const SelectedRow:Story={render:()=><FrozenInstruments initialSelected="MS-01"/>,play:async({canvasElement})=>{
  await expect(rows(canvasElement)[0]).toHaveAttribute('data-selected','true');
  await expect(within(canvasElement).getByText('COM3')).toBeVisible();
}};
export const ChannelsTab:Story={render:()=><FrozenInstruments initialSelected="MS-01" initialTab="channels"/>,play:async({canvasElement})=>{await expect(canvasElement.querySelectorAll('.dv-cat-channel')).toHaveLength(3);}};
export const ConnectTab:Story={render:()=><FrozenInstruments initialSelected="MS-02" initialTab="connect"/>,play:async({canvasElement})=>{await expect(within(canvasElement).getByRole('heading',{name:'Connection'})).toBeVisible();}};
export const SortedByConnection:Story={render:()=><FrozenInstruments initialSort={{key:'status',ascending:true}}/>,play:async({canvasElement})=>{
  await expect(within(canvasElement).getByRole('columnheader',{name:/Connection/})).toHaveAttribute('aria-sort','ascending');
  await expect(rows(canvasElement)[2]).toHaveTextContent('Reference spectrometer');
}};
export const Filtered:Story={render:()=><FrozenInstruments query="Temperature"/>,play:async({canvasElement})=>{
  await expect(rows(canvasElement)).toHaveLength(1);
  await expect(within(canvasElement).getByText('Filtered by “Temperature”')).toBeVisible();
}};
export const NoResults:Story={render:()=><FrozenInstruments query="argon"/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(canvas.getByRole('heading',{name:'No matching instruments'})).toBeVisible();
}};
/** Clear search in the no-results state brings every row back. */
export const ClearSearch:Story={render:()=><FrozenInstruments query="argon"/>,play:async({canvasElement})=>{
  await userEvent.click(within(canvasElement).getByRole('button',{name:'Clear search'}));
  await expect(rows(canvasElement)).toHaveLength(3);
}};
export const Empty:Story={render:()=><FrozenInstruments instruments={[]}/>,play:async({canvasElement})=>{await expect(within(canvasElement).getByRole('heading',{name:'No instruments configured'})).toBeVisible();}};
export const SidebarCollapsed:Story={render:()=><FrozenInstruments initialSelected="MS-01" initialCollapsed/>,play:async({canvasElement})=>{await expect(canvasElement.querySelector('.dv-right-sidebar')).toHaveAttribute('data-collapsed','true');}};
/** At 390 px the pane is a sheet over the list: each name opens it, the same name again too, and Escape closes it. */
export const NarrowSheet:Story={render:()=><FrozenInstruments/>,parameters:{previewWidth:390},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  const side=canvasElement.querySelector<HTMLElement>('.dv-right-sidebar')!;
  const choose=async(name:string)=>{
    await userEvent.click(canvas.getByRole('button',{name}));
    await expect(side).toHaveAttribute('data-collapsed','false');
    await waitFor(()=>expect(side.querySelector('.dv-cat-detail-identity strong')?.textContent).toBe(name));
    await waitFor(()=>expect(side.querySelector('[role=tabpanel]')).toHaveFocus());
  };
  const close=async()=>{await userEvent.keyboard('{Escape}');await expect(side).toHaveAttribute('data-collapsed','true');};
  await expect(side).toHaveAttribute('data-mode','sheet');
  await expect(side).toHaveAttribute('data-collapsed','true');
  await choose('Mass spectrometer');
  await close();
  await choose('Reference spectrometer');
  await close();
  await choose('Reference spectrometer');
}};
/** Connect is simulated: Connecting…, then Connected. Acquisition does not start. */
export const Connect:Story={render:()=><FrozenInstruments connectDelay={300}/>,play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(canvas.getByRole('button',{name:'Connect: Reference spectrometer'}));
  await expect(canvas.getByRole('button',{name:'Connecting…'})).toBeDisabled();
  await waitFor(()=>expect(canvas.getAllByText('Connected · not acquiring')).toHaveLength(2),{timeout:2000});
  await userEvent.click(canvas.getByRole('button',{name:'2 channels: Reference spectrometer'}));
  await waitFor(()=>expect(canvas.getByRole('heading',{name:'2 channels'})).toBeVisible());
}};
