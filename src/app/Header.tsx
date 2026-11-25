import { useEffect, useId, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import styles from './Calculator.module.css';
import { Appearance } from './Appearance';
import { CheckIcon } from './icons';
import type { ThemePref } from './useTheme';
import type { SaveState } from './usePortfolios';
import { SheetBar } from './SheetBar';
import { useSheetHistory } from './sheetHistory';

interface HeaderProps {
  user: User | null;
  savedTo: 'device' | 'account';
  saveState: SaveState;
  /** Signed in but the saved portfolios couldn't be read. */
  loadFailed?: boolean;
  /** Signed out and this browser won't store anything. */
  deviceSaveFailed?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  /** Tries the failed load or save again. */
  onRetry: () => void;
  themePref: ThemePref;
  onThemePref: (pref: ThemePref) => void;
}

type Tone = 'quiet' | 'ok' | 'error';

/**
 * The masthead: the name, lined up with the page, and on the right only where your
 * work is saved and one button for your account (or for signing in).
 */
export function Header({ user, savedTo, saveState, loadFailed, deviceSaveFailed, onSignIn, onSignOut, onRetry, themePref, onThemePref }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const status: { text: string; tone: Tone } =
    savedTo === 'device' ? (deviceSaveFailed ? { text: 'Not saved', tone: 'error' } : { text: 'Saved on this device', tone: 'quiet' })
      : saveState === 'loading' ? { text: 'Loading…', tone: 'quiet' }
      : saveState === 'saving' ? { text: 'Saving…', tone: 'quiet' }
      : loadFailed ? { text: "Couldn't load", tone: 'error' }
      : saveState === 'error' ? { text: "Couldn't save", tone: 'error' }
      : { text: 'Synced', tone: 'ok' };
  const problem = savedTo === 'account' && status.tone === 'error';

  const firstName = user?.displayName?.split(' ')[0] || user?.email || 'Signed in';
  const initial = firstName.charAt(0).toUpperCase();
  const photo = user?.photoURL && !photoFailed ? user.photoURL : null;
  useEffect(() => { setPhotoFailed(false); }, [user?.photoURL]);

  // Closes on a click outside or Escape; Escape puts focus back on the button
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  // On phones the panel is a sheet: Back closes it
  useSheetHistory('account', open ? 1 : 0, () => setOpen(false));

  const statusClass = `${styles.saved} ${status.tone === 'error' ? styles.savedError : ''}`;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <span className={styles.wordmark}>Asset Allocation Calculator</span>

        <span className={statusClass} role="status">
          {status.tone === 'ok' && <CheckIcon />}
          {status.text}
        </span>

        {user ? (
          <button
            ref={trigger}
            type="button"
            className={styles.avatarButton}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={open ? panelId : undefined}
            aria-label={`${firstName}: account, appearance and sign out${problem ? `. ${status.text}` : ''}`}
          >
            <span className={styles.avatar}>
              {photo
                ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
                : initial}
              {problem && <span className={styles.avatarDot} aria-hidden="true" />}
            </span>
          </button>
        ) : (
          <button
            ref={trigger}
            type="button"
            className={`${styles.ghost} ${styles.signIn}`}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={open ? panelId : undefined}
          >
            Sign in
          </button>
        )}

        {open && (
          <>
            <div className={styles.sheetBackdrop} aria-hidden="true" onClick={close} data-sheet-backdrop />
            <div
              ref={panel}
              id={panelId}
              role="dialog"
              aria-label={user ? 'Account' : 'Sign in'}
              tabIndex={-1}
              className={styles.accountPanel}
              data-sheet
              onBlur={e => {
                // Tabbing out of the panel closes it (clicks are handled above)
                const next = e.relatedTarget as Node | null;
                if (next && !panel.current?.contains(next) && !trigger.current?.contains(next)) close();
              }}
            >
              <SheetBar onClose={close} />
              {user ? (
                <>
                  <div className={styles.accountWho}>
                    <span className={styles.panelName}>{user.displayName || firstName}</span>
                    <span className={styles.accountSub}>{user.email || 'Signed in with Google'}</span>
                  </div>
                  <AccountStatus saveState={saveState} loadFailed={!!loadFailed} onRetry={onRetry} />
                  <div className={styles.accountRule} />
                  <div className={styles.panelRow}>
                    <span>Appearance</span>
                    <Appearance pref={themePref} onPref={onThemePref} />
                  </div>
                  <div className={styles.accountRule} />
                  <button type="button" className={styles.accountSignOut} onClick={() => { close(); onSignOut(); }}>
                    <span>Sign out</span>
                    <span className={styles.accountNote}>This device goes back to the portfolios it had before you signed in.</span>
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.accountWho}>
                    <span className={styles.panelName}>
                      {deviceSaveFailed ? "This browser isn't saving your portfolios" : 'Your portfolios are on this device'}
                    </span>
                    <span className={styles.accountSub}>Sign in to keep them in sync on your phone and computer.</span>
                    <button type="button" className={`${styles.primary} ${styles.accountSignIn}`} onClick={() => { close(); onSignIn(); }}>
                      Sign in with Google
                    </button>
                  </div>
                  <div className={styles.accountRule} />
                  <div className={styles.panelRow}>
                    <span>Appearance</span>
                    <Appearance pref={themePref} onPref={onThemePref} />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/** Where things stand with saving, inside the account panel (the only place phones show it). */
function AccountStatus({ saveState, loadFailed, onRetry }: { saveState: SaveState; loadFailed: boolean; onRetry: () => void }) {
  if (loadFailed || saveState === 'error') {
    return (
      <div className={`${styles.accountStatus} ${styles.accountStatusError}`}>
        <span>{loadFailed ? "Couldn't load your portfolios." : "Couldn't save your changes."}</span>
        <button type="button" className={styles.linkButton} onClick={onRetry}>Try again</button>
      </div>
    );
  }
  const text = saveState === 'loading' ? 'Loading your portfolios…'
    : saveState === 'saving' ? 'Saving…'
    : 'Your portfolios sync across your devices';
  return (
    <div className={styles.accountStatus}>
      {saveState === 'saved' && <CheckIcon />}
      <span>{text}</span>
    </div>
  );
}
