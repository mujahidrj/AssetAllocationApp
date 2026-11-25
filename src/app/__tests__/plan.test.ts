import { describe, it, expect } from 'vitest';
import { furthestOff, heldValues, makePlan, holdingDollars, offTargets, unpricedShares, valuesAfter, type PlanInput } from '../plan';

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
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0]).toMatchObject({ symbol: 'SPUS', targetPct: 50 });
    expect(plan.skips[0].nowPct).toBeCloseTo(57.94, 2);
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

  it('waits for the price of every holding entered in shares', () => {
    const inShares = { ...holdings, SPTE: { kind: 'shares' as const, amount: 185 } };
    const noSpte = { ...prices, SPTE: null };
    // Unpriced shares would count as $0 and give the wrong trades, so there are none yet
    expect(makePlan({ ...base, holdings: inShares, tracksHoldings: true, prices: noSpte }))
      .toMatchObject({ status: 'needs-prices', unpriced: ['SPTE'], trades: [], net: 0 });
    // Rebalancing too, rather than saying nothing is owned
    expect(makePlan({ ...base, holdings: { SPTE: { kind: 'shares', amount: 185 } }, tracksHoldings: true, verb: 'rebal', prices: noSpte }).status)
      .toBe('needs-prices');
    // No amount yet: nothing to work out either way
    expect(makePlan({ ...base, amount: 0, holdings: inShares, tracksHoldings: true, prices: noSpte }).status).toBe('needs-amount');
    // Holdings switched off don't count
    expect(makePlan({ ...base, holdings: inShares, tracksHoldings: false, prices: noSpte }).status).toBe('ok');
    // Once the price arrives
    expect(makePlan({ ...base, holdings: inShares, tracksHoldings: true })).toMatchObject({ status: 'ok', unpriced: [] });

    expect(unpricedShares(inShares, noSpte)).toEqual(['SPTE']);
    expect(unpricedShares({ CASH: { kind: 'shares', amount: 5 }, X: { kind: 'shares', amount: 0 }, Y: { kind: 'dollars', amount: 5 } }, {})).toEqual([]);
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

  it('never leaves cash over with fractional shares', () => {
    const plan = makePlan({ ...base, holdings, tracksHoldings: true, sell: true });
    expect(plan.leftover).toBe(0);
    expect(plan.shortOfShare).toEqual([]);
  });
});

describe('makePlan with whole shares', () => {
  const whole = (input: Partial<PlanInput>) => {
    const plan = makePlan({ ...base, wholeShares: true, ...input });
    return { plan, trades: plan.trades.map(t => [t.action, t.symbol, t.shares, t.dollars]) };
  };

  it('rounds buys down, then spends what is left on whoever is furthest behind', () => {
    const { plan, trades } = whole({});
    // 24.2 / 26.9 / 9.5 shares round down to 24 / 26 / 9; the $59 left buys one more SPTE
    expect(trades).toEqual([['buy', 'SPUS', 24, 1238.88], ['buy', 'SPTE', 27, 1003.32], ['buy', 'SPWO', 9, 235.98]]);
    expect(plan.net).toBe(2478.18);
    expect(plan.leftover).toBe(21.82);
    expect(plan.leftover).toBeLessThan(prices.SPWO);
  });

  it('works with holdings, buying only what is behind', () => {
    const { plan, trades } = whole({ holdings, tracksHoldings: true });
    expect(trades).toEqual([['buy', 'SPTE', 60, 2229.6], ['buy', 'SPWO', 10, 262.2]]);
    expect(plan.leftover).toBe(8.2);
  });

  it('rounds sells up so the buys are always covered', () => {
    const { plan, trades } = whole({ holdings, tracksHoldings: true, sell: true });
    expect(trades).toEqual([['sell', 'SPUS', 9, 464.58], ['buy', 'SPTE', 72, 2675.52], ['buy', 'SPWO', 11, 288.42]]);
    expect(plan.leftover).toBe(0.64);
  });

  it('raises at least the amount asked for when taking money out', () => {
    const { plan, trades } = whole({ holdings, tracksHoldings: true, verb: 'out', amount: 1500 });
    expect(trades).toEqual([['sell', 'SPUS', 28, 1445.36], ['sell', 'SPWO', 3, 78.66]]);
    expect(-plan.net).toBeGreaterThanOrEqual(1500);
    expect(plan.leftover).toBe(24.02);
  });

  it('rebalances with whole shares, keeping the change as cash', () => {
    const { plan, trades } = whole({ holdings, tracksHoldings: true, verb: 'rebal' });
    expect(trades).toEqual([['sell', 'SPUS', 33, 1703.46], ['buy', 'SPTE', 45, 1672.2], ['buy', 'SPWO', 1, 26.22]]);
    expect(plan.leftover).toBe(5.04);
  });

  it('never sells more than you own', () => {
    const { trades } = whole({
      funds: [{ symbol: 'SPUS', target: 0 }, { symbol: 'SPTE', target: 100 }],
      holdings: { SPUS: { kind: 'shares', amount: 2.5 }, SPTE: { kind: 'shares', amount: 1 } },
      tracksHoldings: true,
      verb: 'rebal',
    });
    expect(trades[0]).toEqual(['sell', 'SPUS', 2.5, 129.05]);
  });

  it('says when the amount is too small for a single share', () => {
    const { plan } = whole({ amount: 20 });
    expect(plan.status).toBe('short-of-share');
    expect(plan.leftover).toBe(20);
    expect(plan.shortOfShare.map(s => s.symbol)).toEqual(['SPUS', 'SPTE', 'SPWO']);
  });

  it('lists funds that missed out on a share next to the ones that got one', () => {
    const { plan, trades } = whole({ amount: 60 });
    expect(trades).toEqual([['buy', 'SPUS', 1, 51.62]]);
    expect(plan.leftover).toBe(8.38);
    expect(plan.shortOfShare.map(s => s.symbol)).toEqual(['SPTE', 'SPWO']);
  });

  it('doesn’t sell for money nothing can use', () => {
    const ab = [{ symbol: 'A', target: 50 }, { symbol: 'B', target: 50 }];
    const held = { A: { kind: 'dollars' as const, amount: 1000 }, B: { kind: 'dollars' as const, amount: 900 } };
    // B's share costs $500 but only $50 needs moving: no trades rather than "sell 1 A, $100 left over"
    const rebal = whole({ funds: ab, holdings: held, tracksHoldings: true, verb: 'rebal', prices: { A: 100, B: 500 } });
    expect(rebal.plan.status).toBe('short-of-share');
    expect(rebal.trades).toEqual([]);
    // Cash held at 0% isn't "sold" just to sit as cash
    const cash = whole({
      funds: [{ symbol: 'A', target: 100 }, { symbol: 'CASH', target: 0 }],
      holdings: { CASH: { kind: 'dollars', amount: 300 }, A: { kind: 'shares', amount: 2 } },
      tracksHoldings: true,
      verb: 'rebal',
      prices: { A: 500 },
    });
    expect(cash.trades).toEqual([]);
  });

  it('keeps an expensive share rather than selling it to fund a much smaller trade', () => {
    const { plan, trades } = whole({
      funds: [{ symbol: 'P', target: 50 }, { symbol: 'Q', target: 50 }],
      holdings: { Q: { kind: 'dollars', amount: 700000 } },
      tracksHoldings: true,
      amount: 400000,
      sell: true,
      prices: { P: 1, Q: 700000 },
    });
    expect(trades).toEqual([['buy', 'P', 400000, 400000]]);
    expect(plan.leftover).toBe(0);
  });

  it('raises only what’s needed, in whole shares, when taking money out', () => {
    const abc = [{ symbol: 'A', target: 34 }, { symbol: 'B', target: 33 }, { symbol: 'C', target: 33 }];
    const held = Object.fromEntries(['A', 'B', 'C'].map(s => [s, { kind: 'dollars' as const, amount: 2000 }]));
    const { plan, trades } = whole({ funds: abc, holdings: held, tracksHoldings: true, verb: 'out', amount: 90, prices: { A: 200, B: 200, C: 200 } });
    expect(trades).toHaveLength(1);
    expect(-plan.net).toBe(200);
    expect(plan.leftover).toBe(110);
  });

  it('keeps sells whole when keeping a share back from selling everything', () => {
    const { trades } = whole({
      funds: [{ symbol: 'X', target: 0 }, { symbol: 'Y', target: 100 }],
      holdings: { X: { kind: 'shares', amount: 3 }, Y: { kind: 'dollars', amount: 100 } },
      tracksHoldings: true,
      verb: 'rebal',
      prices: { X: 0.7, Y: 1 },
    });
    expect(trades[0]).toEqual(['sell', 'X', 3, 2.1]);
  });

  it('keeps cash and unpriced funds in exact dollars', () => {
    const cash = whole({ funds: [{ symbol: 'SPUS', target: 98 }, { symbol: 'CASH', target: 2 }] });
    expect(cash.trades).toEqual([['buy', 'SPUS', 47, 2426.14], ['buy', 'CASH', 50, 50]]);
    const unpriced = whole({ prices: { SPUS: 51.62, SPTE: null, SPWO: 26.22 } });
    expect(unpriced.trades[1]).toEqual(['buy', 'SPTE', null, 1000]);
  });
});

describe('furthestOff', () => {
  const values = { SPUS: 12400, SPTE: 6900, SPWO: 2100 };

  it('finds the fund furthest from target when it is 5 or more points away', () => {
    expect(furthestOff(funds, values)).toMatchObject({ symbol: 'SPUS', targetPct: 50 });
    expect(furthestOff(funds, values)!.nowPct).toBeCloseTo(57.94, 2);
  });

  it('also counts a quarter of a small target (2.5 points for a 10% fund)', () => {
    expect(furthestOff(funds, { SPUS: 5100, SPTE: 4200, SPWO: 700 })).toMatchObject({ symbol: 'SPWO' });
    expect(furthestOff(funds, { SPUS: 5100, SPTE: 4100, SPWO: 800 })).toBeNull();
  });

  it('ignores gaps worth less than a $25 trade, and an empty portfolio', () => {
    expect(furthestOff(funds, { SPUS: 54, SPTE: 37, SPWO: 9 })).toBeNull();
    expect(furthestOff(funds, {})).toBeNull();
  });

  it('can check what is left after the trades', () => {
    const plan = makePlan({ ...base, holdings, tracksHoldings: true, amount: 500 });
    expect(furthestOff(funds, valuesAfter(values, plan.trades))).toMatchObject({ symbol: 'SPUS' });
    const enough = makePlan({ ...base, holdings, tracksHoldings: true, amount: 2500 });
    expect(furthestOff(funds, valuesAfter(values, enough.trades))).toBeNull();
  });

  it('gives no figures when a holding in shares has no price', () => {
    expect(heldValues({ X: { kind: 'shares', amount: 5 } }, {})).toBeNull();
    expect(heldValues(holdings, prices)).toEqual(values);
  });
});

describe('offTargets', () => {
  it('lists every fund that is well off, furthest first', () => {
    const three = [{ symbol: 'SPUS', target: 40 }, { symbol: 'SPTE', target: 40 }, { symbol: 'SPWO', target: 20 }];
    expect(offTargets(three, { SPUS: 6000, SPTE: 3000, SPWO: 1000 }).map(o => o.symbol)).toEqual(['SPUS', 'SPTE', 'SPWO']);
    expect(offTargets(three, { SPUS: 4000, SPTE: 4000, SPWO: 2000 })).toEqual([]);
  });
});
