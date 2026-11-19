import {
  isMantineColorScheme,
  localStorageColorSchemeManager,
  type MantineColorScheme,
  type MantineColorSchemeManager,
  MantineProvider,
  type MantineProviderProps,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useColorScheme, useWindowEvent } from '@mantine/hooks';
import { MotionConfig } from 'motion/react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RevealOrigin } from './colorSchemeTransition';
import {
  applyTextSize,
  isTextSize,
  readTextSize,
  TEXT_SIZE_KEY,
  type TextSize,
  writeTextSize,
} from './textSize';
import { useColorSchemeReveal } from './useColorSchemeReveal';

export type AppearancePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';
/** Where a reveal starts: a point in viewport pixels, or an element whose centre is used. */
export type AppearanceOrigin = RevealOrigin | Element;

export interface Appearance {
  preference: AppearancePreference;
  /** The scheme on screen. */
  scheme: ColorScheme;
  setPreference: (
    preference: AppearancePreference,
    origin?: AppearanceOrigin,
  ) => void;
  /** Switches to the opposite of the scheme on screen. */
  toggle: (origin?: AppearanceOrigin) => void;
  /** The Text size setting, applied as the root font size. */
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
}

export const STORAGE_KEY = 'dvdash-color-scheme';
/** A pointer press this recent is taken to be what asked for the change. */
const POINTER_ORIGIN_MS = 1500;

const toMantine = (preference: AppearancePreference): MantineColorScheme =>
  preference === 'system' ? 'auto' : preference;
const fromMantine = (scheme: MantineColorScheme): AppearancePreference =>
  scheme === 'auto' ? 'system' : scheme;
const centreOf = (element: Element): RevealOrigin => {
  const r = element.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const ignore = () => {};
/**
 * Tells Mantine the scheme on screen and saves nothing. Mantine writes data-mantine-color-scheme from the manager when it
 * mounts, before the first paint, so the saved scheme is on the root from the first frame.
 */
const showingScheme = (scheme: ColorScheme): MantineColorSchemeManager => ({
  get: () => scheme,
  set: ignore,
  subscribe: ignore,
  unsubscribe: ignore,
  clear: ignore,
});

const AppearanceContext = createContext<Appearance | null>(null);

export interface AppearanceProviderProps
  extends Omit<
    MantineProviderProps,
    'forceColorScheme' | 'defaultColorScheme' | 'colorSchemeManager'
  > {
  /** Controlled preference. Without it the provider keeps its own and saves it in local storage. */
  preference?: AppearancePreference;
  onPreferenceChange?: (preference: AppearancePreference) => void;
  /** Uncontrolled starting preference when nothing is saved. */
  defaultPreference?: AppearancePreference;
  /** Controlled text size. Without it the provider keeps its own and saves it in local storage. */
  textSize?: TextSize;
  onTextSizeChange?: (size: TextSize) => void;
  children?: ReactNode;
}

/**
 * Owns the colour scheme: the saved or controlled preference, the system scheme and the scheme on screen. Every change,
 * whether a control, a parent, another window or the system, reaches the screen through one reveal
 * (useColorSchemeReveal.ts).
 * Mantine only ever sees the result, through forceColorScheme, because its own "auto" mode repaints outside React.

 * It also owns the text size, which it writes to the root element as data-dv-text-size (textSize.ts).
 */
export function AppearanceProvider({
  preference: controlled,
  onPreferenceChange,
  defaultPreference = 'system',
  textSize: controlledTextSize,
  onTextSizeChange,
  children,
  ...mantine
}: AppearanceProviderProps) {
  const [manager] = useState(() =>
    localStorageColorSchemeManager({ key: STORAGE_KEY }),
  );
  const [stored, setStored] = useState(() =>
    fromMantine(manager.get(toMantine(defaultPreference))),
  );
  const os = useColorScheme(undefined, { getInitialValueInEffect: false });
  const preference = controlled ?? stored;
  const target: ColorScheme = preference === 'system' ? os : preference;
  const { applied, revealFrom, revealOnCommit } = useColorSchemeReveal(target);
  const shownToMantine = useMemo(() => showingScheme(applied), [applied]);
  const latest = useRef({
    preference,
    os,
    controlled: controlled !== undefined,
    onPreferenceChange,
  });
  latest.current = {
    preference,
    os,
    controlled: controlled !== undefined,
    onPreferenceChange,
  };
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const [storedTextSize, setStoredTextSize] = useState(() => readTextSize());
  const textSize = controlledTextSize ?? storedTextSize;
  const controlsTextSize = controlledTextSize !== undefined;

  // A parent's scheme or size can arrive as a prop, which no handler here sees. This element's ref callback changes with
  // both, and React calls it after the commit and before paint, so the saved size is on the root from the first frame.
  const followAppearance = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      applyTextSize(textSize);
      revealOnCommit();
    },
    [textSize, revealOnCommit],
  );

  const recordPress = (event: PointerEvent) => {
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
    };
  };
  useWindowEvent('pointerdown', recordPress, true);

  /** Changes saved by another window. */
  const followStorage = (event: StorageEvent) => {
    if (
      event.key === STORAGE_KEY &&
      controlled === undefined &&
      event.storageArea === window.localStorage &&
      isMantineColorScheme(event.newValue)
    )
      setStored(fromMantine(event.newValue));
    if (event.key === TEXT_SIZE_KEY && !controlsTextSize) {
      const next = isTextSize(event.newValue) ? event.newValue : 'default';
      setStoredTextSize(next);
    }
  };
  useWindowEvent('storage', followStorage);

  const textSizeChange = useRef(onTextSizeChange);
  textSizeChange.current = onTextSizeChange;
  const setTextSize = useCallback(
    (next: TextSize) => {
      if (!controlsTextSize) {
        writeTextSize(next);
        setStoredTextSize(next);
      }
      textSizeChange.current?.(next);
    },
    [controlsTextSize],
  );

  const setPreference = useCallback(
    (next: AppearancePreference, from?: AppearanceOrigin) => {
      const now = latest.current,
        recent =
          pointer.current &&
          performance.now() - pointer.current.at < POINTER_ORIGIN_MS
            ? pointer.current
            : null;
      const active =
        document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
      const origin =
        from instanceof Element
          ? centreOf(from)
          : (from ??
            (recent
              ? { x: recent.x, y: recent.y }
              : active
                ? centreOf(active)
                : null));
      revealFrom(next === 'system' ? now.os : next, origin);
      if (now.controlled) {
        now.onPreferenceChange?.(next);
        return;
      }
      manager.set(toMantine(next));
      setStored(next);
      now.onPreferenceChange?.(next);
    },
    [manager, revealFrom],
  );

  const value = useMemo<Appearance>(
    () => ({
      preference,
      scheme: applied,
      setPreference,
      toggle: (origin) =>
        setPreference(applied === 'dark' ? 'light' : 'dark', origin),
      textSize,
      setTextSize,
    }),
    [preference, applied, setPreference, textSize, setTextSize],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <MantineProvider
        {...mantine}
        colorSchemeManager={shownToMantine}
        forceColorScheme={applied}
      >
        <MotionConfig reducedMotion="user">
          <div style={{ display: 'contents' }} ref={followAppearance}>
            {children}
          </div>
        </MotionConfig>
      </MantineProvider>
    </AppearanceContext.Provider>
  );
}

/**
 * The app's colour scheme and text size. Outside an AppearanceProvider it falls back to Mantine's own scheme, without
 * the reveal, and to the Default text size.
 */
export function useAppearance(): Appearance {
  const context = useContext(AppearanceContext);
  const computed = useComputedColorScheme('light'),
    { colorScheme, setColorScheme } = useMantineColorScheme();
  const fallback = useMemo<Appearance>(
    () => ({
      preference: fromMantine(colorScheme),
      scheme: computed,
      setPreference: (preference) => setColorScheme(toMantine(preference)),
      toggle: () => setColorScheme(computed === 'dark' ? 'light' : 'dark'),
      textSize: 'default',
      setTextSize: () => {},
    }),
    [colorScheme, computed, setColorScheme],
  );
  return context ?? fallback;
}
