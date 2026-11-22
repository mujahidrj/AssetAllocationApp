import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';

vi.mock('../storage', async () => {
  const actual = await vi.importActual<typeof import('../storage')>('../storage');
  return { ...actual, loadCloudPortfolio: vi.fn(), saveCloudPortfolio: vi.fn(() => Promise.resolve()) };
});

import { loadCloudPortfolio, saveCloudPortfolio, loadDevicePortfolio, saveDevicePortfolio } from '../storage';
import { usePortfolio } from '../usePortfolio';

const cloud = {
  funds: [{ symbol: 'SPUS', target: 100 }],
  holdings: { SPUS: { kind: 'dollars' as const, amount: 99999 } },
  tracksHoldings: true,
};

describe('usePortfolio', () => {
  beforeEach(() => {
    vi.mocked(loadCloudPortfolio).mockReset();
    vi.mocked(saveCloudPortfolio).mockClear();
  });

  it('starts empty for a first-time visitor and saves changes on the device', () => {
    const { result } = renderHook(() => usePortfolio(null));
    expect(result.current.portfolio.funds).toEqual([]);
    expect(result.current.savedTo).toBe('device');

    act(() => result.current.actions.applyMix([{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }]));
    expect(loadDevicePortfolio()?.funds).toEqual([{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }]);
  });

  it('brings back what was saved on the device', () => {
    saveDevicePortfolio({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    const { result } = renderHook(() => usePortfolio(null));
    expect(result.current.portfolio.funds).toEqual([{ symbol: 'VTI', target: 100 }]);
  });

  it('edits targets, funds and holdings', () => {
    const { result } = renderHook(() => usePortfolio(null));
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
    expect(result.current.portfolio.holdings).toEqual({ SPTE: { kind: 'shares', amount: 3 } });

    act(() => result.current.actions.removeFund('SPTE'));
    expect(result.current.portfolio.funds.map(f => f.symbol)).toEqual(['SPUS']);
    expect(result.current.portfolio.holdings).toEqual({});
  });

  it('waits for the account copy to load, then saves changes to the account', async () => {
    let release!: (p: typeof cloud) => void;
    vi.mocked(loadCloudPortfolio).mockReturnValue(new Promise(r => { release = r; }));
    const user = { uid: 'u1' } as User;
    const { result } = renderHook(() => usePortfolio(user));

    expect(result.current.saveState).toBe('loading');
    act(() => result.current.actions.applyMix([{ symbol: 'X', target: 100 }]));
    await act(async () => { release(cloud); });

    expect(result.current.portfolio).toEqual(cloud);
    expect(result.current.savedTo).toBe('account');
    expect(saveCloudPortfolio).not.toHaveBeenCalled();

    act(() => result.current.actions.setTarget('SPUS', 90));
    expect(result.current.saveState).toBe('saving');
    await waitFor(() => expect(saveCloudPortfolio).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(vi.mocked(saveCloudPortfolio).mock.calls[0][1].funds).toEqual([{ symbol: 'SPUS', target: 90 }]);
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
  });

  it('gives a new account the mix built before signing in', async () => {
    saveDevicePortfolio({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    vi.mocked(loadCloudPortfolio).mockResolvedValue(null);
    const { result } = renderHook(() => usePortfolio({ uid: 'new' } as User));

    await waitFor(() => expect(result.current.portfolio.funds).toEqual([{ symbol: 'VTI', target: 100 }]));
    await waitFor(() => expect(saveCloudPortfolio).toHaveBeenCalledWith('new', expect.objectContaining({ funds: [{ symbol: 'VTI', target: 100 }] })), { timeout: 2000 });
  });

  it('never writes account data to the device after sign-out', async () => {
    vi.mocked(loadCloudPortfolio).mockResolvedValue(cloud);
    const { result, rerender } = renderHook(({ user }: { user: User | null }) => usePortfolio(user), {
      initialProps: { user: { uid: 'u1' } as User | null },
    });
    await waitFor(() => expect(result.current.portfolio).toEqual(cloud));

    rerender({ user: null });
    await waitFor(() => expect(result.current.savedTo).toBe('device'));
    expect(result.current.portfolio.funds).toEqual([]);
    expect(window.localStorage.getItem('assetAllocation.portfolio.v2') ?? '').not.toContain('99999');
  });

  it('does not save when the account copy fails to load', async () => {
    vi.mocked(loadCloudPortfolio).mockRejectedValue(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePortfolio({ uid: 'u1' } as User));
    await waitFor(() => expect(result.current.saveState).toBe('error'));
    act(() => result.current.actions.applyMix([{ symbol: 'X', target: 100 }]));
    await new Promise(r => setTimeout(r, 900));
    expect(saveCloudPortfolio).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
