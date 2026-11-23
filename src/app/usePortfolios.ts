import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  activePortfolio,
  emptyPortfolio,
  emptyWorkspace,
  newPortfolioId,
  nextPortfolioName,
  type Fund,
  type Holding,
  type Portfolio,
  type Workspace,
} from './model';
import { loadCloudWorkspace, loadDeviceWorkspace, mergeDeviceIntoAccount, saveCloudWorkspace, saveDeviceWorkspace } from './storage';

export type SaveState = 'loading' | 'saved' | 'saving' | 'error';

export interface RemovedPortfolio {
  portfolio: Portfolio;
  index: number;
  wasActive: boolean;
}

const DEVICE = '__device__';
const CLOUD_SAVE_DELAY = 800;

/**
 * Everyone's saved portfolios: in their Google account when signed in, otherwise on
 * this device. Nothing is saved until the saved copy has been read, so starting
 * values never overwrite real data, and a signed-in user's data is never written to
 * the device.
 */
export function usePortfolios(user: User | null) {
  const uid = user?.uid ?? null;
  const [workspace, setWorkspace] = useState<Workspace>(() => (uid ? emptyWorkspace() : loadDeviceWorkspace() ?? emptyWorkspace()));
  const [loadedFor, setLoadedFor] = useState<string | null>(uid ? null : DEVICE);
  const [saveState, setSaveState] = useState<SaveState>(uid ? 'loading' : 'saved');
  const skipNextSave = useRef(true);

  // Load whenever the signed-in user changes
  useEffect(() => {
    let cancelled = false;
    skipNextSave.current = true;

    if (!uid) {
      setWorkspace(loadDeviceWorkspace() ?? emptyWorkspace());
      setLoadedFor(DEVICE);
      setSaveState('saved');
      return;
    }

    setLoadedFor(null);
    setSaveState('loading');
    loadCloudWorkspace(uid)
      .then(saved => {
        if (cancelled) return;
        const device = loadDeviceWorkspace();
        if (saved) {
          const { workspace: merged, added } = mergeDeviceIntoAccount(saved, device);
          setWorkspace(merged);
          if (added > 0) skipNextSave.current = false; // keep what was built before signing in
        } else {
          // New account: start from what they built before signing in, if anything
          const hasWork = device?.portfolios.some(p => p.funds.length > 0);
          setWorkspace(device && hasWork ? device : emptyWorkspace());
          skipNextSave.current = !hasWork;
        }
        setLoadedFor(uid);
        setSaveState('saved');
      })
      .catch(error => {
        // Leave saving off: writing now could replace data we failed to read
        console.error('Error loading your saved portfolios:', error);
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
      saveDeviceWorkspace(workspace);
      return;
    }

    setSaveState('saving');
    const timer = setTimeout(() => {
      saveCloudWorkspace(uid, workspace)
        .then(() => setSaveState('saved'))
        .catch(error => {
          console.error('Error saving your portfolios:', error);
          setSaveState('error');
        });
    }, CLOUD_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [uid, loadedFor, workspace]);

  /** Change the open portfolio. */
  const update = useCallback((change: (p: Portfolio) => Portfolio) =>
    setWorkspace(ws => {
      const current = activePortfolio(ws);
      return { ...ws, portfolios: ws.portfolios.map(p => (p.id === current.id ? change(p) : p)) };
    }), []);

  const actions = {
    /** Replace the mix (template, share link, "Build my own"). Holdings are kept. */
    applyMix: useCallback((funds: Fund[], templateId?: string) =>
      update(p => {
        const next: Portfolio = { ...p, funds: funds.map(f => ({ ...f })) };
        if (templateId) next.templateId = templateId; else delete next.templateId;
        return next;
      }), [update]),

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

    setSell: useCallback((sell: boolean) => update(p => ({ ...p, sell })), [update]),

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

  const portfolioActions = {
    switchTo: useCallback((id: string) =>
      setWorkspace(ws => (ws.portfolios.some(p => p.id === id) ? { ...ws, activeId: id } : ws)), []),

    /** Adds an empty portfolio ("Portfolio 2"), optionally with a mix, and opens it. Returns its id. */
    create: useCallback((options: { name?: string; funds?: Fund[] } = {}) => {
      const id = newPortfolioId();
      setWorkspace(ws => {
        const p = emptyPortfolio(id, options.name ?? nextPortfolioName(ws.portfolios));
        if (options.funds) p.funds = options.funds.map(f => ({ ...f }));
        return { portfolios: [...ws.portfolios, p], activeId: id };
      });
      return id;
    }, []),

    /** A new portfolio with the open one's targets (not its holdings). Returns its id. */
    duplicate: useCallback(() => {
      const id = newPortfolioId();
      setWorkspace(ws => {
        const current = activePortfolio(ws);
        const copy: Portfolio = {
          ...emptyPortfolio(id, `${current.name.trim() || 'My portfolio'} copy`),
          funds: current.funds.map(f => ({ ...f })),
          ...(current.templateId ? { templateId: current.templateId } : {}),
        };
        return { portfolios: [...ws.portfolios, copy], activeId: id };
      });
      return id;
    }, []),

    rename: useCallback((id: string, name: string) =>
      setWorkspace(ws => ({ ...ws, portfolios: ws.portfolios.map(p => (p.id === id ? { ...p, name } : p)) })), []),

    /** Deletes a portfolio (never the last one) and opens the next. Returns what's needed to undo. */
    remove: useCallback((id: string): RemovedPortfolio | null => {
      const index = workspace.portfolios.findIndex(p => p.id === id);
      if (index === -1 || workspace.portfolios.length <= 1) return null;
      const removed: RemovedPortfolio = { portfolio: workspace.portfolios[index], index, wasActive: workspace.activeId === id };
      setWorkspace(ws => {
        const portfolios = ws.portfolios.filter(p => p.id !== id);
        if (portfolios.length === 0 || portfolios.length === ws.portfolios.length) return ws;
        const at = ws.portfolios.findIndex(p => p.id === id);
        const activeId = ws.activeId === id ? portfolios[Math.min(at, portfolios.length - 1)].id : ws.activeId;
        return { portfolios, activeId };
      });
      return removed;
    }, [workspace]),

    restore: useCallback((saved: RemovedPortfolio) =>
      setWorkspace(ws => {
        if (ws.portfolios.some(p => p.id === saved.portfolio.id)) return ws;
        const portfolios = [...ws.portfolios];
        portfolios.splice(Math.min(saved.index, portfolios.length), 0, saved.portfolio);
        return { portfolios, activeId: saved.wasActive ? saved.portfolio.id : ws.activeId };
      }), []),
  };

  const active = useMemo(() => activePortfolio(workspace), [workspace]);

  return {
    workspace,
    portfolio: active,
    actions,
    portfolioActions,
    saveState,
    savedTo: uid ? 'account' as const : 'device' as const,
    ready: loadedFor === (uid ?? DEVICE),
  };
}
