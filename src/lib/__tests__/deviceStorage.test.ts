import { describe, it, expect, vi } from 'vitest';
import { loadGuestData, saveGuestData } from '../deviceStorage';

const KEY = 'assetAllocation.guest.v1';

describe('deviceStorage', () => {
  it('returns nothing when nothing is saved', () => {
    expect(loadGuestData()).toEqual({});
  });

  it('saves and reads back, merging parts', () => {
    saveGuestData({ stocks: [{ name: 'SPUS', percentage: 100 }] });
    saveGuestData({ positions: [{ symbol: 'SPUS', inputType: 'value', value: 500 }] });
    expect(loadGuestData()).toEqual({
      stocks: [{ name: 'SPUS', percentage: 100 }],
      positions: [{ symbol: 'SPUS', inputType: 'value', value: 500 }],
    });
  });

  it('ignores unreadable or malformed data', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(loadGuestData()).toEqual({});

    window.localStorage.setItem(KEY, JSON.stringify({
      stocks: [{ name: 'SPUS', percentage: 'fifty' }],
      positions: [{ symbol: 'SPUS', inputType: 'pounds' }],
      rebalanceStocks: [{ name: 'SPTE', percentage: 100 }],
    }));
    expect(loadGuestData()).toEqual({ rebalanceStocks: [{ name: 'SPTE', percentage: 100 }] });
  });

  it('keeps working when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveGuestData({ stocks: [] })).not.toThrow();
    spy.mockRestore();
  });
});
