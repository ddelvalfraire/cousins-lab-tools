import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { localStorageColorSchemeManager, MantineProvider, useComputedColorScheme, useMantineColorScheme, type MantineColorScheme, type MantineProviderProps } from '@mantine/core';
import { switchColorScheme, type RevealOrigin } from './colorSchemeTransition';

export type AppearancePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';
/** Where a reveal starts: a point in viewport pixels, or an element whose centre is used. */
export type AppearanceOrigin = RevealOrigin | Element;

export interface Appearance {
  preference: AppearancePreference;
  /** The scheme on screen. */
  scheme: ColorScheme;
  setPreference: (preference: AppearancePreference, origin?: AppearanceOrigin) => void;
  /** Switches to the opposite of the scheme on screen. */
  toggle: (origin?: AppearanceOrigin) => void;
}

export const STORAGE_KEY = 'dvdash-color-scheme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** A pointer press this recent is taken to be what asked for the change. */
const POINTER_ORIGIN_MS = 1500;

const toMantine = (preference: AppearancePreference): MantineColorScheme => preference === 'system' ? 'auto' : preference;
const fromMantine = (scheme: MantineColorScheme): AppearancePreference => scheme === 'auto' ? 'system' : scheme;
const systemScheme = (): ColorScheme => typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
const centreOf = (element: Element): RevealOrigin => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

const AppearanceContext = createContext<Appearance | null>(null);

export interface AppearanceProviderProps extends Omit<MantineProviderProps, 'forceColorScheme' | 'defaultColorScheme' | 'colorSchemeManager'> {
  /** Controlled preference. Without it the provider keeps its own and saves it in local storage. */
  preference?: AppearancePreference;
  onPreferenceChange?: (preference: AppearancePreference) => void;
  /** Uncontrolled starting preference when nothing is saved. */
  defaultPreference?: AppearancePreference;
  children?: ReactNode;
}

/**
 * Owns the colour scheme: the saved or controlled preference, the system scheme and the scheme on screen. Every change,
 * whether a control, another window or the system, reaches the screen through one effect that runs the reveal.
 * Mantine only ever sees the result, through forceColorScheme, because its own "auto" mode repaints outside React.
 */
export function AppearanceProvider({ preference: controlled, onPreferenceChange, defaultPreference = 'system', children, ...mantine }: AppearanceProviderProps) {
  const [manager] = useState(() => localStorageColorSchemeManager({ key: STORAGE_KEY }));
  const [stored, setStored] = useState(() => fromMantine(manager.get(toMantine(defaultPreference))));
  const [os, setOs] = useState(systemScheme);
  const preference = controlled ?? stored;
  const target: ColorScheme = preference === 'system' ? os : preference;
  const [applied, setApplied] = useState(target);
  const latest = useRef({ target, preference, os, controlled: controlled !== undefined, onPreferenceChange });
  latest.current = { target, preference, os, controlled: controlled !== undefined, onPreferenceChange };
  const pending = useRef<{ target: ColorScheme; origin: RevealOrigin | null } | null>(null);
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const inEffect = useRef(false);

  useEffect(() => {
    if (controlled !== undefined) return;
    manager.subscribe(value => setStored(fromMantine(value)));
    return manager.unsubscribe;
  }, [manager, controlled]);

  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;
    const change = (event: MediaQueryListEvent) => setOs(event.matches ? 'dark' : 'light');
    setOs(media.matches ? 'dark' : 'light');
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const press = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY, at: performance.now() }; };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, []);

  useLayoutEffect(() => {
    if (target === applied) return;
    const origin = pending.current?.target === target ? pending.current.origin : null;
    pending.current = null;
    // On the instant path apply runs inside this effect, where flushSync is not allowed; the browser calls it later.
    const apply = () => {
      const next = latest.current.target;
      if (inEffect.current) setApplied(next); else flushSync(() => setApplied(next));
    };
    inEffect.current = true;
    try { switchColorScheme(apply, { origin }); } finally { inEffect.current = false; }
  }, [target, applied]);

  useLayoutEffect(() => { document.documentElement.setAttribute('data-mantine-color-scheme', applied); }, [applied]);

  const setPreference = useCallback((next: AppearancePreference, from?: AppearanceOrigin) => {
    const now = latest.current, recent = pointer.current && performance.now() - pointer.current.at < POINTER_ORIGIN_MS ? pointer.current : null;
    const active = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    const origin = from instanceof Element ? centreOf(from) : from ?? (recent ? { x: recent.x, y: recent.y } : active ? centreOf(active) : null);
    pending.current = { target: next === 'system' ? now.os : next, origin };
    if (now.controlled) { now.onPreferenceChange?.(next); return; }
    manager.set(toMantine(next));
    setStored(next);
    now.onPreferenceChange?.(next);
  }, [manager]);

  const value = useMemo<Appearance>(() => ({
    preference, scheme: applied, setPreference,
    toggle: origin => setPreference(applied === 'dark' ? 'light' : 'dark', origin),
  }), [preference, applied, setPreference]);

  return <AppearanceContext.Provider value={value}><MantineProvider {...mantine} forceColorScheme={applied}>{children}</MantineProvider></AppearanceContext.Provider>;
}

/** The app's colour scheme. Outside an AppearanceProvider it falls back to Mantine's own scheme, without the reveal. */
export function useAppearance(): Appearance {
  const context = useContext(AppearanceContext);
  const computed = useComputedColorScheme('light'), { colorScheme, setColorScheme } = useMantineColorScheme();
  const fallback = useMemo<Appearance>(() => ({
    preference: fromMantine(colorScheme), scheme: computed,
    setPreference: preference => setColorScheme(toMantine(preference)),
    toggle: () => setColorScheme(computed === 'dark' ? 'light' : 'dark'),
  }), [colorScheme, computed, setColorScheme]);
  return context ?? fallback;
}
