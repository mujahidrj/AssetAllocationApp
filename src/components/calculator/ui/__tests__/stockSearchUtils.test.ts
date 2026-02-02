import { describe, it, expect } from 'vitest';
import { isUSTicker, isPrimaryTicker, getBaseTicker, isOption, isFutures } from '../stockSearchUtils';

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

  describe('isOption', () => {
    it('should return true for call options in description', () => {
      expect(isOption('AAPL', 'Apple Inc. CALL Option')).toBe(true);
      expect(isOption('MSFT', 'Microsoft CALL')).toBe(true);
    });

    it('should return true for put options in description', () => {
      expect(isOption('AAPL', 'Apple Inc. PUT Option')).toBe(true);
      expect(isOption('MSFT', 'Microsoft PUT')).toBe(true);
    });

    it('should return true for option keyword in description', () => {
      expect(isOption('AAPL', 'Apple Inc. Option')).toBe(true);
      expect(isOption('MSFT', 'Microsoft OPTION')).toBe(true);
    });

    it('should return true for option ticker patterns (YYMMDD + C/P + strike)', () => {
      // Standard option format: TICKER + YYMMDD + C/P + STRIKE
      expect(isOption('AAPL230120C00150000')).toBe(true); // Call option
      expect(isOption('AAPL230120P00150000')).toBe(true); // Put option
      expect(isOption('MSFT240315C00350000')).toBe(true); // Call option
      expect(isOption('TSLA231215P00200000')).toBe(true); // Put option
    });

    it('should return false for regular stocks', () => {
      expect(isOption('AAPL')).toBe(false);
      expect(isOption('MSFT')).toBe(false);
      expect(isOption('GOOGL')).toBe(false);
    });

    it('should return false for US share classes', () => {
      expect(isOption('BRK.A')).toBe(false);
      expect(isOption('BRK.B')).toBe(false);
      expect(isOption('GOOGL.A')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isOption('aapl230120c00150000')).toBe(true);
      expect(isOption('AAPL230120P00150000')).toBe(true);
      expect(isOption('AAPL', 'call option')).toBe(true);
      expect(isOption('AAPL', 'PUT OPTION')).toBe(true);
    });

    it('should return false for stocks with C or P in name but not option pattern', () => {
      expect(isOption('AAPLC')).toBe(false); // Too short, not option pattern
      expect(isOption('MSFTP')).toBe(false); // Too short, not option pattern
    });
  });

  describe('isFutures', () => {
    it('should return true for futures ending with =F', () => {
      expect(isFutures('ES=F')).toBe(true); // E-mini S&P 500
      expect(isFutures('NQ=F')).toBe(true); // E-mini Nasdaq
      expect(isFutures('CL=F')).toBe(true); // Crude oil
      expect(isFutures('GC=F')).toBe(true); // Gold
      expect(isFutures('SI=F')).toBe(true); // Silver
    });

    it('should return true for futures in description', () => {
      expect(isFutures('ES', 'E-mini S&P 500 FUTURE')).toBe(true);
      expect(isFutures('NQ', 'Nasdaq FUTURES Contract')).toBe(true);
      expect(isFutures('CL', 'Crude Oil FUTURE CONTRACT')).toBe(true);
    });

    it('should return true for common futures symbols', () => {
      expect(isFutures('ESF')).toBe(true); // E-mini S&P 500 futures
      expect(isFutures('NQF')).toBe(true); // E-mini Nasdaq futures
      expect(isFutures('CLF')).toBe(true); // Crude oil futures
      expect(isFutures('GCF')).toBe(true); // Gold futures
    });

    it('should return false for regular stocks', () => {
      expect(isFutures('AAPL')).toBe(false);
      expect(isFutures('MSFT')).toBe(false);
      expect(isFutures('GOOGL')).toBe(false);
    });

    it('should return false for Frankfurt exchange (.F)', () => {
      expect(isFutures('MSF.F')).toBe(false); // Frankfurt exchange, not futures
      expect(isFutures('TEST.F')).toBe(false); // Frankfurt exchange, not futures
    });

    it('should handle case insensitivity', () => {
      expect(isFutures('es=f')).toBe(true);
      expect(isFutures('ES=F')).toBe(true);
      expect(isFutures('ES', 'future contract')).toBe(true);
      expect(isFutures('ES', 'FUTURES')).toBe(true);
    });

    it('should return false for stocks with F suffix that are not futures', () => {
      expect(isFutures('AAPLF')).toBe(false); // Not a known futures symbol
      expect(isFutures('MSFTF')).toBe(false); // Not a known futures symbol
    });
  });
});
