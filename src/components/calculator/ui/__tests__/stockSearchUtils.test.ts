import { describe, it, expect } from 'vitest';
import { isUSTicker, isPrimaryTicker, getBaseTicker } from '../stockSearchUtils';

describe('stockSearchUtils', () => {
  describe('isUSTicker', () => {
    it('should return true for US stocks without suffix', () => {
      expect(isUSTicker('AAPL')).toBe(true);
      expect(isUSTicker('MSFT')).toBe(true);
      expect(isUSTicker('GOOGL')).toBe(true);
    });

    it('should return true for US share class suffixes', () => {
      expect(isUSTicker('BRK.A')).toBe(true);
      expect(isUSTicker('BRK.B')).toBe(true);
      expect(isUSTicker('GOOGL.A')).toBe(true);
    });

    it('should return false for Frankfurt exchange (.F)', () => {
      expect(isUSTicker('MSF.F')).toBe(false);
      expect(isUSTicker('TEST.F')).toBe(false);
      expect(isUSTicker('msf.f')).toBe(false); // Case insensitive
    });

    it('should return false for other non-US exchange suffixes', () => {
      expect(isUSTicker('AAPL.TO')).toBe(false); // Toronto
      expect(isUSTicker('GOOGL.L')).toBe(false); // London
      expect(isUSTicker('TEST.HK')).toBe(false); // Hong Kong
      expect(isUSTicker('TEST.MX')).toBe(false); // Mexico
      expect(isUSTicker('TEST.SZ')).toBe(false); // China
      expect(isUSTicker('TEST.T')).toBe(false); // Tokyo
      expect(isUSTicker('TEST.DE')).toBe(false); // Germany
    });

    it('should handle case insensitivity', () => {
      expect(isUSTicker('brk.a')).toBe(true);
      expect(isUSTicker('BRK.A')).toBe(true);
      expect(isUSTicker('test.f')).toBe(false);
      expect(isUSTicker('TEST.F')).toBe(false);
    });

    it('should prioritize non-US suffix check over US share class check', () => {
      // .F should be filtered even though it's a single letter (Frankfurt, not US share class)
      expect(isUSTicker('MSF.F')).toBe(false);
      // But .A should be allowed (US share class)
      expect(isUSTicker('BRK.A')).toBe(true);
    });
  });

  describe('isPrimaryTicker', () => {
    it('should return true for tickers without suffix', () => {
      expect(isPrimaryTicker('AAPL')).toBe(true);
      expect(isPrimaryTicker('MSFT')).toBe(true);
    });

    it('should return true for US share class suffixes', () => {
      expect(isPrimaryTicker('BRK.A')).toBe(true);
      expect(isPrimaryTicker('BRK.B')).toBe(true);
    });

    it('should return false for exchange suffixes', () => {
      expect(isPrimaryTicker('AAPL.TO')).toBe(false);
      expect(isPrimaryTicker('GOOGL.L')).toBe(false);
      expect(isPrimaryTicker('MSF.F')).toBe(false);
      expect(isPrimaryTicker('TEST.SZ')).toBe(false);
      expect(isPrimaryTicker('TEST.HK')).toBe(false);
    });
  });

  describe('getBaseTicker', () => {
    it('should return the base ticker without suffix', () => {
      expect(getBaseTicker('AAPL')).toBe('AAPL');
      expect(getBaseTicker('BRK.A')).toBe('BRK');
      expect(getBaseTicker('GOOGL.TO')).toBe('GOOGL');
      expect(getBaseTicker('MSF.F')).toBe('MSF');
    });

    it('should handle tickers with multiple dots', () => {
      expect(getBaseTicker('TEST.TWO')).toBe('TEST');
    });

    it('should handle edge cases', () => {
      // Ticker starting with dot (edge case) - dotIndex is 0, condition fails, returns original
      expect(getBaseTicker('.TEST')).toBe('.TEST');
      // Empty string - dotIndex is -1, condition fails, returns original
      expect(getBaseTicker('')).toBe('');
    });
  });
});
