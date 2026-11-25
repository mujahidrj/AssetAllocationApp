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
 * - A sheet that opens as another closes (one tap does both) takes over the closing
 *   sheet's entry instead of going back and pushing a new one: a push made while our
 *   own going-back is still under way is lost, and Back would then leave the site.
 * - Any other push waits until our going-back has finished, for the same reason.
 * - The popstate that our own going-back causes is ignored.
 * - Landing on an entry of a sheet that isn't open (after a reload, or one left under
 *   a sheet that took over) steps back over it.
 */

const MARK = 'aaSheet';

interface SheetState {
  [MARK]: string;
  level: number;
}

interface Owner {
  key: string;
  /** The step the sheet is on: 1, or 2 on a second step. */
  level: number;
  /** Of those steps, how many have their entry in the history. */
  pushed: number;
  /** Entries of a sheet this one took over, still under ours. */
  under: number;
  onBack: (level: number) => void;
}

let owner: Owner | null = null;
/**
 * A sheet that just closed takes its entries off a moment later, so a sheet that comes
 * straight back (React's StrictMode does this in development) keeps them, and a sheet
 * opened by the same tap can take them over.
 */
let leaving: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;
/** Goings-back we started whose popstate hasn't arrived yet. */
let pending = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
/** A push is waiting for those to finish. */
let waiting = false;
let installed = false;

const ours = (state: unknown, key?: string): state is SheetState =>
  typeof state === 'object' && state !== null && typeof (state as SheetState)[MARK] === 'string' &&
  (key == null || (state as SheetState)[MARK] === key);

function goBack(n: number) {
  pending++;
  if (pendingTimer) clearTimeout(pendingTimer);
  // Should a going-back never report in, don't hold pushes up for ever
  pendingTimer = setTimeout(settle, 1000);
  window.history.go(-n);
}

function settle() {
  pending = 0;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  if (waiting) { waiting = false; push(); }
}

/** Gives the open sheet's steps their entries, once nothing of ours is under way. */
function push() {
  if (pending > 0) { waiting = true; return; }
  const o = owner;
  if (!o || o.pushed >= o.level) return;
  for (let l = o.pushed + 1; l <= o.level; l++) {
    const state = typeof window.history.state === 'object' ? window.history.state : {};
    window.history.pushState({ ...state, [MARK]: o.key, level: l }, '');
  }
  o.pushed = o.level;
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', e => {
    if (pending > 0) {
      pending--;
      if (pending === 0) settle();
      return;
    }
    const state: unknown = e.state;
    const o = owner;
    if (o) {
      const level = ours(state, o.key) ? state.level : 0;
      if (level < o.pushed) {
        o.pushed = level;
        if (level < o.level) {
          o.level = level;
          if (level === 0) owner = null;
          o.onBack(level);
        }
      }
      if (ours(state, o.key)) return;
    }
    if (ours(state) && state.level > 0) goBack(state.level);
  });
}

/** Takes off the entries a sheet pushed, down to `level`, if they're still the current ones. */
function leave(key: string, level: number) {
  const o = owner;
  if (o?.key !== key || (o.level <= level && o.pushed <= level)) return;
  o.level = Math.min(o.level, level);
  if (level === 0) owner = null;
  if (o.pushed <= level) return; // Its pushes hadn't happened yet: now they won't
  const state: unknown = window.history.state;
  const at = ours(state, key) ? Math.min(o.pushed, state.level) : 0;
  o.pushed = level;
  if (at > level) goBack(at - level + (level === 0 ? o.under : 0));
}

function closeSoon(key: string) {
  if (owner?.key !== key) return;
  if (leaving) clearTimeout(leaving.timer);
  leaving = { key, timer: setTimeout(() => { leaving = null; leave(key, 0); }, 0) };
}

/** After a reload with a sheet's entry current, step back over it to the page itself. */
let checkedLeftovers = false;
export function clearLeftoverSheetEntries() {
  install();
  // Once per page load (StrictMode runs effects twice in development)
  if (checkedLeftovers) return;
  checkedLeftovers = true;
  const state: unknown = window.history.state;
  if (ours(state) && state.level > 0) goBack(state.level);
}

/** Forgets everything, for tests: each one starts with a fresh page. */
export function resetSheetHistory() {
  owner = null;
  if (leaving) clearTimeout(leaving.timer);
  leaving = null;
  pending = 0;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  waiting = false;
  checkedLeftovers = false;
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
    if (owner?.key === key) {
      if (leaving?.key === key) { clearTimeout(leaving.timer); leaving = null; }
      if (level === 0) closeSoon(key);
      else if (level < owner.level) leave(key, level);
      else { owner.level = level; push(); }
      return;
    }
    if (level === 0) return;
    // Another sheet's entry may still be the current one: a sheet closing in this same
    // tap, or one still open. Take it over rather than going back and pushing.
    let pushed = 0;
    let under = 0;
    if (owner) {
      if (leaving?.key === owner.key) { clearTimeout(leaving.timer); leaving = null; }
      const state: unknown = window.history.state;
      if (pending === 0 && ours(state, owner.key) && state.level > 0) {
        window.history.replaceState({ ...state, [MARK]: key, level: 1 }, '');
        pushed = 1;
        under = owner.under + state.level - 1;
      }
    }
    owner = { key, level, pushed, under, onBack: l => onBackRef.current(l) };
    push();
  }, [key, level]);

  // Closed by going away altogether
  useEffect(() => () => closeSoon(key), [key]);
}
