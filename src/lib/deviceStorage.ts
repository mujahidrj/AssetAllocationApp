import type { CurrentPosition, Stock } from '../components/calculator/types';

/**
 * What a visitor who isn't signed in has entered, kept in this browser so it's
 * still there next time. Signed-in users save to their account instead.
 */
export interface GuestData {
  stocks?: Stock[];
  positions?: CurrentPosition[];
  rebalanceStocks?: Stock[];
}

const KEY = 'assetAllocation.guest.v1';

const isStock = (s: unknown): s is Stock =>
  typeof s === 'object' && s !== null &&
  typeof (s as Stock).name === 'string' &&
  typeof (s as Stock).percentage === 'number' && Number.isFinite((s as Stock).percentage);

const isPosition = (p: unknown): p is CurrentPosition =>
  typeof p === 'object' && p !== null &&
  typeof (p as CurrentPosition).symbol === 'string' &&
  ((p as CurrentPosition).inputType === 'value' || (p as CurrentPosition).inputType === 'shares');

/** Reads saved guest data. Anything missing, unreadable or malformed comes back as undefined. */
export function loadGuestData(): GuestData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    const result: GuestData = {};
    if (Array.isArray(data.stocks) && data.stocks.every(isStock)) result.stocks = data.stocks;
    if (Array.isArray(data.positions) && data.positions.every(isPosition)) result.positions = data.positions;
    if (Array.isArray(data.rebalanceStocks) && data.rebalanceStocks.every(isStock)) result.rebalanceStocks = data.rebalanceStocks;
    return result;
  } catch {
    return {};
  }
}

/** Saves part of the guest data, keeping the rest. Fails quietly if storage is blocked or full. */
export function saveGuestData(patch: GuestData): void {
  try {
    const next = { ...loadGuestData(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing or storage turned off: the app still works, it just won't remember
  }
}
