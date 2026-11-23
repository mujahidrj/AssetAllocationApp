import { describe, it, expect } from 'vitest';
import { displayName, emptyPortfolio, isRetirement, nextPortfolioName, sameMix, sentenceName } from '../model';

describe('portfolio names', () => {
  it('reads naturally in the sentence', () => {
    expect(sentenceName('')).toBe('my portfolio');
    expect(sentenceName('  ')).toBe('my portfolio');
    expect(sentenceName('Roth IRA')).toBe('my Roth IRA');
    expect(sentenceName("Sam's IRA")).toBe("Sam's IRA");
    expect(sentenceName('My 401(k)')).toBe('my 401(k)');
    expect(sentenceName('Our joint account')).toBe('our joint account');
    expect(sentenceName('The kids’ fund')).toBe('the kids’ fund');
  });

  it('shows "My portfolio" in lists when unnamed', () => {
    expect(displayName({ name: '' })).toBe('My portfolio');
    expect(displayName({ name: 'HSA' })).toBe('HSA');
  });

  it('numbers new portfolios without repeating a name', () => {
    expect(nextPortfolioName([emptyPortfolio('a')])).toBe('Portfolio 2');
    expect(nextPortfolioName([emptyPortfolio('a'), emptyPortfolio('b', 'Portfolio 3')])).toBe('Portfolio 4');
  });

  it('compares mixes ignoring order and 0% funds', () => {
    expect(sameMix(
      [{ symbol: 'A', target: 60 }, { symbol: 'B', target: 40 }, { symbol: 'C', target: 0 }],
      [{ symbol: 'B', target: 40 }, { symbol: 'A', target: 60 }],
    )).toBe(true);
    expect(sameMix([{ symbol: 'A', target: 60 }], [{ symbol: 'A', target: 61 }])).toBe(false);
  });
});

describe('isRetirement', () => {
  it('guesses from the name unless the person said', () => {
    expect(isRetirement({ name: 'Roth IRA' })).toBe(true);
    expect(isRetirement({ name: "Sam's 401(k)" })).toBe(true);
    expect(isRetirement({ name: 'HSA' })).toBe(true);
    expect(isRetirement({ name: 'Brokerage' })).toBe(false);
    expect(isRetirement({ name: 'Brokerage', retirement: true })).toBe(true);
    expect(isRetirement({ name: 'Roth IRA', retirement: false })).toBe(false);
  });
});
