import { useGlobals } from 'storybook/preview-api';
import { DVDashWorkspace, type WorkspaceProps } from './Workspace';

// Theme controls are Storybook globals; screens never import Storybook APIs.
export function renderScreen(args:WorkspaceProps){
  const [{appearance},updateGlobals]=useGlobals();
  return <DVDashWorkspace {...args} onAppearanceChange={()=>updateGlobals({appearance:appearance==='dark'?'light':'dark'})}/>;
}
