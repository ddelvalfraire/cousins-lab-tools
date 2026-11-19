import type { Preview } from '@storybook/react-vite';
import { type ReactNode, useState } from 'react';
import { useGlobals } from 'storybook/preview-api';
import { configure } from 'storybook/test';
import '@mantine/core/styles.css';
import 'uplot/dist/uPlot.min.css';
import {
  type AppearancePreference,
  AppearanceProvider,
} from '../src/ui/appearance';
import { isTextSize, type TextSize } from '../src/ui/textSize';
import { dvdashTheme } from '../src/ui/theme';
import '../src/ui/dvdash.css';
import '../src/ui/screens/screens.css';
import { StoryFrame } from './StoryFrame';
import { settleMotion } from './settleMotion';
import './preview.css';

/** Queries give up after one second by default, which loaded machines miss while an animation settles. */
configure({ asyncUtilTimeout: 5000 });

const asPreference = (value: unknown): AppearancePreference =>
  value === 'dark' || value === 'system' ? value : 'light';
const asTextSize = (value: unknown): TextSize =>
  isTextSize(value) ? value : 'default';

/** A value a global drives, which a story may change and write back. */
function useGlobalCopy<T>(global: T) {
  const [value, setValue] = useState(global),
    [seen, setSeen] = useState(global);
  if (seen !== global) {
    setSeen(global);
    setValue(global);
  }
  return [value, setValue] as const;
}

/**
 * The appearance and textSize globals drive the preference and the text size, and changes made in a story write them
 * back. The story keeps its own copy too, because portable story tests have no manager to answer a globals update.
 */
function StoryAppearance({
  global,
  textSize: globalTextSize,
  onChange,
  children,
}: {
  global: AppearancePreference;
  textSize: TextSize;
  onChange: (globals: {
    appearance?: AppearancePreference;
    textSize?: TextSize;
  }) => void;
  children: ReactNode;
}) {
  const [preference, setPreference] = useGlobalCopy(global),
    [textSize, setTextSize] = useGlobalCopy(globalTextSize);
  return (
    <AppearanceProvider
      theme={dvdashTheme}
      preference={preference}
      onPreferenceChange={(next) => {
        setPreference(next);
        onChange({ appearance: next });
      }}
      textSize={textSize}
      onTextSizeChange={(next) => {
        setTextSize(next);
        onChange({ textSize: next });
      }}
    >
      {children}
    </AppearanceProvider>
  );
}

const preview: Preview = {
  /**
   * Runs before the accessibility scan. Storybook pauses CSS animations at their end for it, but Motion.tsx fades with
   * the Web Animations API, which that pause does not reach, so the scan would read colours mid fade.
   */
  afterEach: async () => {
    await settleMotion();
  },
  initialGlobals: { appearance: 'light', textSize: 'default' },
  globalTypes: {
    appearance: {
      description: 'Application appearance',
      toolbar: {
        icon: 'circlehollow',
        items: ['light', 'dark', 'system'],
        dynamicTitle: true,
      },
    },
    textSize: {
      description: 'Text size setting',
      toolbar: {
        icon: 'paragraph',
        items: ['default', 'large', 'larger', 'largest'],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const [, updateGlobals] = useGlobals();
      return (
        <StoryAppearance
          global={asPreference(context.globals.appearance)}
          textSize={asTextSize(context.globals.textSize)}
          onChange={updateGlobals}
        >
          <StoryFrame width={context.parameters.previewWidth}>
            <div className="dvdash">
              <Story />
            </div>
          </StoryFrame>
        </StoryAppearance>
      );
    },
  ],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    a11y: { test: 'error' },
    options: {
      storySort: { order: ['Components', 'Screens', 'Foundations', 'Gallery'] },
    },
  },
};
export default preview;
