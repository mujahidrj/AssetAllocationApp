import { describe, it, expect } from 'vitest';
import {
  isCash,
  holdingValue,
  portfolioValue,
  splitByTarget,
  rebalance,
  planDeposit,
  planWithdrawal,
  targetsAddUp,
  targetTotal,
} from '../portfolioMath';
import type { CurrentPosition, Stock } from '../../components/calculator/types';

const prices = { SPUS: 51.62, SPTE: 37.16, SPWO: 26.22 };
const mix: Stock[] = [
  { name: 'SPUS', percentage: 50 },
  { name: 'SPTE', percentage: 40 },
  { name: 'SPWO', percentage: 10 },
];
const targets = { SPUS: 50, SPTE: 40, SPWO: 10 };
const holdings = { SPUS: 12400, SPTE: 6900, SPWO: 2100 };

describe('basics', () => {
  it('recognises cash', () => {
    expect(isCash('CASH')).toBe(true);
    expect(isCash('usd')).toBe(true);
    expect(isCash('SPUS')).toBe(false);
  });

  it('totals targets', () => {
    expect(targetTotal(mix)).toBe(100);
    expect(targetsAddUp(mix)).toBe(true);
    expect(targetsAddUp([{ name: 'A', percentage: 99.5 }])).toBe(false);
    expect(targetsAddUp([{ name: 'A', percentage: 33.333 }, { name: 'B', percentage: 66.667 }])).toBe(true);
  });

  it('values holdings entered as dollars or shares', () => {
    expect(holdingValue({ symbol: 'SPUS', inputType: 'value', value: 516.2 }, prices).shares).toBeCloseTo(10, 10);
    expect(holdingValue({ symbol: 'SPUS', inputType: 'shares', shares: 10 }, prices).value).toBeCloseTo(516.2, 10);
    expect(holdingValue({ symbol: 'CASH', inputType: 'value', value: 50 }, {})).toEqual({ value: 50, shares: 50 });
    // No price: shares can't be valued
    expect(holdingValue({ symbol: 'XYZ', inputType: 'shares', shares: 5 }, {})).toEqual({ value: 0, shares: 5 });
    expect(holdingValue({ symbol: 'XYZ', inputType: 'value', value: 80 }, { XYZ: null })).toEqual({ value: 80, shares: 0 });
  });

  it('adds up a portfolio', () => {
    const positions: CurrentPosition[] = [
      { symbol: 'SPUS', inputType: 'value', value: 12400 },
      { symbol: 'CASH', inputType: 'shares', shares: 100 },
    ];
    expect(portfolioValue(positions, prices)).toBe(12500);
  });
});

describe('splitByTarget', () => {
  it('matches the live app for $2,500 at 50/40/10', () => {
    const result = splitByTarget(2500, mix, prices);
    expect(result.map(r => r.amount)).toEqual(['1250.00', '1000.00', '250.00']);
    expect(result.map(r => r.shares!.toFixed(4))).toEqual(['24.2154', '26.9107', '9.5347']);
  });

  it('prices cash at $1 and leaves shares blank without a price', () => {
    const result = splitByTarget(100, [{ name: 'CASH', percentage: 50 }, { name: 'XYZ', percentage: 50 }], { XYZ: null });
    expect(result[0]).toMatchObject({ amount: '50.00', currentPrice: 1, shares: 50 });
    expect(result[1]).toMatchObject({ amount: '50.00', currentPrice: null, shares: undefined });
  });
});

describe('rebalance', () => {
  const positions: CurrentPosition[] = [
    { symbol: 'SPUS', inputType: 'value', value: 12400 },
    { symbol: 'SPTE', inputType: 'value', value: 6900 },
    { symbol: 'SPWO', inputType: 'value', value: 2100 },
  ];

  it('returns null with nothing to rebalance', () => {
    expect(rebalance([], mix, prices)).toBeNull();
    expect(rebalance(positions, [], prices)).toBeNull();
    expect(rebalance([{ symbol: 'SPUS', inputType: 'value', value: 0 }], mix, prices)).toBeNull();
  });

  it('lists sells first, then buys', () => {
    const result = rebalance(positions, mix, prices)!;
    expect(result.map(r => [r.name, r.action, Math.round(r.difference * 100) / 100])).toEqual([
      ['SPUS', 'sell', -1700],
      ['SPTE', 'buy', 1660],
      ['SPWO', 'buy', 40],
    ]);
    expect(result[0].sharesToTrade).toBeCloseTo(1700 / 51.62, 8);
    expect(result[0].currentPercentage).toBeCloseTo(57.94, 2);
    expect(result[1].amount).toBe('8560.00');
  });

  it('holds funds within a cent of target', () => {
    const exact: CurrentPosition[] = [
      { symbol: 'SPUS', inputType: 'value', value: 50 },
      { symbol: 'SPTE', inputType: 'value', value: 40 },
      { symbol: 'SPWO', inputType: 'value', value: 10.005 },
    ];
    const result = rebalance(exact, mix, prices)!;
    expect(result.every(r => r.action === 'hold')).toBe(true);
    expect(result.every(r => r.sharesToTrade === 0)).toBe(true);
  });

  it('sells funds held but not in the targets in full, and buys targets not held', () => {
    const result = rebalance(
      [{ symbol: 'MSFT', inputType: 'shares', shares: 2 }, { symbol: 'CASH', inputType: 'value', value: 31.0 }],
      [{ name: 'SPUS', percentage: 100 }],
      { ...prices, MSFT: 484.52 }
    )!;
    expect(result.map(r => [r.name, r.action])).toEqual([['MSFT', 'sell'], ['CASH', 'sell'], ['SPUS', 'buy']]);
    expect(result[0]).toMatchObject({ percentage: 0, amount: '0.00', targetValue: 0, sharesToTrade: 2 });
    expect(result[1]).toMatchObject({ currentPrice: 1, sharesToTrade: 31 });
    expect(result[2].difference).toBeCloseTo(1000.04, 6);
  });

  it('trades no shares when a price is missing', () => {
    const result = rebalance(
      [{ symbol: 'SPUS', inputType: 'value', value: 100 }],
      [{ name: 'SPUS', percentage: 50 }, { name: 'NEW', percentage: 50 }],
      { SPUS: 51.62, NEW: null }
    )!;
    const newFund = result.find(r => r.name === 'NEW')!;
    expect(newFund).toMatchObject({ action: 'buy', sharesToTrade: 0, currentPrice: null, shares: undefined });
  });
});

describe('planDeposit', () => {
  it('splits by target when nothing is held', () => {
    expect(planDeposit(2500, {}, targets)).toEqual({ SPUS: 1250, SPTE: 1000, SPWO: 250 });
  });

  it('buys only what is behind target, without selling', () => {
    expect(planDeposit(2500, holdings, targets)).toEqual({ SPUS: 0, SPTE: 2254.24, SPWO: 245.76 });
  });

  it('spreads money left after closing every gap by target', () => {
    const plan = planDeposit(10000, holdings, targets);
    // After: total 31,400 → SPUS 15,700 / SPTE 12,560 / SPWO 3,140
    expect(plan).toEqual({ SPUS: 3300, SPTE: 5660, SPWO: 1040 });
  });

  it('buys and sells to match when selling is allowed', () => {
    expect(planDeposit(2500, holdings, targets, { sell: true })).toEqual({ SPUS: -450, SPTE: 2660, SPWO: 290 });
  });

  it('always sums exactly to the amount', () => {
    const plan = planDeposit(1000, { A: 1, B: 2, C: 3 }, { A: 33.3, B: 33.3, C: 33.4 });
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 10);
  });
});

describe('planWithdrawal', () => {
  it('takes from what is furthest over target first', () => {
    expect(planWithdrawal(1500, holdings, targets)).toEqual({ SPUS: -1435.55, SPTE: 0, SPWO: -64.45 });
  });

  it('never sells more than is held', () => {
    const plan = planWithdrawal(50000, holdings, targets);
    expect(plan).toEqual({ SPUS: -12400, SPTE: -6900, SPWO: -2100 });
  });

  it('also takes from funds that are no longer in the targets', () => {
    const plan = planWithdrawal(500, { ...holdings, MSFT: 1000 }, targets);
    expect(plan.MSFT).toBeLessThan(0);
    expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBeCloseTo(-500, 10);
  });
});
