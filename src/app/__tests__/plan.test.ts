import { describe, it, expect } from 'vitest';
import { makePlan, holdingDollars, type PlanInput } from '../plan';

const funds = [
  { symbol: 'SPUS', target: 50, name: 'SP Funds S&P 500 Sharia Industry Exclusions ETF' },
  { symbol: 'SPTE', target: 40 },
  { symbol: 'SPWO', target: 10 },
];
const prices = { SPUS: 51.62, SPTE: 37.16, SPWO: 26.22 };
const holdings = {
  SPUS: { kind: 'dollars' as const, amount: 12400 },
  SPTE: { kind: 'dollars' as const, amount: 6900 },
  SPWO: { kind: 'dollars' as const, amount: 2100 },
};

const base: PlanInput = { funds, holdings: {}, tracksHoldings: false, verb: 'add', amount: 2500, sell: false, prices };
const summary = (input: Partial<PlanInput>) =>
  makePlan({ ...base, ...input }).trades.map(t => [t.action, t.symbol, t.dollars, t.shares?.toFixed(4) ?? null]);

describe('makePlan', () => {
  it('splits new money by target when no holdings are entered', () => {
    expect(summary({})).toEqual([
      ['buy', 'SPUS', 1250, '24.2154'],
      ['buy', 'SPTE', 1000, '26.9107'],
      ['buy', 'SPWO', 250, '9.5347'],
    ]);
  });

  it('sells by target when taking out without holdings', () => {
    const plan = makePlan({ ...base, verb: 'out', amount: 1000 });
    expect(plan.trades.map(t => [t.action, t.symbol, t.dollars])).toEqual([
      ['sell', 'SPUS', 500], ['sell', 'SPTE', 400], ['sell', 'SPWO', 100],
    ]);
    expect(plan.net).toBe(-1000);
  });

  it('smart deposit buys only what is behind and explains the skip', () => {
    const plan = makePlan({ ...base, holdings, tracksHoldings: true });
    expect(plan.trades.map(t => [t.action, t.symbol, t.dollars, t.shares?.toFixed(4)])).toEqual([
      ['buy', 'SPTE', 2254.24, '60.6631'],
      ['buy', 'SPWO', 245.76, '9.3730'],
    ]);
    expect(plan.skips).toEqual([{ symbol: 'SPUS', nowPct: expect.closeTo(57.94, 2), targetPct: 50 }]);
    expect(plan.net).toBe(2500);
  });

  it('sells to match when asked, listing sells first', () => {
    expect(summary({ holdings, tracksHoldings: true, sell: true })).toEqual([
      ['sell', 'SPUS', 450, '8.7176'],
      ['buy', 'SPTE', 2660, '71.5823'],
      ['buy', 'SPWO', 290, '11.0603'],
    ]);
  });

  it('takes money from what is furthest over target', () => {
    expect(summary({ holdings, tracksHoldings: true, verb: 'out', amount: 1500 })).toEqual([
      ['sell', 'SPUS', 1435.55, '27.8100'],
      ['sell', 'SPWO', 64.45, '2.4580'],
    ]);
  });

  it('rebalances with no new money', () => {
    const plan = makePlan({ ...base, holdings, tracksHoldings: true, verb: 'rebal', amount: 0 });
    expect(plan.trades.map(t => [t.action, t.symbol, t.dollars])).toEqual([
      ['sell', 'SPUS', 1700], ['buy', 'SPTE', 1660], ['buy', 'SPWO', 40],
    ]);
    expect(plan.net).toBe(0);
  });

  it('treats "just rebalancing" as adding when holdings are off', () => {
    expect(makePlan({ ...base, verb: 'rebal' }).trades).toHaveLength(3);
  });

  it('sells funds you hold that are no longer in the mix', () => {
    const plan = makePlan({
      ...base,
      holdings: { ...holdings, MSFT: { kind: 'shares', amount: 2 } },
      tracksHoldings: true,
      verb: 'rebal',
      prices: { ...prices, MSFT: 484.52 },
    });
    const msft = plan.trades.find(t => t.symbol === 'MSFT')!;
    expect(msft).toMatchObject({ action: 'sell', dollars: 969.04, shares: 2 });
  });

  it('reports why there are no trades', () => {
    expect(makePlan({ ...base, funds: [] }).status).toBe('needs-mix');
    expect(makePlan({ ...base, amount: 0 }).status).toBe('needs-amount');
    expect(makePlan({ ...base, funds: [{ symbol: 'SPUS', target: 95 }] })).toMatchObject({ status: 'targets-off', targetTotal: 95 });
    expect(makePlan({ ...base, tracksHoldings: true, verb: 'rebal' }).status).toBe('needs-holdings');
    const onTarget = { SPUS: { kind: 'dollars' as const, amount: 50 }, SPTE: { kind: 'dollars' as const, amount: 40 }, SPWO: { kind: 'dollars' as const, amount: 10 } };
    expect(makePlan({ ...base, holdings: onTarget, tracksHoldings: true, verb: 'rebal' }).status).toBe('nothing-to-do');
  });

  it('leaves shares blank when a price is missing, and prices cash at $1', () => {
    const plan = makePlan({
      ...base,
      funds: [{ symbol: 'NEW', target: 50 }, { symbol: 'CASH', target: 50 }],
      prices: { NEW: null },
      amount: 100,
    });
    expect(plan.trades).toEqual([
      expect.objectContaining({ symbol: 'NEW', shares: null, price: null, dollars: 50 }),
      expect.objectContaining({ symbol: 'CASH', shares: 50, price: 1 }),
    ]);
  });

  it('ignores holdings when the switch is off', () => {
    expect(makePlan({ ...base, holdings }).trades.map(t => t.dollars)).toEqual([1250, 1000, 250]);
  });

  it('values holdings typed as shares at the current price', () => {
    expect(holdingDollars('SPUS', { kind: 'shares', amount: 10 }, prices)).toBeCloseTo(516.2, 10);
    expect(holdingDollars('XYZ', { kind: 'shares', amount: 10 }, {})).toBe(0);
    expect(holdingDollars('CASH', { kind: 'shares', amount: 10 }, {})).toBe(10);
  });
});
