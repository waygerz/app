'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** The seven ROYGBIV hues a user can assign to the primary/accent slots. */
export type Hue =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet';

/**
 * Single source of truth for the pickable hues. `dot` is a literal Tailwind
 * class (kept literal so the scanner emits it) used to paint the swatch button.
 */
export const HUES: { key: Hue; label: string; dot: string }[] = [
  { key: 'red', label: 'Red', dot: 'bg-red-500' },
  { key: 'orange', label: 'Orange', dot: 'bg-orange-500' },
  { key: 'yellow', label: 'Yellow', dot: 'bg-yellow-400' },
  { key: 'green', label: 'Green', dot: 'bg-green-500' },
  { key: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { key: 'indigo', label: 'Indigo', dot: 'bg-indigo-500' },
  { key: 'violet', label: 'Violet', dot: 'bg-violet-500' },
];

const HUE_KEYS = new Set<string>(HUES.map((h) => h.key));
const PRIMARY_KEY = 'waygerz-primary';
const ACCENT_KEY = 'waygerz-accent';
export const DEFAULT_PRIMARY: Hue = 'violet';
export const DEFAULT_ACCENT: Hue = 'green';

type ColorThemeValue = {
  primary: Hue;
  accent: Hue;
  setPrimary: (hue: Hue) => void;
  setAccent: (hue: Hue) => void;
};

const ColorThemeContext = createContext<ColorThemeValue | null>(null);

function coerce(value: string | null | undefined, fallback: Hue): Hue {
  return value && HUE_KEYS.has(value) ? (value as Hue) : fallback;
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  // SSR renders the defaults; the blocking script (see colorThemeScript) has
  // already set the real hue on <html> before paint, so there's no flash.
  const [primary, setPrimaryState] = useState<Hue>(DEFAULT_PRIMARY);
  const [accent, setAccentState] = useState<Hue>(DEFAULT_ACCENT);

  useEffect(() => {
    const el = document.documentElement;
    setPrimaryState(coerce(el.dataset.primary, DEFAULT_PRIMARY));
    setAccentState(coerce(el.dataset.accent, DEFAULT_ACCENT));
  }, []);

  const setPrimary = useCallback((hue: Hue) => {
    setPrimaryState(hue);
    document.documentElement.dataset.primary = hue;
    try {
      localStorage.setItem(PRIMARY_KEY, hue);
    } catch {
      // storage unavailable (private mode / disabled) — selection still applies
      // for this session via the dataset above.
    }
  }, []);

  const setAccent = useCallback((hue: Hue) => {
    setAccentState(hue);
    document.documentElement.dataset.accent = hue;
    try {
      localStorage.setItem(ACCENT_KEY, hue);
    } catch {
      /* see setPrimary */
    }
  }, []);

  return (
    <ColorThemeContext.Provider value={{ primary, accent, setPrimary, setAccent }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme(): ColorThemeValue {
  const ctx = useContext(ColorThemeContext);
  if (!ctx) {
    throw new Error('useColorTheme must be used within a ColorThemeProvider');
  }
  return ctx;
}

/**
 * Runs synchronously in <head> before first paint to stamp the persisted hues
 * onto <html>, so the ROYGBIV CSS applies with no flash of the default theme.
 */
export const colorThemeScript = `(function(){try{var e=document.documentElement,g=function(k,d){var v=localStorage.getItem(k);return v==='red'||v==='orange'||v==='yellow'||v==='green'||v==='blue'||v==='indigo'||v==='violet'?v:d};e.dataset.primary=g('${PRIMARY_KEY}','${DEFAULT_PRIMARY}');e.dataset.accent=g('${ACCENT_KEY}','${DEFAULT_ACCENT}');}catch(_){}})();`;
