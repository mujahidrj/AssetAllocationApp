/**
 * All portfolios as one: what you own across every portfolio that has holdings,
 * against a combined target. Each portfolio's targets count in proportion to its
 * value, so a $150k 401(k) weighs ten times as much as a $15k HSA.
 */
import { displayName, isCashSymbol, type Fund, type Portfolio } from './model';
import { holdingDollars, type PriceMap } from './plan';

export interface CombinedFund {
  symbol: string;
  name?: string;
  value: number;
  nowPct: number;
  targetPct: number;
  /** nowPct − targetPct */
  drift: number;
  /** Dollars short of target (positive when behind). */
  short: number;
  /** Included portfolios that have this fund as a target above 0%. */
  targetedIn: Array<{ id: string; name: string }>;
}

export interface CombinedPortfolio {
  id: string;
  name: string;
  value: number;
  share: number;
}

export interface Combined {
  total: number;
  funds: CombinedFund[];
  portfolios: CombinedPortfolio[];
  /** Portfolios left out, and why. */
  excluded: Array<{ id: string; name: string; reason: 'no-holdings' | 'targets-off' }>;
  /** Funds furthest behind overall, biggest dollar gap first. */
  behind: CombinedFund[];
}

const CASH = 'CASH';
const key = (symbol: string) => (isCashSymbol(symbol) ? CASH : symbol);

export function combinePortfolios(portfolios: Portfolio[], prices: PriceMap): Combined {
  const included: Array<{ p: Portfolio; value: number; values: Record<string, number> }> = [];
  const excluded: Combined['excluded'] = [];

  portfolios.forEach(p => {
    const values: Record<string, number> = {};
    if (p.tracksHoldings) {
      Object.entries(p.holdings).forEach(([s, h]) => {
        const v = holdingDollars(s, h, prices);
        if (v > 0) values[key(s)] = (values[key(s)] ?? 0) + v;
      });
    }
    const value = Object.values(values).reduce((a, b) => a + b, 0);
    const targetTotal = p.funds.reduce((sum, f) => sum + f.target, 0);
    if (value <= 0) excluded.push({ id: p.id, name: displayName(p), reason: 'no-holdings' });
    else if (Math.abs(targetTotal - 100) > 0.01) excluded.push({ id: p.id, name: displayName(p), reason: 'targets-off' });
    else included.push({ p, value, values });
  });

  const total = included.reduce((sum, x) => sum + x.value, 0);
  const bySymbol = new Map<string, { name?: string; value: number; targetDollars: number; targetedIn: CombinedFund['targetedIn'] }>();
  const entry = (symbol: string, fund?: Fund) => {
    let e = bySymbol.get(symbol);
    if (!e) { e = { value: 0, targetDollars: 0, targetedIn: [] }; bySymbol.set(symbol, e); }
    if (!e.name && fund?.name) e.name = fund.name;
    return e;
  };

  included.forEach(({ p, value, values }) => {
    p.funds.forEach(f => {
      const e = entry(key(f.symbol), f);
      e.targetDollars += (f.target / 100) * value;
      if (f.target > 0 && !e.targetedIn.some(t => t.id === p.id)) e.targetedIn.push({ id: p.id, name: displayName(p) });
    });
    Object.entries(values).forEach(([s, v]) => { entry(s, p.funds.find(f => key(f.symbol) === s)).value += v; });
  });

  const funds: CombinedFund[] = total > 0
    ? [...bySymbol.entries()].map(([symbol, e]) => {
        const nowPct = (e.value / total) * 100;
        const targetPct = (e.targetDollars / total) * 100;
        return {
          symbol,
          ...(e.name ? { name: e.name } : {}),
          value: e.value,
          nowPct,
          targetPct,
          drift: nowPct - targetPct,
          short: e.targetDollars - e.value,
          targetedIn: e.targetedIn,
        };
      }).filter(f => f.value > 0.005 || f.targetPct > 0.005)
        .sort((a, b) => b.targetPct - a.targetPct || b.value - a.value)
    : [];

  return {
    total,
    funds,
    portfolios: included.map(({ p, value }) => ({ id: p.id, name: displayName(p), value, share: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
    excluded,
    behind: funds.filter(f => f.short >= 1 && f.targetedIn.length > 0).sort((a, b) => b.short - a.short).slice(0, 3),
  };
}

