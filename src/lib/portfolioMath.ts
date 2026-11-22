/**
 * Portfolio math with no React, no network and no storage, so every rule can be
 * tested on its own. The calculator hook gathers inputs and shows results;
 * the numbers come from here.
 */
import type { AllocationResult, CurrentPosition, RebalanceResult, Stock } from '../components/calculator/types';

export type Prices = Record<string, number | null | undefined>;

/** Cash is always worth $1.00 a "share". */
export function isCash(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s === 'CASH' || s === 'USD';
}

/** Price to use for a symbol: $1 for cash, otherwise the fetched price (null/undefined if unknown). */
export function priceFor(symbol: string, prices: Prices): number | null | undefined {
  return isCash(symbol) ? 1 : prices[symbol];
}

/** Sum of target percentages. */
export function targetTotal(stocks: Stock[]): number {
  return stocks.reduce((sum, stock) => sum + stock.percentage, 0);
}

/** True when targets add up to 100% (allowing for floating-point noise). */
export function targetsAddUp(stocks: Stock[]): boolean {
  return Math.abs(targetTotal(stocks) - 100) <= 0.01;
}

/**
 * Dollar value and share count of a holding entered either as dollars or as shares.
 * Without a usable price, the side that can't be derived is 0.
 */
export function holdingValue(position: CurrentPosition, prices: Prices): { value: number; shares: number } {
  const price = priceFor(position.symbol, prices);
  const hasPrice = price != null && price > 0;
  if (position.inputType === 'shares') {
    const shares = position.shares || 0;
    return { value: hasPrice ? shares * price : 0, shares };
  }
  const value = position.value || 0;
  return { value, shares: hasPrice ? value / price : 0 };
}

/** Total dollar value of all holdings. */
export function portfolioValue(positions: CurrentPosition[], prices: Prices): number {
  return positions.reduce((sum, pos) => sum + holdingValue(pos, prices).value, 0);
}

/** Split an amount across funds by target percentage, with share counts where a price is known. */
export function splitByTarget(amount: number, stocks: Stock[], prices: Prices): AllocationResult[] {
  return stocks.map(stock => {
    const allocation = amount * (stock.percentage / 100);
    const price = priceFor(stock.name, prices);
    if (isCash(stock.name)) {
      return { ...stock, amount: allocation.toFixed(2), currentPrice: 1, shares: allocation };
    }
    return {
      ...stock,
      amount: allocation.toFixed(2),
      currentPrice: price,
      shares: price ? allocation / price : undefined,
    };
  });
}

const actionOrder = { sell: 0, buy: 1, hold: 2 } as const;

/**
 * Buys and sells that bring current holdings to the target mix, with no new money.
 * Funds held but not in the targets are sold in full. Differences of a cent or less
 * are "hold". Results list sells first, then buys, then holds.
 * Returns null when there's nothing to rebalance (no holdings, no targets, or a zero total).
 */
export function rebalance(positions: CurrentPosition[], targets: Stock[], prices: Prices): RebalanceResult[] | null {
  if (positions.length === 0 || targets.length === 0) return null;

  const total = portfolioValue(positions, prices);
  if (total <= 0) return null;

  const held = new Map(positions.map(pos => [pos.symbol, holdingValue(pos, prices)]));
  const targetSymbols = new Set(targets.map(stock => stock.name));

  const targetResults: RebalanceResult[] = targets.map((stock): RebalanceResult => {
    const current = held.get(stock.name) ?? { value: 0, shares: 0 };
    const targetValue = total * (stock.percentage / 100);
    const difference = targetValue - current.value;
    const price = priceFor(stock.name, prices) ?? null;
    const hasPrice = price != null && price > 0;
    const trades = Math.abs(difference) > 0.01;

    return {
      ...stock,
      amount: targetValue.toFixed(2),
      currentPrice: price,
      shares: hasPrice ? targetValue / price : undefined,
      currentValue: current.value,
      currentPercentage: (current.value / total) * 100,
      targetValue,
      difference,
      action: trades ? (difference > 0 ? 'buy' : 'sell') : 'hold',
      sharesToTrade: trades && hasPrice ? Math.abs(difference) / price : 0,
      currentShares: current.shares,
    };
  });

  const sellAll: RebalanceResult[] = positions
    .filter(pos => !targetSymbols.has(pos.symbol))
    .map((pos): RebalanceResult => {
      const current = held.get(pos.symbol)!;
      const price = priceFor(pos.symbol, prices) ?? null;
      const hasPrice = price != null && price > 0;
      return {
        name: pos.symbol,
        percentage: 0,
        companyName: pos.companyName,
        amount: '0.00',
        currentPrice: price,
        shares: undefined,
        currentValue: current.value,
        currentPercentage: (current.value / total) * 100,
        targetValue: 0,
        difference: -current.value,
        action: 'sell',
        sharesToTrade: hasPrice && current.value > 0 ? current.value / price : current.shares,
        currentShares: current.shares,
      };
    });

  // Stable sort keeps target order within each group
  return [...targetResults, ...sellAll].sort((a, b) => actionOrder[a.action] - actionOrder[b.action]);
}

/** Dollar change per symbol: positive is a buy, negative a sell. */
export type TradePlan = Record<string, number>;

// `|| 0` turns -0 into 0 so an untouched fund reads as 0, not -0
const roundCents = (n: number) => Math.round(n * 100) / 100 || 0;

/**
 * Where new money should go.
 * - Without selling (default): money goes only to funds below target, in proportion
 *   to how far below they are. If the money is more than those gaps, the rest is
 *   split by target %.
 * - With `sell: true`: buys and sells so every fund lands exactly on target.
 * `holdings` and the result are in dollars by symbol; `targets` are percentages.
 */
export function planDeposit(
  amount: number,
  holdings: Record<string, number>,
  targets: Record<string, number>,
  options: { sell?: boolean } = {}
): TradePlan {
  const symbols = unionSymbols(holdings, targets);
  const weights = normalise(targets, symbols);
  const held = (s: string) => holdings[s] || 0;
  const total = symbols.reduce((sum, s) => sum + held(s), 0);
  const after = total + amount;
  const plan: TradePlan = {};

  if (options.sell) {
    symbols.forEach(s => { plan[s] = after * weights[s] - held(s); });
    return roundPlan(plan, amount);
  }

  const gaps = Object.fromEntries(symbols.map(s => [s, Math.max(0, after * weights[s] - held(s))]));
  const gapTotal = symbols.reduce((sum, s) => sum + gaps[s], 0);
  symbols.forEach(s => {
    plan[s] = gapTotal >= amount
      ? (gapTotal > 0 ? amount * gaps[s] / gapTotal : 0)
      : gaps[s] + (amount - gapTotal) * weights[s];
  });
  return roundPlan(plan, amount);
}

/**
 * Where to take money from: funds furthest over target first, in proportion to how
 * far over they are, never selling more than is held. Values in the result are negative.
 */
export function planWithdrawal(
  amount: number,
  holdings: Record<string, number>,
  targets: Record<string, number>
): TradePlan {
  const symbols = unionSymbols(holdings, targets);
  const weights = normalise(targets, symbols);
  const held = (s: string) => holdings[s] || 0;
  const total = symbols.reduce((sum, s) => sum + held(s), 0);
  const take = Math.min(amount, total);
  const after = total - take;

  const excess = Object.fromEntries(symbols.map(s => [s, Math.max(0, held(s) - after * weights[s])]));
  const excessTotal = symbols.reduce((sum, s) => sum + excess[s], 0);
  const plan: TradePlan = {};
  symbols.forEach(s => {
    const out = excessTotal >= take
      ? (excessTotal > 0 ? take * excess[s] / excessTotal : 0)
      : excess[s] + (take - excessTotal) * weights[s];
    plan[s] = -Math.min(out, held(s));
  });
  return roundPlan(plan, -take);
}

function unionSymbols(...maps: Record<string, number>[]): string[] {
  const seen = new Set<string>();
  maps.forEach(m => Object.keys(m).forEach(k => seen.add(k)));
  return [...seen];
}

function normalise(targets: Record<string, number>, symbols: string[]): Record<string, number> {
  const sum = symbols.reduce((acc, s) => acc + (targets[s] || 0), 0);
  return Object.fromEntries(symbols.map(s => [s, sum > 0 ? (targets[s] || 0) / sum : 0]));
}

/** Round to cents and put any leftover cent on the largest trade, so the plan sums to `expected`. */
function roundPlan(plan: TradePlan, expected: number): TradePlan {
  const rounded = Object.fromEntries(Object.entries(plan).map(([s, v]) => [s, roundCents(v)]));
  const drift = roundCents(expected - Object.values(rounded).reduce((a, b) => a + b, 0));
  if (drift !== 0) {
    const largest = Object.keys(rounded).sort((a, b) => Math.abs(rounded[b]) - Math.abs(rounded[a]))[0];
    if (largest) rounded[largest] = roundCents(rounded[largest] + drift);
  }
  return rounded;
}
