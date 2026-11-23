import { describe, it, expect } from 'vitest';
import { combinePortfolios } from '../combined';
import { emptyPortfolio, type Fund, type Holding, type Portfolio } from '../model';

const P = (id: string, name: string, funds: Fund[], holdings: Record<string, Holding>, tracksHoldings = true): Portfolio =>
  ({ ...emptyPortfolio(id, name), funds, holdings, tracksHoldings });

describe('combinePortfolios', () => {
  const portfolios = [
    P('a', 'Roth IRA', [{ symbol: 'SPUS', target: 60 }, { symbol: 'SPWO', target: 40 }], {
      SPUS: { kind: 'dollars', amount: 9000 },
      SPWO: { kind: 'dollars', amount: 1000 },
    }),
    P('b', 'HSA', [{ symbol: 'SPUS', target: 50 }, { symbol: 'CASH', target: 50 }], {
      SPUS: { kind: 'shares', amount: 10 },
      USD: { kind: 'dollars', amount: 500 },
    }),
    P('c', '401(k)', [{ symbol: 'VTI', target: 100 }], {}),
    P('d', '', [{ symbol: 'VTI', target: 80 }], { VTI: { kind: 'dollars', amount: 100 } }),
  ];
  const result = combinePortfolios(portfolios, { SPUS: 50 });

  it('adds up portfolios with holdings and says which were left out and why', () => {
    expect(result.total).toBe(11000);
    expect(result.portfolios.map(p => [p.name, p.value, +p.share.toFixed(2)])).toEqual([['Roth IRA', 10000, 90.91], ['HSA', 1000, 9.09]]);
    expect(result.excluded).toEqual([
      { id: 'c', name: '401(k)', reason: 'no-holdings' },
      { id: 'd', name: 'My portfolio', reason: 'targets-off' },
    ]);
  });

  it('weights each portfolio’s targets by its value, and treats CASH and USD as one', () => {
    const row = (s: string) => {
      const f = result.funds.find(x => x.symbol === s)!;
      return [+f.value.toFixed(2), +f.nowPct.toFixed(2), +f.targetPct.toFixed(2), +f.short.toFixed(2)];
    };
    // SPUS target: 60% of $10,000 + 50% of $1,000 = $6,500 of $11,000
    expect(row('SPUS')).toEqual([9500, 86.36, 59.09, -3000]);
    expect(row('SPWO')).toEqual([1000, 9.09, 36.36, 3000]);
    expect(row('CASH')).toEqual([500, 4.55, 4.55, 0]);
  });

  it('points new money at what is furthest behind overall, and where it can go', () => {
    expect(result.behind.map(f => [f.symbol, f.targetedIn.map(t => t.name)])).toEqual([['SPWO', ['Roth IRA']]]);
  });

  it('is empty when nothing has holdings', () => {
    const none = combinePortfolios([P('x', 'X', [{ symbol: 'VTI', target: 100 }], {}, false)], {});
    expect(none.total).toBe(0);
    expect(none.funds).toEqual([]);
    expect(none.behind).toEqual([]);
  });
});
