import { doc, getDoc, setDoc, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadGuestData } from '../lib/deviceStorage';
import type { CurrentPosition, Stock } from '../components/calculator/types';
import { emptyPortfolio, type Fund, type Holding, type Portfolio } from './model';

/* ---------- Conversions to and from the shapes saved before this screen ---------- */

export function fundsFromStocks(stocks: Stock[] | undefined): Fund[] {
  return (stocks ?? []).map(s => ({
    symbol: s.name,
    target: s.percentage,
    ...(s.companyName ? { name: s.companyName } : {}),
  }));
}

export function stocksFromFunds(funds: Fund[]): Stock[] {
  // Firestore rejects undefined, so leave the name out when there isn't one
  return funds.map(f => (f.name ? { name: f.symbol, percentage: f.target, companyName: f.name } : { name: f.symbol, percentage: f.target }));
}

export function holdingsFromPositions(positions: CurrentPosition[] | undefined): Record<string, Holding> {
  const holdings: Record<string, Holding> = {};
  (positions ?? []).forEach(p => {
    holdings[p.symbol] = p.inputType === 'shares'
      ? { kind: 'shares', amount: p.shares ?? 0 }
      : { kind: 'dollars', amount: p.value ?? 0 };
  });
  return holdings;
}

export function positionsFromHoldings(holdings: Record<string, Holding>): CurrentPosition[] {
  return Object.entries(holdings).map(([symbol, h]): CurrentPosition =>
    h.kind === 'shares'
      ? { symbol, inputType: 'shares', shares: h.amount }
      : { symbol, inputType: 'value', value: h.amount }
  );
}

const anyHeld = (holdings: Record<string, Holding>) => Object.values(holdings).some(h => h.amount > 0);

const isFund = (f: unknown): f is Fund =>
  typeof f === 'object' && f !== null &&
  typeof (f as Fund).symbol === 'string' &&
  typeof (f as Fund).target === 'number' && Number.isFinite((f as Fund).target);

const isHolding = (h: unknown): h is Holding =>
  typeof h === 'object' && h !== null &&
  ((h as Holding).kind === 'dollars' || (h as Holding).kind === 'shares') &&
  typeof (h as Holding).amount === 'number' && Number.isFinite((h as Holding).amount);

/* ---------- This device ---------- */

const DEVICE_KEY = 'assetAllocation.portfolio.v2';

/**
 * Reads the portfolio saved in this browser. Falls back to what the previous screen
 * saved, so nothing is lost in the switch. Returns null when nothing was ever saved.
 */
export function loadDevicePortfolio(): Portfolio | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Portfolio>;
      const funds = Array.isArray(data.funds) ? data.funds.filter(isFund) : [];
      const holdings: Record<string, Holding> = {};
      if (data.holdings && typeof data.holdings === 'object') {
        Object.entries(data.holdings).forEach(([s, h]) => { if (isHolding(h)) holdings[s] = h; });
      }
      return { funds, holdings, tracksHoldings: data.tracksHoldings === true };
    }
  } catch {
    // Unreadable: fall through to the older format
  }

  const old = loadGuestData();
  if (!old.stocks && !old.positions) return null;
  const holdings = holdingsFromPositions(old.positions);
  return { funds: fundsFromStocks(old.stocks), holdings, tracksHoldings: anyHeld(holdings) };
}

export function saveDevicePortfolio(portfolio: Portfolio): void {
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(portfolio));
  } catch {
    // Private browsing or storage full: the app still works, it just won't remember
  }
}

/* ---------- Google account (Firestore) ---------- */

/**
 * Reads a signed-in user's portfolio from the same documents the previous screen used:
 * the mix from userStocks, holdings from userPositions. Returns null for a new user.
 */
export async function loadCloudPortfolio(uid: string): Promise<Portfolio | null> {
  const [stocksSnap, positionsSnap] = await Promise.all([
    getDoc(doc(db, 'userStocks', uid)),
    getDoc(doc(db, 'userPositions', uid)),
  ]);
  if (!stocksSnap.exists() && !positionsSnap.exists()) return null;

  const stocksData: DocumentData = stocksSnap.exists() ? stocksSnap.data() : {};
  const positionsData: DocumentData = positionsSnap.exists() ? positionsSnap.data() : {};
  const holdings = holdingsFromPositions(positionsData.positions as CurrentPosition[] | undefined);
  const tracks = typeof positionsData.tracksHoldings === 'boolean' ? positionsData.tracksHoldings : anyHeld(holdings);

  return {
    ...emptyPortfolio(),
    funds: fundsFromStocks(stocksData.stocks as Stock[] | undefined),
    holdings,
    tracksHoldings: tracks,
  };
}

export async function saveCloudPortfolio(uid: string, portfolio: Portfolio): Promise<void> {
  await Promise.all([
    setDoc(doc(db, 'userStocks', uid), { stocks: stocksFromFunds(portfolio.funds) }),
    setDoc(doc(db, 'userPositions', uid), {
      positions: positionsFromHoldings(portfolio.holdings),
      tracksHoldings: portfolio.tracksHoldings,
    }),
  ]);
}
