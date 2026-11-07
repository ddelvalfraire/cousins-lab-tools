import type { Meta, StoryObj } from '@storybook/react-vite';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
const meta={title:'Screens/Settings',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'settings'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
export const Appearance:StoryObj<typeof meta>={};
