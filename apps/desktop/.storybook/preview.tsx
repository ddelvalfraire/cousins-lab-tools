import { useState, type ReactNode } from 'react';
import type { Preview } from '@storybook/react-vite';
import { useGlobals } from 'storybook/preview-api';
import '@mantine/core/styles.css';
import 'uplot/dist/uPlot.min.css';
import { dvdashTheme } from '../src/ui/theme';
import { AppearanceProvider, type AppearancePreference } from '../src/ui/appearance';
import '../src/ui/dvdash.css';
import '../src/ui/screens/screens.css';
import { StoryFrame } from './StoryFrame';
import './preview.css';

const asPreference = (value: unknown): AppearancePreference => value === 'dark' || value === 'system' ? value : 'light';

/**
 * The appearance global drives the preference, and changes made in a story write it back. The story keeps its own copy
 * too, because portable story tests have no manager to answer a globals update.
 */
function StoryAppearance({ global, onChange, children }: { global: AppearancePreference; onChange: (preference: AppearancePreference) => void; children: ReactNode }) {
  const [preference, setPreference] = useState(global), [seen, setSeen] = useState(global);
  if (seen !== global) { setSeen(global); setPreference(global); }
  return <AppearanceProvider theme={dvdashTheme} preference={preference} onPreferenceChange={next => { setPreference(next); onChange(next); }}>{children}</AppearanceProvider>;
}

const preview: Preview = {
  initialGlobals: { appearance: 'light' },
  globalTypes: { appearance: { description: 'Application appearance', toolbar: { icon: 'circlehollow', items: ['light', 'dark', 'system'], dynamicTitle: true } } },
  decorators: [(Story, context) => {
    const [, updateGlobals] = useGlobals();
    return <StoryAppearance global={asPreference(context.globals.appearance)} onChange={appearance => updateGlobals({ appearance })}>
      <StoryFrame width={context.parameters.previewWidth}><div className="dvdash"><Story /></div></StoryFrame>
    </StoryAppearance>;
  }],
  parameters: {
    layout: 'padded', controls: { expanded: true }, a11y: { test: 'error' },
    options: { storySort: { order: ['Components', 'Screens', 'Foundations', 'Gallery'] } },
  },
};
export default preview;
