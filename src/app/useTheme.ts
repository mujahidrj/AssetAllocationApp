import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
/** What the person picked: follow the device, or always light or dark. */
export type ThemePref = 'device' | ThemeMode;

export const THEME_KEY = 'assetAllocation.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The saved choice, or 'device' when nothing is saved. */
function savedPref(): ThemePref {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'device';
}

const deviceQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null);
const deviceMode = (): ThemeMode => (deviceQuery()?.matches ? 'dark' : 'light');

/** Light, dark, or whatever the device uses; a light or dark choice is remembered on this device. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(savedPref);
  const [device, setDevice] = useState<ThemeMode>(deviceMode);
  const mode: ThemeMode = pref === 'device' ? device : pref;

  // Follow the device while it's the choice (e.g. it switches to dark at sunset)
  useEffect(() => {
    if (pref !== 'device') return;
    const query = deviceQuery();
    if (!query) return;
    setDevice(query.matches ? 'dark' : 'light');
    const onChange = (e: MediaQueryListEvent) => setDevice(e.matches ? 'dark' : 'light');
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const setPref = (next: ThemePref) => {
    setPrefState(next);
    try {
      if (next === 'device') window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  };

  return { mode, pref, setPref };
}
