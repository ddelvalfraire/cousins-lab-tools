import type { Meta, StoryObj } from '@storybook/react-vite';
import { DVDashWorkspace } from './Workspace';
import { renderScreen } from './screen-story';
const meta={title:'Screens/Prepare experiment',component:DVDashWorkspace,render:renderScreen,parameters:{layout:'fullscreen',previewWidth:'viewport'},args:{initialPage:'prepare',initialPreset:'gas'}} satisfies Meta<typeof DVDashWorkspace>;
export default meta;
type Story=StoryObj<typeof meta>;
export const SourcesAndTiming:Story={};
export const MissingSource:Story={args:{unavailable:true}};
