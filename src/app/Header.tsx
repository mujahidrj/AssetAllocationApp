import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import styles from './Calculator.module.css';
import { AutoIcon, MoonIcon, PersonIcon, ShareIcon, SunIcon } from './icons';
import type { ThemeMode } from './useTheme';
import type { SaveState } from './usePortfolios';

const themeNames: Record<ThemeMode, string> = { auto: 'Match device', light: 'Light', dark: 'Dark' };
const nextTheme: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };

const ThemeIcon = ({ mode }: { mode: ThemeMode }) =>
  mode === 'auto' ? <AutoIcon /> : mode === 'light' ? <SunIcon /> : <MoonIcon />;

interface HeaderProps {
  user: User | null;
  savedTo: 'device' | 'account';
  saveState: SaveState;
  /** Signed in but the saved portfolios couldn't be read. */
  loadFailed?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  theme: ThemeMode;
  onTheme: (mode: ThemeMode) => void;
  /** Copies the share link; resolves to the link if copying failed. */
  onShare: () => Promise<string | null>;
  canShare: boolean;
}

export function Header({ user, savedTo, saveState, loadFailed, onSignIn, onSignOut, theme, onTheme, onShare, canShare }: HeaderProps) {
  const [shared, setShared] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  const share = async () => {
    const failedLink = await onShare();
    if (failedLink) {
      setFallback(failedLink);
      return;
    }
    setFallback(null);
    setShared(true);
    later(() => setShared(false), 1600);
  };

  const cycleTheme = () => {
    onTheme(nextTheme[theme]);
    setFlash(true);
    later(() => setFlash(false), 1200);
  };

  const savedText =
    savedTo === 'device' ? 'Saved on this device'
      : saveState === 'loading' ? 'Loading…'
      : saveState === 'saving' ? 'Saving…'
      : loadFailed ? 'Not synced'
      : saveState === 'error' ? 'Not saved'
      : 'Saved to your account';

  const firstName = user?.displayName?.split(' ')[0] ?? user?.email ?? 'Signed in';

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <span className={styles.wordmark}><span className={styles.wordmarkLead}>Asset </span>Allocation Calculator</span>
        <span className={`${styles.saved} ${saveState === 'error' ? styles.savedError : ''}`} role="status">{savedText}</span>

        <button type="button" className={`${styles.ghost} ${styles.desktopOnly}`} onClick={share} disabled={!canShare}>
          {shared ? 'Link copied' : 'Share link'}
        </button>
        <button type="button" className={`${styles.iconButton} ${styles.phoneOnly}`} onClick={share} disabled={!canShare} aria-label={shared ? 'Link copied' : 'Share link'}>
          <ShareIcon />
        </button>

        {user ? (
          <>
            <span className={`${styles.account} ${styles.desktopOnly}`}>
              {firstName}
              <button type="button" className={styles.ghost} onClick={onSignOut}>Sign out</button>
            </span>
            <button type="button" className={`${styles.iconButton} ${styles.phoneOnly}`} onClick={onSignOut} aria-label={`Signed in as ${firstName}. Sign out`}>
              <PersonIcon />
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`${styles.ghost} ${styles.desktopOnly}`} onClick={onSignIn}>Sign in to sync</button>
            <button type="button" className={`${styles.iconButton} ${styles.phoneOnly}`} onClick={onSignIn} aria-label="Sign in with Google to sync">
              <PersonIcon />
            </button>
          </>
        )}

        <div className={styles.themeGroup} role="group" aria-label="Theme">
          {(['auto', 'light', 'dark'] as const).map(m => (
            <button
              key={m}
              type="button"
              title={themeNames[m]}
              aria-label={themeNames[m]}
              aria-pressed={theme === m}
              className={`${styles.themeSeg} ${theme === m ? styles.themeSegOn : ''}`}
              onClick={() => onTheme(m)}
            >
              <ThemeIcon mode={m} />
            </button>
          ))}
        </div>
        <span className={styles.themeCycle}>
          {flash && <span className={styles.flash}>{theme === 'auto' ? 'Match phone' : themeNames[theme]}</span>}
          <button type="button" className={styles.iconButton} onClick={cycleTheme} aria-label={`Theme: ${themeNames[theme]}`}>
            <ThemeIcon mode={theme} />
          </button>
        </span>
      </div>
      {fallback && (
        <div className={styles.shareFallback}>
          Copy this link:
          <input readOnly value={fallback} aria-label="Share link" onFocus={e => e.currentTarget.select()} />
        </div>
      )}
    </header>
  );
}
