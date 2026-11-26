import { useEffect, useId, useRef } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { HowToExport } from './ImportDialog';
import { SheetBar } from './SheetBar';
import { useSheetDrag } from './sheetDrag';
import { useSheetHistory } from './sheetHistory';

/**
 * Before the file picker: which brokers work and where their positions download is,
 * so people know which file to pick, or that they need to go and get one first (on
 * a phone, usually from a computer), or can type what they own instead.
 */
export function ImportGuide({ portfolioName, signedIn, onChoose, onEnterByHand, onClose }: {
  portfolioName: string;
  signedIn: boolean;
  /** Opens the file picker. Runs inside the tap, so phones allow it. The guide stays until a file is picked. */
  onChoose: () => void;
  /** Closes the guide and puts the cursor in the first "you own". Runs inside the tap, for the keyboard. */
  onEnterByHand: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(onClose);
  useSheetHistory('import-guide', 1, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.dialogBackdrop} data-sheet-backdrop onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1} data-sheet>
        <SheetBar onClose={onClose} />
        <div className={styles.dialogHead} {...drag}>
          <div className={styles.titleBlock}>
            <h2 className={styles.cardTitle} id={titleId}>Import holdings into {portfolioName}</h2>
            <span className={styles.cardSub}>From Fidelity, Schwab or Vanguard</span>
          </div>
          <button type="button" className={`${styles.remove} ${styles.pushRight} ${styles.dialogClose}`} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className={styles.dialogBody}>
          <p>
            You need your broker's positions file (CSV).
            <span className={styles.phoneLabel}>
              {' '}It downloads from their website, so this is easiest on a computer.
              {!signedIn && ' Sign in on both to see it here.'}
            </span>
          </p>
          <HowToExport />
          <p className={styles.importNote}>Nothing changes until you've checked what the file holds.</p>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.primary} onClick={onChoose}>Choose file</button>
            <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onEnterByHand}>Enter by hand</button>
          </div>
        </div>
      </div>
    </div>
  );
}
