import { DVDashWorkspace, type WorkspaceProps } from './Workspace';

// The appearance global reaches screens through the preview's AppearanceProvider; screens never import Storybook APIs.
export function renderScreen(args:WorkspaceProps){
  return <DVDashWorkspace {...args}/>;
}
