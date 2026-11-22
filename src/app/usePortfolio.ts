import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { emptyPortfolio, type Fund, type Holding, type Portfolio } from './model';
import { loadCloudPortfolio, loadDevicePortfolio, saveCloudPortfolio, saveDevicePortfolio } from './storage';

export type SaveState = 'loading' | 'saved' | 'saving' | 'error';

const DEVICE = '__device__';
const CLOUD_SAVE_DELAY = 800;

/**
 * The portfolio for whoever is using the app: saved to their Google account when
 * signed in, otherwise to this device. Nothing is saved until the saved copy has been
 * read, so starting values never overwrite real data, and a signed-in user's data is
 * never written to the device.
 */
export function usePortfolio(user: User | null) {
  const uid = user?.uid ?? null;
  const [portfolio, setPortfolio] = useState<Portfolio>(() => (uid ? emptyPortfolio() : loadDevicePortfolio() ?? emptyPortfolio()));
  const [loadedFor, setLoadedFor] = useState<string | null>(uid ? null : DEVICE);
  const [saveState, setSaveState] = useState<SaveState>(uid ? 'loading' : 'saved');
  const skipNextSave = useRef(true);

  // Load whenever the signed-in user changes
  useEffect(() => {
    let cancelled = false;
    skipNextSave.current = true;

    if (!uid) {
      setPortfolio(loadDevicePortfolio() ?? emptyPortfolio());
      setLoadedFor(DEVICE);
      setSaveState('saved');
      return;
    }

    setLoadedFor(null);
    setSaveState('loading');
    loadCloudPortfolio(uid)
      .then(saved => {
        if (cancelled) return;
        if (saved) {
          setPortfolio(saved);
        } else {
          // New account: start from what they built before signing in, if anything
          const device = loadDevicePortfolio();
          setPortfolio(device && device.funds.length > 0 ? device : emptyPortfolio());
          skipNextSave.current = false; // save it to the new account right away
        }
        setLoadedFor(uid);
        setSaveState('saved');
      })
      .catch(error => {
        // Leave saving off: writing now could replace data we failed to read
        console.error('Error loading your saved portfolio:', error);
        if (!cancelled) setSaveState('error');
      });

    return () => { cancelled = true; };
  }, [uid]);

  // Save after changes, once the saved copy has been read
  useEffect(() => {
    const target = uid ?? DEVICE;
    if (loadedFor !== target) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (!uid) {
      saveDevicePortfolio(portfolio);
      return;
    }

    setSaveState('saving');
    const timer = setTimeout(() => {
      saveCloudPortfolio(uid, portfolio)
        .then(() => setSaveState('saved'))
        .catch(error => {
          console.error('Error saving your portfolio:', error);
          setSaveState('error');
        });
    }, CLOUD_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [uid, loadedFor, portfolio]);

  const update = useCallback((change: (p: Portfolio) => Portfolio) => setPortfolio(change), []);

  const actions = {
    /** Replace the whole mix (template, share link). Holdings are kept. */
    applyMix: useCallback((funds: Fund[]) => update(p => ({ ...p, funds: funds.map(f => ({ ...f })) })), [update]),

    setTarget: useCallback((symbol: string, target: number) =>
      update(p => ({ ...p, funds: p.funds.map(f => (f.symbol === symbol ? { ...f, target } : f)) })), [update]),

    addFund: useCallback((symbol: string, name?: string) =>
      update(p => (p.funds.some(f => f.symbol === symbol)
        ? p
        : { ...p, funds: [...p.funds, { symbol, target: 0, ...(name ? { name } : {}) }] })), [update]),

    removeFund: useCallback((symbol: string) =>
      update(p => {
        const holdings = { ...p.holdings };
        delete holdings[symbol];
        return { ...p, funds: p.funds.filter(f => f.symbol !== symbol), holdings };
      }), [update]),

    setHolding: useCallback((symbol: string, holding: Holding | null) =>
      update(p => {
        const holdings = { ...p.holdings };
        if (holding) holdings[symbol] = holding; else delete holdings[symbol];
        return { ...p, holdings };
      }), [update]),

    setTracksHoldings: useCallback((tracksHoldings: boolean) => update(p => ({ ...p, tracksHoldings })), [update]),

    /** Scale every target so they add up to 100%, keeping proportions (one decimal). */
    scaleTo100: useCallback(() =>
      update(p => {
        const total = p.funds.reduce((sum, f) => sum + f.target, 0);
        if (total <= 0) return p;
        const funds = p.funds.map(f => ({ ...f, target: Math.round((f.target / total) * 1000) / 10 }));
        const drift = Math.round((100 - funds.reduce((sum, f) => sum + f.target, 0)) * 10) / 10;
        if (drift !== 0) {
          const largest = funds.reduce((a, b) => (b.target > a.target ? b : a));
          largest.target = Math.round((largest.target + drift) * 10) / 10;
        }
        return { ...p, funds };
      }), [update]),

    /** Put whatever is left (or over) on one fund so the total is 100%. */
    absorbRemainder: useCallback((symbol: string) =>
      update(p => {
        const total = p.funds.reduce((sum, f) => sum + f.target, 0);
        const diff = Math.round((100 - total) * 100) / 100;
        return {
          ...p,
          funds: p.funds.map(f => (f.symbol === symbol ? { ...f, target: Math.max(0, Math.round((f.target + diff) * 100) / 100) } : f)),
        };
      }), [update]),
  };

  return { portfolio, actions, saveState, savedTo: uid ? 'account' as const : 'device' as const, ready: loadedFor === (uid ?? DEVICE) };
}
