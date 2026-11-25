import { describe, it, expect } from 'vitest';
import { makePlan } from '../plan';
import { cheapestShort, sharesText, shortList, tradeSum, tradesCsv, tradesText } from '../tradeText';

const funds = [{ symbol: 'SPUS', target: 50 }, { symbol: 'SPTE', target: 40 }, { symbol: 'SPWO', target: 10 }];
const prices = { SPUS: 51.62, SPTE: 37.16, SPWO: 26.22 };
const base = { funds, holdings: {}, tracksHoldings: false, verb: 'add' as const, amount: 2500, sell: false, prices };

describe('trade text', () => {
  it('writes whole share counts without decimals', () => {
    expect(sharesText(5, true)).toBe('5 shares');
    expect(sharesText(1, true)).toBe('1 share');
    expect(sharesText(2.5, true)).toBe('2.5000 shares');
    expect(sharesText(5)).toBe('5.0000 shares');
  });

  it('shows what was spent of the amount when whole shares leave cash over', () => {
    expect(tradeSum(makePlan({ ...base, wholeShares: true }))).toBe('$2,478.18 of $2,500.00');
    expect(tradeSum(makePlan(base))).toBe('$2,500.00');
  });

  it('adds the cash left over, and what it could not buy, to the copied text', () => {
    const plan = makePlan({ ...base, amount: 60, wholeShares: true });
    expect(tradesText(plan, null, true)).toBe([
      'Buy SPUS $51.62 · 1 share',
      'Cash left over: $8.38 (not enough for 1 share of SPTE at $37.16, SPWO at $26.22)',
    ].join('\n'));
    expect(shortList(plan.shortOfShare)).toBe('SPTE ($37.16) and SPWO ($26.22)');
    expect(cheapestShort(plan.shortOfShare)?.symbol).toBe('SPWO');
  });

  it('marks cash as cash, and writes whole shares plainly in the CSV', () => {
    const plan = makePlan({ ...base, funds: [{ symbol: 'SPUS', target: 98 }, { symbol: 'CASH', target: 2 }], wholeShares: true });
    expect(tradesText(plan, null, true).split('\n')).toContain('Buy CASH $50.00');
    expect(tradesCsv(plan.trades)).toBe('Action,Symbol,Dollars,Shares,Price\nBuy,SPUS,2426.14,47,51.62\nBuy,CASH,50.00,,1.00');
  });

  it('calls the extra from whole-share sells "extra cash raised" when taking money out', () => {
    const holdings = { SPUS: { kind: 'dollars' as const, amount: 12400 }, SPTE: { kind: 'dollars' as const, amount: 6900 }, SPWO: { kind: 'dollars' as const, amount: 2100 } };
    const plan = makePlan({ ...base, holdings, tracksHoldings: true, verb: 'out', amount: 1500, wholeShares: true });
    expect(tradesText(plan, null, true, true)).toContain('Extra cash raised: $24.02 (shares are whole)');
  });
});
