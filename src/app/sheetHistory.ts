import { useEffect, useRef } from 'react';

/**
 * Back closes sheets. While a sheet is open it has its own history entry (one per
 * step, so the template list inside the portfolio sheet is a step of its own), and
 * the browser's Back button or the iPhone's edge swipe steps out of it instead of
 * leaving the page.
 *
 * Rules that keep the history honest:
 * - Closing any other way (Close, the dimmed page, Escape, picking something) takes
 *   off the entries the sheet pushed, so a later Back isn't wasted on them.
 * - We only ever go back over entries we pushed. Someone who arrived from a shared
 *   link and closes a sheet must never be sent off the site.
 * - The popstate that our own going-back causes is ignored.
 * - After a reload with a sheet's entry current, that leftover entry is stepped over.
 */

const MARK = 'aaSheet';

interface SheetState {
  [MARK]: string;
  level: number;
}

interface Owner {
  key: string;
  /** Entries pushed and still in the history. */
  level: number;
  onBack: (level: number) => void;
}

let owner: Owner | null = null;
/**
 * A sheet that just went away takes its entries off a moment later, so a sheet that
 * comes straight back (React's StrictMode does this in development) keeps them.
 */
let leaving: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;
/** Popstates we caused ourselves and should ignore. */
let pending = 0;
let installed = false;

const ours = (state: unknown, key?: string): state is SheetState =>
  typeof state === 'object' && state !== null && typeof (state as SheetState)[MARK] === 'string' &&
  (key == null || (state as SheetState)[MARK] === key);

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', e => {
    if (pending > 0) { pending--; return; }
    if (!owner) return;
    const level = ours(e.state, owner.key) ? e.state.level : 0;
    if (level >= owner.level) return;
    const o = owner;
    o.level = level;
    if (level === 0) owner = null;
    o.onBack(level);
  });
}

/** Takes off the entries a sheet pushed, down to `level`, if they're still the current ones. */
function leave(key: string, level: number) {
  if (owner?.key !== key || owner.level <= level) return;
  const n = owner.level - level;
  owner.level = level;
  if (level === 0) owner = null;
  if (ours(window.history.state, key)) {
    pending++;
    window.history.go(-n);
  }
}

/** After a reload with a sheet's entry current, step back over it to the page itself. */
let checkedLeftovers = false;
export function clearLeftoverSheetEntries() {
  install();
  // Once per page load (StrictMode runs effects twice in development)
  if (checkedLeftovers) return;
  checkedLeftovers = true;
  const state = window.history.state;
  if (!ours(state) || !(state.level > 0)) return;
  pending++;
  window.history.go(-state.level);
}

/**
 * Gives an open sheet history entries: `level` is 0 when closed, 1 when open, 2 when
 * open on a second step. Back calls `onBack` with the level to go to.
 */
export function useSheetHistory(key: string, level: number, onBack: (level: number) => void) {
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; });

  useEffect(() => {
    install();
    if (leaving?.key === key) { clearTimeout(leaving.timer); leaving = null; }
    const current = owner?.key === key ? owner.level : 0;
    if (level > current) {
      // Only one sheet is open at a time. If another still held entries, they stay
      // (going back now would race the push below) and this sheet takes over.
      for (let l = current + 1; l <= level; l++) {
        window.history.pushState({ ...(typeof window.history.state === 'object' ? window.history.state : {}), [MARK]: key, level: l }, '');
      }
      owner = { key, level, onBack: l => onBackRef.current(l) };
    } else if (level < current) {
      leave(key, level);
    }
  }, [key, level]);

  // Closed by going away altogether
  useEffect(() => () => {
    if (owner?.key !== key) return;
    if (leaving) { clearTimeout(leaving.timer); leave(leaving.key, 0); }
    leaving = { key, timer: setTimeout(() => { leaving = null; leave(key, 0); }, 0) };
  }, [key]);
}
