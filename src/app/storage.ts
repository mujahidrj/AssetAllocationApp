import { doc, getDoc, setDoc, type DocumentData } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadGuestData } from '../lib/deviceStorage';
import type { CurrentPosition, Stock } from '../components/calculator/types';
import { emptyPortfolio, newPortfolioId, sameMix, type Fund, type Holding, type ManualPrice, type Portfolio, type Workspace } from './model';

/* ---------- Conversions to and from the shapes saved before this screen ---------- */

export function fundsFromStocks(stocks: Stock[] | undefined): Fund[] {
  return (Array.isArray(stocks) ? stocks : [])
    .filter(s => s && typeof s.name === 'string' && typeof s.percentage === 'number')
    .map(s => ({
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
  (Array.isArray(positions) ? positions : []).forEach(p => {
    if (!p || typeof p.symbol !== 'string') return;
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

function cleanPortfolio(raw: unknown, fallbackId: string): Portfolio | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Partial<Portfolio>;
  const holdings: Record<string, Holding> = {};
  if (p.holdings && typeof p.holdings === 'object') {
    Object.entries(p.holdings).forEach(([s, h]) => { if (isHolding(h)) holdings[s] = h; });
  }
  return {
    id: typeof p.id === 'string' && p.id ? p.id : fallbackId,
    name: typeof p.name === 'string' ? p.name : '',
    funds: Array.isArray(p.funds) ? p.funds.filter(isFund) : [],
    holdings,
    tracksHoldings: p.tracksHoldings === true,
    sell: p.sell === true,
    ...(typeof p.templateId === 'string' ? { templateId: p.templateId } : {}),
    ...(p.wholeShares === true ? { wholeShares: true } : {}),
  };
}

/** Keeps only well-formed typed prices. */
export function cleanManualPrices(raw: unknown): Record<string, ManualPrice> {
  const out: Record<string, ManualPrice> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  Object.entries(raw as Record<string, unknown>).forEach(([symbol, v]) => {
    const m = v as Partial<ManualPrice> | null;
    if (m && typeof m.price === 'number' && Number.isFinite(m.price) && m.price > 0 && typeof m.at === 'string') {
      out[symbol] = { price: m.price, at: m.at };
    }
  });
  return out;
}

const withPrices = (ws: Workspace, raw: unknown): Workspace => {
  const manualPrices = cleanManualPrices(raw);
  return Object.keys(manualPrices).length > 0 ? { ...ws, manualPrices } : ws;
};

function cleanWorkspace(raw: unknown): Workspace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Partial<Workspace>;
  const portfolios = (Array.isArray(data.portfolios) ? data.portfolios : [])
    .map((p, i) => cleanPortfolio(p, `p${i + 1}`))
    .filter((p): p is Portfolio => p !== null);
  if (portfolios.length === 0) return null;
  const activeId = portfolios.some(p => p.id === data.activeId) ? (data.activeId as string) : portfolios[0].id;
  return withPrices({ portfolios, activeId }, data.manualPrices);
}

/* ---------- This device ---------- */

const DEVICE_KEY = 'assetAllocation.portfolios.v3';
const SINGLE_KEY = 'assetAllocation.portfolio.v2';

const single = (p: Portfolio): Workspace => ({ portfolios: [p], activeId: p.id });

/**
 * Reads everything saved in this browser. Falls back to what earlier versions saved,
 * so nothing is lost in the switch. Returns null when nothing was ever saved.
 */
export function loadDeviceWorkspace(): Workspace | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_KEY);
    if (raw) {
      const ws = cleanWorkspace(JSON.parse(raw));
      if (ws) return ws;
    }
  } catch {
    // Unreadable: fall through to older formats
  }

  try {
    const raw = window.localStorage.getItem(SINGLE_KEY);
    if (raw) {
      const p = cleanPortfolio({ ...JSON.parse(raw), id: 'p1', name: '' }, 'p1');
      if (p) return single(p);
    }
  } catch {
    // fall through
  }

  const old = loadGuestData();
  if (!old.stocks && !old.positions) return null;
  const holdings = holdingsFromPositions(old.positions);
  return single({ ...emptyPortfolio('p1'), funds: fundsFromStocks(old.stocks), holdings, tracksHoldings: anyHeld(holdings) });
}

/** Returns false when the browser won't store it (private browsing, storage full or blocked). */
export function saveDeviceWorkspace(ws: Workspace): boolean {
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(ws));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Google account (Firestore) ---------- */

/**
 * Reads a signed-in user's portfolios. They live in the same two documents the
 * previous screen used (the security rules allow only those): the mixes in
 * userStocks/{uid}.portfolios and holdings in userPositions/{uid}.byPortfolio.
 * An account saved by the previous screen has only `stocks` and `positions`; that
 * becomes one unnamed portfolio. Returns null for a new account.
 */
export async function loadCloudWorkspace(uid: string): Promise<Workspace | null> {
  const [stocksSnap, positionsSnap] = await Promise.all([
    getDoc(doc(db, 'userStocks', uid)),
    getDoc(doc(db, 'userPositions', uid)),
  ]);
  if (!stocksSnap.exists() && !positionsSnap.exists()) return null;

  const stocksData: DocumentData = stocksSnap.exists() ? stocksSnap.data() : {};
  const positionsData: DocumentData = positionsSnap.exists() ? positionsSnap.data() : {};

  if (Array.isArray(stocksData.portfolios) && stocksData.portfolios.length > 0) {
    const byPortfolio: Record<string, CurrentPosition[]> =
      positionsData.byPortfolio && typeof positionsData.byPortfolio === 'object' ? positionsData.byPortfolio : {};
    const portfolios = (stocksData.portfolios as DocumentData[]).map((p, i): Portfolio => {
      const id = typeof p.id === 'string' && p.id ? p.id : `p${i + 1}`;
      return cleanPortfolio({
        id,
        name: p.name,
        funds: fundsFromStocks(p.stocks),
        holdings: holdingsFromPositions(byPortfolio[id]),
        tracksHoldings: p.tracksHoldings,
        sell: p.sell,
        templateId: p.templateId,
        wholeShares: p.wholeShares,
      }, id)!;
    });
    const activeId = portfolios.some(p => p.id === stocksData.activeId) ? stocksData.activeId as string : portfolios[0].id;
    return withPrices({ portfolios, activeId }, stocksData.manualPrices);
  }

  const holdings = holdingsFromPositions(positionsData.positions as CurrentPosition[] | undefined);
  return single({
    ...emptyPortfolio('p1'),
    funds: fundsFromStocks(stocksData.stocks as Stock[] | undefined),
    holdings,
    tracksHoldings: typeof positionsData.tracksHoldings === 'boolean' ? positionsData.tracksHoldings : anyHeld(holdings),
  });
}

export async function saveCloudWorkspace(uid: string, ws: Workspace): Promise<void> {
  // The old fields mirror the first portfolio so an older copy of the app still works
  const first = ws.portfolios[0];
  await Promise.all([
    setDoc(doc(db, 'userStocks', uid), {
      stocks: stocksFromFunds(first.funds),
      portfolios: ws.portfolios.map(p => ({
        id: p.id,
        name: p.name,
        stocks: stocksFromFunds(p.funds),
        tracksHoldings: p.tracksHoldings,
        sell: p.sell,
        ...(p.templateId ? { templateId: p.templateId } : {}),
        ...(p.wholeShares ? { wholeShares: true } : {}),
      })),
      activeId: ws.activeId,
      manualPrices: ws.manualPrices ?? {},
    }),
    setDoc(doc(db, 'userPositions', uid), {
      positions: positionsFromHoldings(first.holdings),
      tracksHoldings: first.tracksHoldings,
      byPortfolio: Object.fromEntries(ws.portfolios.map(p => [p.id, positionsFromHoldings(p.holdings)])),
    }),
  ]);
}

/**
 * On sign-in to an account that already has portfolios: the account wins, and any
 * portfolio built on this device with a mix the account doesn't have is added as
 * "Roth IRA (this device)", so nothing built before signing in is lost.
 */
export function mergeDeviceIntoAccount(account: Workspace, device: Workspace | null): { workspace: Workspace; added: number } {
  if (!device) return { workspace: account, added: 0 };
  // Typed prices: the account's win, the device fills gaps
  const devicePrices = device.manualPrices ?? {};
  const prices = { ...devicePrices, ...(account.manualPrices ?? {}) };
  if (Object.keys(prices).length > 0) account = { ...account, manualPrices: prices };
  const extra = device.portfolios
    .filter(d => d.funds.some(f => f.target > 0))
    .filter(d => !account.portfolios.some(a => sameMix(a.funds, d.funds)))
    .map(d => ({ ...d, id: newPortfolioId(), name: `${d.name.trim() || 'My portfolio'} (this device)` }));
  if (extra.length === 0) return { workspace: account, added: 0 };
  return { workspace: { ...account, portfolios: [...account.portfolios, ...extra] }, added: extra.length };
}
