import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => `${collection}/${id}`),
  getDoc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import {
  fundsFromStocks,
  holdingsFromPositions,
  loadCloudPortfolio,
  loadDevicePortfolio,
  positionsFromHoldings,
  saveCloudPortfolio,
  saveDevicePortfolio,
  stocksFromFunds,
} from '../storage';

const snap = (data: Record<string, unknown> | null) => ({ exists: () => data !== null, data: () => data ?? undefined });

describe('conversions', () => {
  it('round-trips the mix', () => {
    const stocks = [{ name: 'SPUS', percentage: 50, companyName: 'SP Funds S&P 500' }, { name: 'SPTE', percentage: 50 }];
    const funds = fundsFromStocks(stocks);
    expect(funds).toEqual([{ symbol: 'SPUS', target: 50, name: 'SP Funds S&P 500' }, { symbol: 'SPTE', target: 50 }]);
    expect(stocksFromFunds(funds)).toEqual(stocks);
  });

  it('round-trips holdings in dollars and shares', () => {
    const positions = [
      { symbol: 'SPUS', inputType: 'value' as const, value: 12400 },
      { symbol: 'MSFT', inputType: 'shares' as const, shares: 2 },
    ];
    const holdings = holdingsFromPositions(positions);
    expect(holdings).toEqual({ SPUS: { kind: 'dollars', amount: 12400 }, MSFT: { kind: 'shares', amount: 2 } });
    expect(positionsFromHoldings(holdings)).toEqual(positions);
  });
});

describe('device storage', () => {
  it('returns null when nothing was ever saved', () => {
    expect(loadDevicePortfolio()).toBeNull();
  });

  it('saves and loads', () => {
    const portfolio = { funds: [{ symbol: 'VTI', target: 100 }], holdings: { VTI: { kind: 'dollars' as const, amount: 10 } }, tracksHoldings: true };
    saveDevicePortfolio(portfolio);
    expect(loadDevicePortfolio()).toEqual(portfolio);
  });

  it('picks up what the previous screen saved', () => {
    window.localStorage.setItem('assetAllocation.guest.v1', JSON.stringify({
      stocks: [{ name: 'SPUS', percentage: 100 }],
      positions: [{ symbol: 'SPUS', inputType: 'value', value: 500 }],
    }));
    expect(loadDevicePortfolio()).toEqual({
      funds: [{ symbol: 'SPUS', target: 100 }],
      holdings: { SPUS: { kind: 'dollars', amount: 500 } },
      tracksHoldings: true,
    });
  });

  it('drops malformed entries', () => {
    window.localStorage.setItem('assetAllocation.portfolio.v2', JSON.stringify({
      funds: [{ symbol: 'OK', target: 100 }, { symbol: 'BAD', target: 'x' }],
      holdings: { OK: { kind: 'dollars', amount: 1 }, BAD: { kind: 'euros', amount: 1 } },
      tracksHoldings: 'yes',
    }));
    expect(loadDevicePortfolio()).toEqual({
      funds: [{ symbol: 'OK', target: 100 }],
      holdings: { OK: { kind: 'dollars', amount: 1 } },
      tracksHoldings: false,
    });
  });
});

describe('Google account storage', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockReset();
    vi.mocked(setDoc).mockClear();
  });

  it('returns null for a new account', async () => {
    vi.mocked(getDoc).mockResolvedValue(snap(null) as never);
    expect(await loadCloudPortfolio('u1')).toBeNull();
  });

  it('reads the mix and holdings saved by the previous screen', async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: unknown) =>
      ref === 'userStocks/u1'
        ? snap({ stocks: [{ name: 'SPUS', percentage: 100 }] })
        : snap({ positions: [{ symbol: 'SPUS', inputType: 'shares', shares: 3 }] })) as never);
    expect(await loadCloudPortfolio('u1')).toEqual({
      funds: [{ symbol: 'SPUS', target: 100 }],
      holdings: { SPUS: { kind: 'shares', amount: 3 } },
      tracksHoldings: true,
    });
  });

  it('remembers the holdings switch', async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: unknown) =>
      ref === 'userStocks/u1'
        ? snap({ stocks: [] })
        : snap({ positions: [{ symbol: 'SPUS', inputType: 'value', value: 5 }], tracksHoldings: false })) as never);
    expect((await loadCloudPortfolio('u1'))?.tracksHoldings).toBe(false);
  });

  it('saves to the same documents', async () => {
    await saveCloudPortfolio('u1', {
      funds: [{ symbol: 'SPUS', target: 100, name: 'SP Funds' }],
      holdings: { SPUS: { kind: 'dollars', amount: 10 } },
      tracksHoldings: true,
    });
    expect(setDoc).toHaveBeenCalledWith('userStocks/u1', { stocks: [{ name: 'SPUS', percentage: 100, companyName: 'SP Funds' }] });
    expect(setDoc).toHaveBeenCalledWith('userPositions/u1', {
      positions: [{ symbol: 'SPUS', inputType: 'value', value: 10 }],
      tracksHoldings: true,
    });
  });
});
