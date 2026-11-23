import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';

vi.mock('../storage', async () => {
  const actual = await vi.importActual<typeof import('../storage')>('../storage');
  return { ...actual, loadCloudWorkspace: vi.fn(), saveCloudWorkspace: vi.fn(() => Promise.resolve()) };
});

import { loadCloudWorkspace, saveCloudWorkspace, loadDeviceWorkspace, saveDeviceWorkspace } from '../storage';
import { emptyPortfolio, type Workspace } from '../model';
import { usePortfolios } from '../usePortfolios';

const cloud: Workspace = {
  portfolios: [{ ...emptyPortfolio('c1', 'Roth IRA'), funds: [{ symbol: 'SPUS', target: 100 }], holdings: { SPUS: { kind: 'dollars', amount: 99999 } }, tracksHoldings: true }],
  activeId: 'c1',
};
const seed = (ws: Workspace) => saveDeviceWorkspace(ws);

describe('usePortfolios', () => {
  beforeEach(() => {
    vi.mocked(loadCloudWorkspace).mockReset();
    vi.mocked(saveCloudWorkspace).mockClear();
  });

  it('starts with one empty, unnamed portfolio and saves changes on the device', () => {
    const { result } = renderHook(() => usePortfolios(null));
    expect(result.current.workspace.portfolios).toHaveLength(1);
    expect(result.current.portfolio.name).toBe('');
    expect(result.current.savedTo).toBe('device');

    act(() => result.current.actions.applyMix([{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }], 'Vanguard 3-Fund Portfolio'));
    const saved = loadDeviceWorkspace()!;
    expect(saved.portfolios[0].funds).toEqual([{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }]);
    expect(saved.portfolios[0].templateId).toBe('Vanguard 3-Fund Portfolio');
  });

  it('edits targets, funds, holdings and the selling choice', () => {
    const { result } = renderHook(() => usePortfolios(null));
    act(() => {
      result.current.actions.addFund('SPUS', 'SP Funds');
      result.current.actions.addFund('SPUS');
      result.current.actions.addFund('SPTE');
    });
    act(() => result.current.actions.setTarget('SPUS', 70));
    act(() => result.current.actions.setTarget('SPTE', 20));
    act(() => result.current.actions.absorbRemainder('SPUS'));
    expect(result.current.portfolio.funds).toEqual([{ symbol: 'SPUS', target: 80, name: 'SP Funds' }, { symbol: 'SPTE', target: 20 }]);

    act(() => result.current.actions.setTarget('SPTE', 40));
    act(() => result.current.actions.scaleTo100());
    expect(result.current.portfolio.funds.map(f => f.target)).toEqual([66.7, 33.3]);

    act(() => result.current.actions.setHolding('SPTE', { kind: 'shares', amount: 3 }));
    act(() => result.current.actions.setTracksHoldings(true));
    act(() => result.current.actions.setSell(true));
    expect(result.current.portfolio).toMatchObject({ holdings: { SPTE: { kind: 'shares', amount: 3 } }, tracksHoldings: true, sell: true });

    act(() => result.current.actions.removeFund('SPTE'));
    expect(result.current.portfolio.funds.map(f => f.symbol)).toEqual(['SPUS']);
    expect(result.current.portfolio.holdings).toEqual({});
  });

  it('creates, switches, renames, copies and deletes portfolios, with undo', () => {
    const { result } = renderHook(() => usePortfolios(null));
    act(() => result.current.actions.applyMix([{ symbol: 'VTI', target: 100 }]));
    act(() => result.current.actions.setHolding('VTI', { kind: 'dollars', amount: 500 }));
    const firstId = result.current.portfolio.id;

    act(() => { result.current.portfolioActions.create(); });
    expect(result.current.portfolio).toMatchObject({ name: 'Portfolio 2', funds: [] });

    act(() => result.current.portfolioActions.rename(result.current.portfolio.id, 'HSA'));
    expect(result.current.portfolio.name).toBe('HSA');

    act(() => result.current.portfolioActions.switchTo(firstId));
    act(() => { result.current.portfolioActions.duplicate(); });
    // A copy takes the targets, not the holdings
    expect(result.current.portfolio).toMatchObject({ name: 'My portfolio copy', funds: [{ symbol: 'VTI', target: 100 }], holdings: {} });
    expect(result.current.workspace.portfolios.map(p => p.name)).toEqual(['', 'HSA', 'My portfolio copy']);

    const hsa = result.current.workspace.portfolios[1];
    act(() => result.current.portfolioActions.switchTo(hsa.id));
    let removed: ReturnType<typeof result.current.portfolioActions.remove> = null;
    act(() => { removed = result.current.portfolioActions.remove(hsa.id); });
    expect(result.current.workspace.portfolios.map(p => p.name)).toEqual(['', 'My portfolio copy']);
    expect(result.current.portfolio.name).toBe('My portfolio copy');

    act(() => result.current.portfolioActions.restore(removed!));
    expect(result.current.workspace.portfolios.map(p => p.name)).toEqual(['', 'HSA', 'My portfolio copy']);
    expect(result.current.portfolio.name).toBe('HSA');
    expect(loadDeviceWorkspace()!.portfolios).toHaveLength(3);
  });

  it('never deletes the last portfolio', () => {
    const { result } = renderHook(() => usePortfolios(null));
    let removed: unknown = 'not called';
    act(() => { removed = result.current.portfolioActions.remove(result.current.portfolio.id); });
    expect(removed).toBeNull();
    expect(result.current.workspace.portfolios).toHaveLength(1);
  });

  it('waits for the account copy to load, then saves changes to the account', async () => {
    let release!: (ws: Workspace) => void;
    vi.mocked(loadCloudWorkspace).mockReturnValue(new Promise(r => { release = r; }));
    const user = { uid: 'u1' } as User;
    const { result } = renderHook(() => usePortfolios(user));

    expect(result.current.saveState).toBe('loading');
    act(() => result.current.actions.applyMix([{ symbol: 'X', target: 100 }]));
    await act(async () => { release(cloud); });

    expect(result.current.workspace).toEqual(cloud);
    expect(result.current.savedTo).toBe('account');
    expect(saveCloudWorkspace).not.toHaveBeenCalled();

    act(() => result.current.actions.setTarget('SPUS', 90));
    expect(result.current.saveState).toBe('saving');
    await waitFor(() => expect(saveCloudWorkspace).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(vi.mocked(saveCloudWorkspace).mock.calls[0][1].portfolios[0].funds).toEqual([{ symbol: 'SPUS', target: 90 }]);
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
  });

  it('gives a new account what was built before signing in', async () => {
    seed({ portfolios: [{ ...emptyPortfolio('d1', 'HSA'), funds: [{ symbol: 'VTI', target: 100 }] }], activeId: 'd1' });
    vi.mocked(loadCloudWorkspace).mockResolvedValue(null);
    const { result } = renderHook(() => usePortfolios({ uid: 'new' } as User));

    await waitFor(() => expect(result.current.portfolio.name).toBe('HSA'));
    await waitFor(() => expect(saveCloudWorkspace).toHaveBeenCalledWith('new', expect.objectContaining({ activeId: 'd1' })), { timeout: 2000 });
  });

  it('adds device portfolios to an existing account without losing either', async () => {
    seed({ portfolios: [{ ...emptyPortfolio('d1', 'HSA'), funds: [{ symbol: 'VTI', target: 100 }] }], activeId: 'd1' });
    vi.mocked(loadCloudWorkspace).mockResolvedValue(cloud);
    const { result } = renderHook(() => usePortfolios({ uid: 'u1' } as User));

    await waitFor(() => expect(result.current.workspace.portfolios.map(p => p.name)).toEqual(['Roth IRA', 'HSA (this device)']));
    expect(result.current.portfolio.name).toBe('Roth IRA');
    await waitFor(() => expect(saveCloudWorkspace).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('never writes account data to the device after sign-out', async () => {
    vi.mocked(loadCloudWorkspace).mockResolvedValue(cloud);
    const { result, rerender } = renderHook(({ user }: { user: User | null }) => usePortfolios(user), {
      initialProps: { user: { uid: 'u1' } as User | null },
    });
    await waitFor(() => expect(result.current.workspace).toEqual(cloud));

    rerender({ user: null });
    await waitFor(() => expect(result.current.savedTo).toBe('device'));
    expect(result.current.portfolio.funds).toEqual([]);
    expect(window.localStorage.getItem('assetAllocation.portfolios.v3') ?? '').not.toContain('99999');
  });

  it('does not save when the account copy fails to load', async () => {
    vi.mocked(loadCloudWorkspace).mockRejectedValue(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePortfolios({ uid: 'u1' } as User));
    await waitFor(() => expect(result.current.saveState).toBe('error'));
    act(() => result.current.actions.applyMix([{ symbol: 'X', target: 100 }]));
    await new Promise(r => setTimeout(r, 900));
    expect(saveCloudWorkspace).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('usePortfolios: whole shares, imports and typed prices', () => {
  it('keeps the whole-shares choice per portfolio, off by default', () => {
    const { result } = renderHook(() => usePortfolios(null));
    expect(result.current.portfolio.wholeShares).toBeUndefined();
    act(() => result.current.actions.setWholeShares(true));
    expect(loadDeviceWorkspace()!.portfolios[0].wholeShares).toBe(true);
    act(() => result.current.actions.setWholeShares(false));
    expect(loadDeviceWorkspace()!.portfolios[0].wholeShares).toBeUndefined();
  });

  it('replaces holdings from an import, adds chosen funds at 0%, and can undo it', () => {
    seed({
      portfolios: [{ ...emptyPortfolio('a', 'Roth IRA'), funds: [{ symbol: 'SPUS', target: 100 }], holdings: { SPUS: { kind: 'dollars', amount: 5 } } }],
      activeId: 'a',
    });
    const { result } = renderHook(() => usePortfolios(null));
    let snapshot!: ReturnType<typeof result.current.actions.importHoldings>;
    act(() => {
      snapshot = result.current.actions.importHoldings(
        { SPUS: { kind: 'shares', amount: 210 }, FXAIX: { kind: 'shares', amount: 3 } },
        [{ symbol: 'FXAIX', target: 25, name: 'Fidelity 500' }],
      );
    });
    expect(result.current.portfolio).toMatchObject({
      tracksHoldings: true,
      funds: [{ symbol: 'SPUS', target: 100 }, { symbol: 'FXAIX', target: 0, name: 'Fidelity 500' }],
      holdings: { SPUS: { kind: 'shares', amount: 210 }, FXAIX: { kind: 'shares', amount: 3 } },
    });

    act(() => result.current.actions.restoreHoldings(snapshot));
    expect(result.current.portfolio).toMatchObject({
      tracksHoldings: false,
      funds: [{ symbol: 'SPUS', target: 100 }],
      holdings: { SPUS: { kind: 'dollars', amount: 5 } },
    });
  });

  it('saves typed prices for every portfolio, never overwrites them from a file, and drops them for live prices', () => {
    const { result } = renderHook(() => usePortfolios(null));
    act(() => result.current.priceActions.setManualPrice('FXAIX', 190.12));
    expect(result.current.workspace.manualPrices?.FXAIX.price).toBe(190.12);

    // A file's prices are today's, so they replace older typed ones
    act(() => result.current.priceActions.addManualPrices({ VTSAX: 120 }));
    expect(result.current.workspace.manualPrices?.FXAIX.price).toBe(190.12);
    expect(result.current.workspace.manualPrices?.VTSAX.price).toBe(120);

    // Typed prices survive adding, copying and deleting portfolios
    act(() => { result.current.portfolioActions.create(); });
    act(() => { result.current.portfolioActions.duplicate(); });
    act(() => { result.current.portfolioActions.remove(result.current.portfolio.id); });
    expect(Object.keys(result.current.workspace.manualPrices ?? {})).toEqual(['FXAIX', 'VTSAX']);
    expect(Object.keys(loadDeviceWorkspace()?.manualPrices ?? {})).toEqual(['FXAIX', 'VTSAX']);

    act(() => result.current.priceActions.addManualPrices({ FXAIX: 191 }));
    expect(result.current.workspace.manualPrices?.FXAIX.price).toBe(191);
    act(() => result.current.priceActions.restoreManualPrices({ FXAIX: { price: 190.12, at: 'then' }, NEW: null }));
    expect(result.current.workspace.manualPrices?.FXAIX).toEqual({ price: 190.12, at: 'then' });
    expect(loadDeviceWorkspace()?.manualPrices?.VTSAX.price).toBe(120);

    act(() => result.current.priceActions.dropManualPrices(['VTSAX']));
    expect(Object.keys(result.current.workspace.manualPrices ?? {})).toEqual(['FXAIX']);

    act(() => result.current.priceActions.setManualPrice('FXAIX', null));
    expect(result.current.workspace.manualPrices).toEqual({});
  });

  it('says when the account copy could not be loaded, and tries again', async () => {
    vi.mocked(loadCloudWorkspace).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(cloud);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePortfolios({ uid: 'u-retry' } as User));
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.portfolio.name).toBe('Roth IRA'));
    expect(result.current.loadFailed).toBe(false);
    spy.mockRestore();
  });
});
