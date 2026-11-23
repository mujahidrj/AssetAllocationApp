import { planDeposit, planWithdrawal } from '../lib/portfolioMath';
import { isCashSymbol, type Fund, type Holding, type Verb } from './model';

export type PriceMap = Record<string, number | null | undefined>;

export interface Trade {
  symbol: string;
  name?: string;
  action: 'buy' | 'sell';
  /** Dollars to trade, always positive. */
  dollars: number;
  /** Shares to trade, or null when there's no price. */
  shares: number | null;
  price: number | null;
}

export interface Skip {
  symbol: string;
  nowPct: number;
  targetPct: number;
}

export type PlanStatus =
  | 'ok'
  | 'needs-mix'      // no funds yet
  | 'needs-amount'   // nothing typed in the amount
  | 'targets-off'    // targets don't add up to 100%
  | 'needs-holdings' // rebalancing with nothing entered as owned
  | 'nothing-to-do'  // everything already on target
  | 'short-of-share'; // whole shares: not enough money for one share of anything

/** Whole shares: a fund that should get money but can't get even one share. */
export interface ShortOfShare {
  symbol: string;
  /** What it would have got. */
  dollars: number;
  price: number;
}

export interface Plan {
  status: PlanStatus;
  trades: Trade[];
  skips: Skip[];
  /**
   * Cash left over after the trades: money in that isn't spent, sale proceeds not
   * reinvested, or extra raised when taking money out. Only whole shares leave any.
   */
  leftover: number;
  /** Whole shares: funds that were due money but can't get one share. */
  shortOfShare: ShortOfShare[];
  /** Money in (positive) or out (negative) across all trades. */
  net: number;
  targetTotal: number;
  /** Dollar value of holdings used for the plan (0 when not tracking holdings). */
  heldTotal: number;
}

export interface PlanInput {
  funds: Fund[];
  holdings: Record<string, Holding>;
  tracksHoldings: boolean;
  verb: Verb;
  amount: number;
  /** With holdings and money in: buy and sell so every fund lands on target. */
  sell: boolean;
  prices: PriceMap;
  /** Trade whole shares only (default: fractional). */
  wholeShares?: boolean;
}

export const priceOf = (symbol: string, prices: PriceMap): number | null => {
  if (isCashSymbol(symbol)) return 1;
  const p = prices[symbol];
  return p != null && p > 0 ? p : null;
};

/** Dollar value of a holding; shares without a price count as $0. */
export function holdingDollars(symbol: string, holding: Holding | undefined, prices: PriceMap): number {
  if (!holding) return 0;
  if (holding.kind === 'dollars') return holding.amount;
  const price = priceOf(symbol, prices);
  return price ? holding.amount * price : 0;
}

/** Symbols in the mix plus any held fund that's no longer in it. */
function allSymbols(funds: Fund[], holdings: Record<string, Holding>): string[] {
  const symbols = funds.map(f => f.symbol);
  Object.entries(holdings).forEach(([s, h]) => {
    if (!symbols.includes(s) && h.amount > 0) symbols.push(s);
  });
  return symbols;
}

/** Works out the trades for what the sentence says. */
export function makePlan(input: PlanInput): Plan {
  const { funds, tracksHoldings, verb, amount, sell, prices } = input;
  const targetTotal = funds.reduce((sum, f) => sum + f.target, 0);
  const base: Plan = { status: 'ok', trades: [], skips: [], leftover: 0, shortOfShare: [], net: 0, targetTotal, heldTotal: 0 };

  if (funds.length === 0) return { ...base, status: 'needs-mix' };
  if (Math.abs(targetTotal - 100) > 0.01) return { ...base, status: 'targets-off' };

  const holdings = tracksHoldings ? input.holdings : {};
  const symbols = allSymbols(funds, holdings);
  const held: Record<string, number> = {};
  symbols.forEach(s => { held[s] = holdingDollars(s, holdings[s], prices); });
  const heldTotal = symbols.reduce((sum, s) => sum + held[s], 0);
  const targets = Object.fromEntries(funds.map(f => [f.symbol, f.target]));

  const effectiveVerb: Verb = !tracksHoldings && verb === 'rebal' ? 'add' : verb;
  if (effectiveVerb !== 'rebal' && !(amount > 0)) return { ...base, status: 'needs-amount', heldTotal };
  if (effectiveVerb === 'rebal' && heldTotal <= 0) return { ...base, status: 'needs-holdings', heldTotal };

  let deltas: Record<string, number>;
  if (!tracksHoldings || heldTotal <= 0) {
    // No holdings to work from: split the amount by target
    const sign = effectiveVerb === 'out' ? -1 : 1;
    deltas = planDeposit(amount, {}, targets);
    if (sign < 0) deltas = Object.fromEntries(Object.entries(deltas).map(([s, v]) => [s, -v]));
  } else if (effectiveVerb === 'rebal') {
    deltas = planDeposit(0, held, targets, { sell: true });
  } else if (effectiveVerb === 'add') {
    deltas = planDeposit(amount, held, targets, { sell });
  } else {
    deltas = planWithdrawal(amount, held, targets);
  }

  const order = (s: string) => {
    const i = funds.findIndex(f => f.symbol === s);
    return i === -1 ? funds.length : i;
  };

  const trades: Trade[] = [];
  const skips: Skip[] = [];
  symbols.forEach(symbol => {
    const delta = deltas[symbol] ?? 0;
    const fund = funds.find(f => f.symbol === symbol);
    if (Math.abs(delta) >= 0.01) {
      const price = priceOf(symbol, prices);
      trades.push({
        symbol,
        name: fund?.name,
        action: delta > 0 ? 'buy' : 'sell',
        dollars: Math.abs(delta),
        shares: price ? Math.abs(delta) / price : null,
        price,
      });
    } else if (tracksHoldings && heldTotal > 0 && fund && fund.target > 0) {
      skips.push({ symbol, nowPct: (held[symbol] / heldTotal) * 100, targetPct: fund.target });
    }
  });

  // Money coming in (+), going out (−) or neither, before rounding to whole shares
  const signedAmount = effectiveVerb === 'add' ? amount : effectiveVerb === 'out' ? -amount : 0;
  let shortOfShare: ShortOfShare[] = [];
  let finalTrades = trades;
  if (input.wholeShares) {
    const knownHoldings = tracksHoldings && heldTotal > 0;
    const result = roundToWholeShares(trades, {
      funds,
      held: knownHoldings ? held : null,
      // What each fund should be worth afterwards
      afterTotal: (knownHoldings ? heldTotal : 0) + signedAmount,
      topUp: effectiveVerb !== 'out',
      signedAmount,
    });
    finalTrades = result.trades;
    shortOfShare = result.shortOfShare;
  }

  finalTrades.sort((a, b) => (a.action === b.action ? order(a.symbol) - order(b.symbol) : a.action === 'sell' ? -1 : 1));
  const net = cents(finalTrades.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0));
  const leftover = input.wholeShares ? Math.max(0, cents(signedAmount - net)) : 0;

  return {
    status: finalTrades.length > 0 ? 'ok' : shortOfShare.length > 0 ? 'short-of-share' : 'nothing-to-do',
    trades: finalTrades,
    skips,
    leftover,
    shortOfShare,
    net,
    targetTotal,
    heldTotal,
  };
}

const cents = (n: number) => Math.round(n * 100) / 100;
const EPS = 1e-9;

/**
 * Whole shares: buys round down and sells round up (never past what you own), so
 * there's always enough cash for the buys and at least the amount asked for comes
 * out. Leftover cash then buys one more share at a time of whichever fund is
 * furthest behind its target, while it can still afford one. Cash funds and funds
 * without a price keep their exact dollar amounts.
 */
function roundToWholeShares(trades: Trade[], ctx: {
  funds: Fund[];
  /** Dollars held per fund, or null when holdings aren't known. */
  held: Record<string, number> | null;
  afterTotal: number;
  topUp: boolean;
  signedAmount: number;
}): { trades: Trade[]; shortOfShare: ShortOfShare[] } {
  const out: Trade[] = [];
  const shortOfShare: ShortOfShare[] = [];

  trades.forEach(t => {
    if (t.price == null || isCashSymbol(t.symbol)) { out.push(t); return; }
    const exact = t.dollars / t.price;
    if (t.action === 'sell') {
      let shares = Math.ceil(exact - EPS);
      const owned = ctx.held ? (ctx.held[t.symbol] ?? 0) / t.price : Infinity;
      if (shares > owned) shares = owned; // selling everything you have, fractions included
      out.push({ ...t, shares, dollars: cents(shares * t.price) });
    } else {
      const shares = Math.floor(exact + EPS);
      if (shares === 0) shortOfShare.push({ symbol: t.symbol, dollars: cents(t.dollars), price: t.price });
      else out.push({ ...t, shares, dollars: cents(shares * t.price) });
    }
  });

  if (ctx.topUp) {
    const net = () => out.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0);
    let cash = ctx.signedAmount - net();
    const selling = new Set(out.filter(t => t.action === 'sell').map(t => t.symbol));
    const candidates = ctx.funds.filter(f => {
      if (f.target <= 0 || isCashSymbol(f.symbol) || selling.has(f.symbol)) return false;
      const t = trades.find(x => x.symbol === f.symbol);
      return t?.price != null;
    });
    const priceFor = (symbol: string) => trades.find(x => x.symbol === symbol)!.price!;
    const after = (symbol: string) =>
      (ctx.held?.[symbol] ?? 0) + (out.find(t => t.symbol === symbol && t.action === 'buy')?.dollars ?? 0);

    for (let guard = 0; guard < 100000; guard++) {
      let best: Fund | null = null;
      let bestGap = 0;
      for (const f of candidates) {
        if (priceFor(f.symbol) > cash + EPS) continue;
        const gap = (f.target / 100) * ctx.afterTotal - after(f.symbol);
        if (gap > bestGap + EPS) { best = f; bestGap = gap; }
      }
      if (!best) break;
      const symbol = best.symbol;
      const price = priceFor(symbol);
      const existing = out.find(t => t.symbol === symbol && t.action === 'buy');
      if (existing) {
        existing.shares = (existing.shares ?? 0) + 1;
        existing.dollars = cents(existing.shares * price);
      } else {
        const fund = ctx.funds.find(f => f.symbol === symbol);
        out.push({ symbol, name: fund?.name, action: 'buy', dollars: cents(price), shares: 1, price });
        const i = shortOfShare.findIndex(s => s.symbol === symbol);
        if (i !== -1) shortOfShare.splice(i, 1);
      }
      cash -= price;
    }
  }

  return { trades: out, shortOfShare };
}
