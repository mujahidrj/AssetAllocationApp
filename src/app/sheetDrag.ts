import { useRef, type TouchEvent } from 'react';

/** Dragged at least this far down (px), or flicked, a sheet closes. */
const CLOSE_DISTANCE = 90;
const FLICK_DISTANCE = 30;
const FLICK_SPEED = 0.6; // px per ms
const SLIDE_MS = 180;
/** Where sheets are bottom sheets (Calculator.module.css); wider, they're popovers and dialogs. */
const SHEETS = '(max-width: 720px)';

/** The dimmed page behind a sheet: its parent, or the element just before it. */
function backdropOf(sheet: HTMLElement): HTMLElement | null {
  const parent = sheet.parentElement;
  if (parent?.hasAttribute('data-sheet-backdrop')) return parent;
  const before = sheet.previousElementSibling;
  return before instanceof HTMLElement && before.hasAttribute('data-sheet-backdrop') ? before : null;
}

/**
 * Dragging a sheet down by whatever this is spread on (the grab bar, a dialog's title):
 * the sheet follows the finger and the page behind it brightens. Let go far enough
 * down, or flick, and it slides away and closes; otherwise it springs back.
 */
export function useSheetDrag(onClose: () => void) {
  const drag = useRef<{ y: number; t: number; dy: number; sheet: HTMLElement } | null>(null);

  const reset = (sheet: HTMLElement) => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    backdropOf(sheet)?.style.removeProperty('--drag');
  };

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const sheet = e.currentTarget.closest<HTMLElement>('[data-sheet]');
    // Only bottom sheets (phones), and not one scrolled down: that's being read, not dragged
    if (!sheet || sheet.scrollTop > 0 || !window.matchMedia?.(SHEETS).matches) { drag.current = null; return; }
    drag.current = { y: e.touches[0].clientY, t: e.timeStamp, dy: 0, sheet };
    sheet.style.transition = 'none';
  };
  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = Math.max(0, e.touches[0].clientY - d.y);
    d.dy = dy;
    d.sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    backdropOf(d.sheet)?.style.setProperty('--drag', String(Math.min(1, dy / Math.max(1, d.sheet.offsetHeight))));
  };
  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const speed = d.dy / Math.max(1, e.timeStamp - d.t);
    if (!(d.dy > CLOSE_DISTANCE || (d.dy > FLICK_DISTANCE && speed > FLICK_SPEED))) { reset(d.sheet); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    // Slide the rest of the way, then close
    d.sheet.style.transition = `transform ${SLIDE_MS}ms ease-in`;
    d.sheet.style.transform = 'translateY(100%)';
    backdropOf(d.sheet)?.style.setProperty('--drag', '1');
    setTimeout(onClose, SLIDE_MS);
  };
  const onTouchCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d) reset(d.sheet);
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
