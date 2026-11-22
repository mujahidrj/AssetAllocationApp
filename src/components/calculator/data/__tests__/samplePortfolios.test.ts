import { describe, it, expect } from 'vitest';
import { samplePortfolios } from '../samplePortfolios';

describe('samplePortfolios', () => {
  it.each(samplePortfolios.map(p => [p.name, p] as const))('%s adds up to 100%%', (_name, portfolio) => {
    const total = portfolio.stocks.reduce((sum, stock) => sum + stock.percentage, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it.each(samplePortfolios.map(p => [p.name, p] as const))('%s lists each fund once', (_name, portfolio) => {
    const names = portfolio.stocks.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
