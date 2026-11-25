import { describe, it, expect } from 'vitest';
import { drift, driftWords, formatAmountInput, money, pct1, pctTarget, priceDate, priceTime, shares } from '../format';

describe('format', () => {
  it('formats money with a true minus sign', () => {
    expect(money(1250)).toBe('$1,250.00');
    expect(money(-450)).toBe('−$450.00');
    expect(money(0.004)).toBe('$0.00');
  });

  it('formats shares, percentages and drift', () => {
    expect(shares(24.21541)).toBe('24.2154');
    expect(pct1(57.943)).toBe('57.9%');
    expect(pctTarget(33.333333)).toBe('33.33%');
    expect(pctTarget(50)).toBe('50%');
    expect(drift(7.94)).toBe('+7.9');
    expect(drift(-7.8)).toBe('−7.8');
    expect(drift(0.04)).toBe('0.0');
    // In words, the same in every view
    expect(driftWords(16)).toBe('16 pts over');
    expect(driftWords(-7.84, true)).toBe('7.8 pts under target');
    expect(driftWords(1)).toBe('1 pt over');
    expect(driftWords(0.04, true)).toBe('on target');
  });

  it('formats a typed amount, keeping cents only when typed', () => {
    expect(formatAmountInput(2500)).toBe('2,500');
    expect(formatAmountInput(2500.5)).toBe('2,500.50');
  });

  it('says when a price is from, in market time', () => {
    const sunday = new Date('2026-11-22T19:00:00Z');
    expect(priceTime('2026-11-20T21:00:03.000Z', sunday)).toBe('Last close Fri Nov 20');
    expect(priceTime('2026-11-20T19:41:00.000Z', new Date('2026-11-20T20:00:00Z'))).toBe('As of 2:41 PM ET');
    expect(priceTime(null)).toBeNull();
    expect(priceTime('not a date')).toBeNull();
  });
});

describe('priceDate', () => {
  it('shows the date a price was typed, and its age after a week', () => {
    const now = new Date('2026-11-22T17:00:00Z').getTime();
    expect(priceDate('2026-11-20T17:00:00Z', now)).toBe('Nov 20');
    expect(priceDate('2026-11-13T17:00:00Z', now)).toBe('Nov 13 (9 days old)');
    expect(priceDate('not a date', now)).toBe('');
  });
});
