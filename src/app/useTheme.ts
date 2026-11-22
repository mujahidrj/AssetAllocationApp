import { useEffect, useState } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

export const THEME_KEY = 'assetAllocation.theme';

function readMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    // ignore
  }
  return 'auto';
}

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/** Light, dark, or matching the device. The choice is remembered on this device. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const [deviceDark, setDeviceDark] = useState(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setDeviceDark(e.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'auto' ? (deviceDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode, resolved]);

  return { mode, setMode, resolved };
}
