import type { ReactNode } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { useSheetDrag } from './sheetDrag';

/**
 * The top of a bottom sheet on phones: a grab handle you can drag down to close it,
 * a Close button, and room on the left for a way back to the sheet's first step.
 * Hidden where the sheet is a popover or a dialog, apart from that way back. Put it
 * first inside the element marked `data-sheet`.
 */
export function SheetBar({ onClose, back }: {
  onClose: () => void;
  /** A button back to the sheet's first step. */
  back?: ReactNode;
}) {
  const drag = useSheetDrag(onClose);
  return (
    <div className={`${styles.sheetBar} ${back ? styles.sheetBarBack : ''}`} {...drag}>
      <span className={styles.sheetHandle} aria-hidden="true" />
      {back}
      <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
    </div>
  );
}
