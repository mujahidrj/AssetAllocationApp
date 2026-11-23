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
  | 'nothing-to-do'; // everything already on target

export interface Plan {
  status: PlanStatus;
  trades: Trade[];
  skips: Skip[];
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
  const base: Plan = { status: 'ok', trades: [], skips: [], net: 0, targetTotal, heldTotal: 0 };

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

  trades.sort((a, b) => (a.action === b.action ? order(a.symbol) - order(b.symbol) : a.action === 'sell' ? -1 : 1));
  const net = Math.round(trades.reduce((sum, t) => sum + (t.action === 'buy' ? t.dollars : -t.dollars), 0) * 100) / 100;

  return {
    status: trades.length === 0 ? 'nothing-to-do' : 'ok',
    trades,
    skips,
    net,
    targetTotal,
    heldTotal,
  };
}
