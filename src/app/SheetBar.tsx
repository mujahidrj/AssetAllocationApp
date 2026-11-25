import { useRef, type TouchEvent } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';

/** Dragged at least this far down (px), or flicked, a sheet closes. */
const CLOSE_DISTANCE = 90;
const FLICK_DISTANCE = 30;
const FLICK_SPEED = 0.6; // px per ms

/**
 * The top of a bottom sheet on phones: a grab handle you can drag down to close it,
 * and a Close button. Hidden where the sheet is a popover or a dialog instead. Put it
 * first inside the element marked `data-sheet`.
 */
export function SheetBar({ onClose, close = true }: {
  onClose: () => void;
  /** Leave the Close button out when the sheet has its own. */
  close?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const sheet = () => bar.current?.closest<HTMLElement>('[data-sheet]') ?? null;

  const start = (e: TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, t: e.timeStamp, dy: 0 };
    const s = sheet();
    if (s) s.style.transition = 'none';
  };
  const move = (e: TouchEvent) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    const s = sheet();
    if (s) s.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const end = (e: TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    const s = sheet();
    if (!d || !s) return;
    s.style.transition = '';
    const speed = d.dy / Math.max(1, e.timeStamp - d.t);
    if (d.dy > CLOSE_DISTANCE || (d.dy > FLICK_DISTANCE && speed > FLICK_SPEED)) onClose();
    else s.style.transform = '';
  };

  return (
    <div ref={bar} className={styles.sheetBar} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <span className={styles.sheetHandle} aria-hidden="true" />
      {close && (
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
