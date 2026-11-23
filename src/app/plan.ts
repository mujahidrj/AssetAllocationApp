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
 * Whole shares. Buys round down and sells round up (never past what you own), so
 * there's always enough cash for the buys and at least the amount asked for comes
 * out. Then:
 * - leftover cash buys more shares of whichever fund is furthest behind its target,
 *   while it can still afford one;
 * - sells whose money nothing can use are trimmed back a share at a time (and cash
 *   isn't "sold" just to sit as cash);
 * - when taking money out, shares that aren't needed to reach the amount are kept.
 * Cash funds and funds without a price keep their exact dollar amounts.
 */
function roundToWholeShares(trades: Trade[], ctx: {
  funds: Fund[];
  /** Dollars held per fund, or null when holdings aren't known. */
  held: Record<string, number> | null;
  afterTotal: number;
  topUp: boolean;
  signedAmount: number;
}): { trades: Trade[]; shortOfShare: ShortOfShare[] } {
  let out: Trade[] = [];
  const shortOfShare: ShortOfShare[] = [];
  const targetOf = (symbol: string) => ctx.funds.find(f => f.symbol === symbol)?.target ?? 0;
  const bought = (symbol: string) => out.find(t => t.symbol === symbol && t.action === 'buy')?.dollars ?? 0;
  const sold = (symbol: string) => out.find(t => t.symbol === symbol && t.action === 'sell')?.dollars ?? 0;
  /** How far below its target a fund ends up (negative: above). */
  const gapAfter = (symbol: string) =>
    (targetOf(symbol) / 100) * ctx.afterTotal - ((ctx.held?.[symbol] ?? 0) + bought(symbol) - sold(symbol));
  const net = () => out.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0);
  const setShares = (t: Trade, shares: number) => { t.shares = shares; t.dollars = cents(shares * t.price!); };
  /** One share fewer, landing on a whole number (selling 272.43 of 272.43 → 272). */
  const oneLess = (shares: number) => (Math.abs(shares - Math.round(shares)) < 1e-6 ? Math.round(shares) - 1 : Math.floor(shares));

  trades.forEach(t => {
    if (t.price == null || isCashSymbol(t.symbol)) { out.push({ ...t }); return; }
    const exact = t.dollars / t.price;
    if (t.action === 'sell') {
      let shares = Math.ceil(exact - EPS);
      if (ctx.held) {
        let owned = (ctx.held[t.symbol] ?? 0) / t.price;
        if (Math.abs(owned - Math.round(owned)) < 1e-6) owned = Math.round(owned);
        if (shares > owned) shares = owned; // selling everything you have, fractions included
      }
      out.push({ ...t, shares, dollars: cents(shares * t.price) });
    } else {
      const shares = Math.floor(exact + EPS);
      if (shares === 0) shortOfShare.push({ symbol: t.symbol, dollars: cents(t.dollars), price: t.price });
      else out.push({ ...t, shares, dollars: cents(shares * t.price) });
    }
  });

  if (ctx.topUp) {
    let cash = ctx.signedAmount - net();
    const selling = new Set(out.filter(t => t.action === 'sell').map(t => t.symbol));
    const priceOfTrade = (symbol: string) => trades.find(x => x.symbol === symbol)?.price ?? null;
    const candidates = ctx.funds.filter(f =>
      f.target > 0 && !isCashSymbol(f.symbol) && !selling.has(f.symbol) && priceOfTrade(f.symbol) != null);

    // Spend what's left on whoever is furthest behind, as many shares as fit per step
    for (let guard = 0; guard < 10000; guard++) {
      let best: Fund | null = null;
      let bestGap = 0;
      for (const f of candidates) {
        if (priceOfTrade(f.symbol)! > cash + EPS) continue;
        const gap = gapAfter(f.symbol);
        if (gap > bestGap + EPS) { best = f; bestGap = gap; }
      }
      if (!best) break;
      const price = priceOfTrade(best.symbol)!;
      const n = Math.max(1, Math.floor(Math.min(cash, bestGap) / price + EPS));
      const existing = out.find(t => t.symbol === best!.symbol && t.action === 'buy');
      if (existing) setShares(existing, (existing.shares ?? 0) + n);
      else {
        out.push({ symbol: best.symbol, name: best.name, action: 'buy', dollars: cents(n * price), shares: n, price });
        const i = shortOfShare.findIndex(x => x.symbol === best!.symbol);
        if (i !== -1) shortOfShare.splice(i, 1);
      }
      cash -= n * price;
    }

    // A sell rounded up to a whole share can free more than the buys use (or, with a
    // costly share, far more). Keep a share back whenever that leaves the portfolio
    // closer to target, counting idle cash as off target, and buy less if the cash
    // then runs short.
    const offBy = (trs: Trade[]) => {
      const amt = (s: string, a: Trade['action']) => trs.find(t => t.symbol === s && t.action === a)?.dollars ?? 0;
      const symbols = new Set([...ctx.funds.map(f => f.symbol), ...Object.keys(ctx.held ?? {}), ...trs.map(t => t.symbol)]);
      let total = 0;
      symbols.forEach(s => {
        total += Math.abs((targetOf(s) / 100) * ctx.afterTotal - ((ctx.held?.[s] ?? 0) + amt(s, 'buy') - amt(s, 'sell')));
      });
      const idle = ctx.signedAmount - trs.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0);
      return total + Math.max(0, idle);
    };
    const keepOneBack = (trs: Trade[], symbol: string): Trade[] | null => {
      const next = trs.map(t => ({ ...t }));
      const sell = next.find(t => t.symbol === symbol && t.action === 'sell')!;
      sell.shares = oneLess(sell.shares ?? 0);
      sell.dollars = cents(sell.shares * sell.price!);
      let short = -(ctx.signedAmount - next.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0));
      // Buy less of whatever ends up furthest over (or least behind) its target
      while (short > EPS) {
        const buys = next.filter(t => t.action === 'buy' && t.price != null && !isCashSymbol(t.symbol) && (t.shares ?? 0) >= 1);
        const cashBuy = next.find(t => t.action === 'buy' && isCashSymbol(t.symbol) && t.dollars > 0);
        if (buys.length === 0 && !cashBuy) return null;
        if (cashBuy) {
          const cut = Math.min(cashBuy.dollars, short);
          cashBuy.dollars = cents(cashBuy.dollars - cut);
          cashBuy.shares = cashBuy.price ? cashBuy.dollars / cashBuy.price : cashBuy.shares;
          short -= cut;
          continue;
        }
        const after = (t: Trade) => (targetOf(t.symbol) / 100) * ctx.afterTotal - ((ctx.held?.[t.symbol] ?? 0) + t.dollars);
        const trim = buys.reduce((x, y) => (after(y) < after(x) ? y : x));
        const n = Math.min(trim.shares!, Math.max(1, Math.ceil(short / trim.price! - EPS)));
        trim.shares = trim.shares! - n;
        trim.dollars = cents(trim.shares * trim.price!);
        short -= n * trim.price!;
      }
      return next.filter(t => t.dollars >= 0.005 || t.action === 'sell');
    };
    for (let guard = 0; guard < 1000; guard++) {
      const current = offBy(out);
      let best: Trade[] | null = null;
      let bestOff = current - 0.005;
      for (const t of out) {
        if (t.action !== 'sell' || isCashSymbol(t.symbol) || t.price == null || (t.shares ?? 0) < 1 - EPS) continue;
        const tried = keepOneBack(out, t.symbol);
        if (!tried) continue;
        const off = offBy(tried);
        if (off < bestOff) { best = tried; bestOff = off; }
      }
      if (!best) break;
      out = best;
    }
    cash = ctx.signedAmount - net();
    // A fund that lost its buy entirely is short of a share again
    candidates.forEach(f => {
      if (!out.some(t => t.symbol === f.symbol && t.action === 'buy' && t.dollars > 0) && !shortOfShare.some(x => x.symbol === f.symbol)) {
        const original = trades.find(t => t.symbol === f.symbol && t.action === 'buy');
        if (original) shortOfShare.push({ symbol: f.symbol, dollars: cents(original.dollars), price: original.price! });
      }
    });
    // ...then cash, which needn't be "sold" just to stay cash
    out.filter(t => t.action === 'sell' && isCashSymbol(t.symbol)).forEach(t => {
      const back = Math.min(t.dollars, Math.max(0, cash));
      t.dollars = cents(t.dollars - back);
      t.shares = t.price ? t.dollars / t.price : t.shares;
      cash -= back;
    });
  } else {
    // Taking money out: keep any share that isn't needed to reach the amount, from
    // the fund that would otherwise end up furthest under its target
    const needed = -ctx.signedAmount;
    for (let guard = 0; guard < 10000; guard++) {
      const raised = -net();
      const spare = out.filter(t =>
        t.action === 'sell' && !isCashSymbol(t.symbol) && t.price != null && (t.shares ?? 0) >= 1 - EPS &&
        raised - (t.shares! - oneLess(t.shares!)) * t.price >= needed - EPS);
      if (spare.length === 0) break;
      const keep = spare.reduce((a, b) => (gapAfter(b.symbol) > gapAfter(a.symbol) ? b : a));
      setShares(keep, oneLess(keep.shares!));
    }
  }

  out = out.filter(t => t.dollars >= 0.005);
  return { trades: out, shortOfShare };
}

/* ---------- Off target ---------- */

export interface OffTarget {
  symbol: string;
  nowPct: number;
  targetPct: number;
  /** nowPct − targetPct */
  drift: number;
}

/** Below this, a rebalancing trade isn't worth suggesting. */
const MIN_REBALANCE_TRADE = 25;

/**
 * Funds far enough off target to be worth rebalancing, furthest first: 5 or more
 * points away, or a quarter of their own target away (2.5 points for a 10% fund),
 * and at least a $25 trade to fix.
 */
export function offTargets(funds: Fund[], values: Record<string, number>): OffTarget[] {
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const symbols = [...new Set([...funds.map(f => f.symbol), ...Object.keys(values)])];
  const off: OffTarget[] = [];
  symbols.forEach(symbol => {
    const targetPct = funds.find(f => f.symbol === symbol)?.target ?? 0;
    const nowPct = ((values[symbol] ?? 0) / total) * 100;
    const drift = nowPct - targetPct;
    const far = Math.abs(drift) >= 5 || (targetPct > 0 ? Math.abs(drift) / targetPct >= 0.25 : nowPct > 0);
    const worthIt = (Math.abs(drift) / 100) * total >= MIN_REBALANCE_TRADE;
    if (far && worthIt) off.push({ symbol, nowPct, targetPct, drift });
  });
  return off.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

/** The fund furthest from its target, when one is far enough off (see offTargets). */
export const furthestOff = (funds: Fund[], values: Record<string, number>): OffTarget | null =>
  offTargets(funds, values)[0] ?? null;

/**
 * Dollar value of each holding, or null when a holding can't be valued (shares
 * with no price), since any "off target" figure would then be wrong.
 */
export function heldValues(holdings: Record<string, Holding>, prices: PriceMap): Record<string, number> | null {
  const values: Record<string, number> = {};
  for (const [symbol, h] of Object.entries(holdings)) {
    if (!(h.amount > 0)) continue;
    if (h.kind === 'shares' && priceOf(symbol, prices) == null) return null;
    values[symbol] = holdingDollars(symbol, h, prices);
  }
  return values;
}

/** What each holding is worth once the plan's trades are done. */
export function valuesAfter(values: Record<string, number>, trades: Trade[]): Record<string, number> {
  const after = { ...values };
  trades.forEach(t => { after[t.symbol] = (after[t.symbol] ?? 0) + (t.action === 'buy' ? t.dollars : -t.dollars); });
  return after;
}
