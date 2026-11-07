import type { Preview } from '@storybook/react-vite';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import 'uplot/dist/uPlot.min.css';
import { dvdashTheme } from '../src/ui/theme';
import '../src/ui/dvdash.css';
import { StoryFrame } from './StoryFrame';
import './preview.css';
const preview: Preview = {
  initialGlobals: { appearance: 'light' },
  globalTypes: { appearance: { description: 'Application appearance', toolbar: { icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true } } },
  decorators: [(Story, context) => <MantineProvider theme={dvdashTheme} forceColorScheme={context.globals.appearance === 'dark' ? 'dark' : 'light'}><StoryFrame width={context.parameters.previewWidth}><div className="dvdash"><Story /></div></StoryFrame></MantineProvider>],
  parameters: {
    layout: 'padded', controls: { expanded: true }, a11y: { test: 'error' },
    options: { storySort: { order: ['Components', 'Screens', 'Foundations', 'Gallery'] } },
  },
};
export default preview;
