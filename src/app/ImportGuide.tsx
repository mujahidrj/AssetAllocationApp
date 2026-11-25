import { useEffect, useId, useRef } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { HowToExport } from './ImportDialog';
import { SheetBar } from './SheetBar';
import { useSheetHistory } from './sheetHistory';

/**
 * Before the file picker: which brokers work and where their positions download is,
 * so people know which file to pick (or that they need to go and get one first).
 */
export function ImportGuide({ portfolioName, onChoose, onClose }: {
  portfolioName: string;
  /** Opens the file picker. Runs inside the tap, so phones allow it. */
  onChoose: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useSheetHistory('import-guide', 1, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.dialogBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1} data-sheet>
        <SheetBar onClose={onClose} close={false} />
        <div className={styles.dialogHead}>
          <div className={styles.titleBlock}>
            <h2 className={styles.cardTitle} id={titleId}>Import from your broker</h2>
            <span className={styles.cardSub}>Into {portfolioName}</span>
          </div>
          <button type="button" className={`${styles.remove} ${styles.pushRight}`} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className={styles.dialogBody}>
          <p>Download your positions as a CSV file, then choose it here. Fidelity, Schwab and Vanguard files work as they are.</p>
          <HowToExport />
          <p className={styles.importNote}>Nothing changes until you've checked what the file holds.</p>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.primary} onClick={onChoose}>Choose file</button>
            <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
