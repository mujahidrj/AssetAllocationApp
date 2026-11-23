import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => `${collection}/${id}`),
  getDoc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import { emptyPortfolio, type Workspace } from '../model';
import {
  fundsFromStocks,
  holdingsFromPositions,
  loadCloudWorkspace,
  loadDeviceWorkspace,
  mergeDeviceIntoAccount,
  positionsFromHoldings,
  saveCloudWorkspace,
  saveDeviceWorkspace,
  stocksFromFunds,
} from '../storage';

const snap = (data: Record<string, unknown> | null) => ({ exists: () => data !== null, data: () => data ?? undefined });

const roth = { ...emptyPortfolio('r1', 'Roth IRA'), funds: [{ symbol: 'SPUS', target: 100, name: 'SP Funds' }], holdings: { SPUS: { kind: 'dollars' as const, amount: 10 } }, tracksHoldings: true, sell: true, templateId: 'Vanguard 3-Fund Portfolio' };
const taxable = { ...emptyPortfolio('t1', 'Taxable'), funds: [{ symbol: 'VTI', target: 100 }] };
const two: Workspace = { portfolios: [roth, taxable], activeId: 't1' };

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
    expect(loadDeviceWorkspace()).toBeNull();
  });

  it('saves and loads several portfolios', () => {
    saveDeviceWorkspace(two);
    expect(loadDeviceWorkspace()).toEqual(two);
  });

  it('picks up the single portfolio the first version of this screen saved', () => {
    window.localStorage.setItem('assetAllocation.portfolio.v2', JSON.stringify({
      funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false,
    }));
    expect(loadDeviceWorkspace()).toEqual({
      portfolios: [{ ...emptyPortfolio('p1'), funds: [{ symbol: 'VTI', target: 100 }] }],
      activeId: 'p1',
    });
  });

  it('picks up what the previous screen saved', () => {
    window.localStorage.setItem('assetAllocation.guest.v1', JSON.stringify({
      stocks: [{ name: 'SPUS', percentage: 100 }],
      positions: [{ symbol: 'SPUS', inputType: 'value', value: 500 }],
    }));
    expect(loadDeviceWorkspace()).toEqual({
      portfolios: [{ ...emptyPortfolio('p1'), funds: [{ symbol: 'SPUS', target: 100 }], holdings: { SPUS: { kind: 'dollars', amount: 500 } }, tracksHoldings: true }],
      activeId: 'p1',
    });
  });

  it('drops malformed entries and fixes a missing open portfolio', () => {
    window.localStorage.setItem('assetAllocation.portfolios.v3', JSON.stringify({
      portfolios: [{ id: 'a', name: 'A', funds: [{ symbol: 'OK', target: 100 }, { symbol: 'BAD', target: 'x' }], holdings: { OK: { kind: 'euros', amount: 1 } } }],
      activeId: 'gone',
    }));
    expect(loadDeviceWorkspace()).toEqual({
      portfolios: [{ ...emptyPortfolio('a', 'A'), funds: [{ symbol: 'OK', target: 100 }] }],
      activeId: 'a',
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
    expect(await loadCloudWorkspace('u1')).toBeNull();
  });

  it('turns an account saved by the previous screen into one portfolio', async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: unknown) =>
      ref === 'userStocks/u1'
        ? snap({ stocks: [{ name: 'SPUS', percentage: 100 }] })
        : snap({ positions: [{ symbol: 'SPUS', inputType: 'shares', shares: 3 }] })) as never);
    expect(await loadCloudWorkspace('u1')).toEqual({
      portfolios: [{ ...emptyPortfolio('p1'), funds: [{ symbol: 'SPUS', target: 100 }], holdings: { SPUS: { kind: 'shares', amount: 3 } }, tracksHoldings: true }],
      activeId: 'p1',
    });
  });

  it('saves every portfolio and reads them back', async () => {
    await saveCloudWorkspace('u1', two);
    const [stocksCall, positionsCall] = vi.mocked(setDoc).mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(stocksCall[0]).toBe('userStocks/u1');
    // The old fields mirror the first portfolio for older copies of the app
    expect(stocksCall[1].stocks).toEqual([{ name: 'SPUS', percentage: 100, companyName: 'SP Funds' }]);
    expect(positionsCall[1].positions).toEqual([{ symbol: 'SPUS', inputType: 'value', value: 10 }]);

    vi.mocked(getDoc).mockImplementation((async (ref: unknown) =>
      snap(ref === 'userStocks/u1' ? stocksCall[1] : positionsCall[1])) as never);
    expect(await loadCloudWorkspace('u1')).toEqual(two);
  });
});

describe('signing in with portfolios built on this device', () => {
  it('keeps the account and adds device portfolios it does not have', () => {
    const device: Workspace = { portfolios: [{ ...emptyPortfolio('d1', 'HSA'), funds: [{ symbol: 'BND', target: 100 }] }, { ...taxable, id: 'd2' }], activeId: 'd1' };
    const { workspace, added } = mergeDeviceIntoAccount(two, device);
    expect(added).toBe(1);
    expect(workspace.activeId).toBe('t1');
    expect(workspace.portfolios.map(p => p.name)).toEqual(['Roth IRA', 'Taxable', 'HSA (this device)']);
  });

  it('ignores empty device portfolios', () => {
    expect(mergeDeviceIntoAccount(two, { portfolios: [emptyPortfolio('x')], activeId: 'x' }).added).toBe(0);
    expect(mergeDeviceIntoAccount(two, null).added).toBe(0);
  });
});

describe('whole shares and typed prices', () => {
  const withExtras: Workspace = {
    portfolios: [{ ...roth, wholeShares: true }, taxable],
    activeId: 'r1',
    manualPrices: { FXAIX: { price: 190.12, at: '2026-11-22T15:00:00.000Z' } },
  };

  it('saves them on the device and reads them back', () => {
    saveDeviceWorkspace(withExtras);
    expect(loadDeviceWorkspace()).toEqual(withExtras);
  });

  it('saves them to the account and reads them back', async () => {
    vi.mocked(setDoc).mockClear();
    await saveCloudWorkspace('u1', withExtras);
    const [stocksCall, positionsCall] = vi.mocked(setDoc).mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(stocksCall[1].manualPrices).toEqual(withExtras.manualPrices);
    vi.mocked(getDoc).mockImplementation((async (ref: unknown) =>
      snap(ref === 'userStocks/u1' ? stocksCall[1] : positionsCall[1])) as never);
    expect(await loadCloudWorkspace('u1')).toEqual(withExtras);
  });

  it('drops typed prices that are not real prices', () => {
    window.localStorage.setItem('assetAllocation.portfolios.v3', JSON.stringify({
      ...two,
      manualPrices: { A: { price: -1, at: 'x' }, B: { price: 'ten', at: 'x' }, C: { price: 5 }, D: { price: 5, at: '2026-11-22' } },
    }));
    expect(loadDeviceWorkspace()?.manualPrices).toEqual({ D: { price: 5, at: '2026-11-22' } });
  });

  it('keeps the account’s typed prices on sign-in and adds the device’s others', () => {
    const account: Workspace = { ...two, manualPrices: { A: { price: 1, at: 'acct' } } };
    const device: Workspace = { ...two, manualPrices: { A: { price: 2, at: 'dev' }, B: { price: 3, at: 'dev' } } };
    expect(mergeDeviceIntoAccount(account, device).workspace.manualPrices).toEqual({
      A: { price: 1, at: 'acct' },
      B: { price: 3, at: 'dev' },
    });
  });

  it('reports when the browser will not store anything', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(saveDeviceWorkspace(two)).toBe(false);
    spy.mockRestore();
    expect(saveDeviceWorkspace(two)).toBe(true);
  });
});
