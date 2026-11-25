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
  type ManualPrice,
  type Portfolio,
  type Workspace,
} from './model';
import { loadCloudWorkspace, loadDeviceWorkspace, mergeDeviceIntoAccount, saveCloudWorkspace, saveDeviceWorkspace } from './storage';
import { reportTiming } from '../lib/timing';

export type SaveState = 'loading' | 'saved' | 'saving' | 'error';

/** What an import replaced, so it can be undone. */
export interface HoldingsSnapshot {
  portfolioId: string;
  funds: Fund[];
  holdings: Record<string, Holding>;
  tracksHoldings: boolean;
}

/** A fund taken out of a portfolio with the ×, and what was typed for it, so it can come back. */
export interface RemovedFund {
  portfolioId: string;
  fund: Fund;
  index: number;
  holding?: Holding;
}

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
  const [loadFailed, setLoadFailed] = useState(false);
  const [deviceSaveFailed, setDeviceSaveFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const skipNextSave = useRef(true);
  const workspaceRef = useRef(workspace);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  // Load whenever the signed-in user changes
  useEffect(() => {
    let cancelled = false;
    skipNextSave.current = true;

    if (!uid) {
      setWorkspace(loadDeviceWorkspace() ?? emptyWorkspace());
      setLoadedFor(DEVICE);
      setSaveState('saved');
      setLoadFailed(false);
      return;
    }

    setLoadedFor(null);
    setSaveState('loading');
    setLoadFailed(false);
    const started = performance.now();
    loadCloudWorkspace(uid)
      .then(saved => {
        if (cancelled) return;
        reportTiming({ event: 'portfolios-load', outcome: 'ok', ms: Math.round(performance.now() - started) });
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
        if (!cancelled) {
          reportTiming({ event: 'portfolios-load', outcome: 'failed', ms: Math.round(performance.now() - started) });
          setSaveState('error');
          setLoadFailed(true);
        }
      });

    return () => { cancelled = true; };
  }, [uid, loadAttempt]);

  // Couldn't load (often because the connection dropped): try again once it's back
  useEffect(() => {
    if (!loadFailed) return;
    const retry = () => setLoadAttempt(n => n + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [loadFailed]);

  // Save after changes, once the saved copy has been read
  useEffect(() => {
    const target = uid ?? DEVICE;
    if (loadedFor !== target) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (!uid) {
      setDeviceSaveFailed(!saveDeviceWorkspace(workspace));
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
  }, [uid, loadedFor, workspace, saveAttempt]);

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

    /** Takes a fund and what you own of it out of the open portfolio. Returns what's needed to undo. */
    removeFund: useCallback((symbol: string): RemovedFund | null => {
      const current = activePortfolio(workspaceRef.current);
      const index = current.funds.findIndex(f => f.symbol === symbol);
      if (index === -1) return null;
      const holding = current.holdings[symbol];
      update(p => {
        const holdings = { ...p.holdings };
        delete holdings[symbol];
        return { ...p, funds: p.funds.filter(f => f.symbol !== symbol), holdings };
      });
      return { portfolioId: current.id, fund: current.funds[index], index, ...(holding ? { holding } : {}) };
    }, [update]),

    /** Puts a removed fund back where it was, with what you owned of it. */
    restoreFund: useCallback((removed: RemovedFund) =>
      setWorkspace(ws => ({
        ...ws,
        portfolios: ws.portfolios.map(p => {
          if (p.id !== removed.portfolioId) return p;
          const funds = p.funds.some(f => f.symbol === removed.fund.symbol)
            ? p.funds
            : [...p.funds.slice(0, removed.index), removed.fund, ...p.funds.slice(removed.index)];
          const holdings = removed.holding && !p.holdings[removed.fund.symbol]
            ? { ...p.holdings, [removed.fund.symbol]: removed.holding }
            : p.holdings;
          return funds === p.funds && holdings === p.holdings ? p : { ...p, funds, holdings };
        }),
      })), []),

    setHolding: useCallback((symbol: string, holding: Holding | null) =>
      update(p => {
        const holdings = { ...p.holdings };
        if (holding) holdings[symbol] = holding; else delete holdings[symbol];
        return { ...p, holdings };
      }), [update]),

    setTracksHoldings: useCallback((tracksHoldings: boolean) => update(p => ({ ...p, tracksHoldings })), [update]),

    setSell: useCallback((sell: boolean) => update(p => ({ ...p, sell })), [update]),

    setRetirement: useCallback((retirement: boolean) => update(p => ({ ...p, retirement })), [update]),

    setWholeShares: useCallback((wholeShares: boolean) =>
      update(p => {
        const next = { ...p };
        if (wholeShares) next.wholeShares = true; else delete next.wholeShares;
        return next;
      }), [update]),

    /**
     * Replaces what you own with imported holdings (adding any new funds at 0%) and
     * turns holdings on. Returns what it replaced, for Undo.
     */
    importHoldings: useCallback((holdings: Record<string, Holding>, addFunds: Fund[]): HoldingsSnapshot => {
      const current = activePortfolio(workspaceRef.current);
      const snapshot: HoldingsSnapshot = {
        portfolioId: current.id,
        funds: current.funds,
        holdings: current.holdings,
        tracksHoldings: current.tracksHoldings,
      };
      update(p => ({
        ...p,
        funds: [...p.funds, ...addFunds.filter(f => !p.funds.some(x => x.symbol === f.symbol)).map(f => ({ ...f, target: 0 }))],
        holdings: { ...holdings },
        tracksHoldings: true,
      }));
      return snapshot;
    }, [update]),

    restoreHoldings: useCallback((snap: HoldingsSnapshot) =>
      setWorkspace(ws => ({
        ...ws,
        portfolios: ws.portfolios.map(p => (p.id === snap.portfolioId
          ? { ...p, funds: snap.funds, holdings: snap.holdings, tracksHoldings: snap.tracksHoldings }
          : p)),
      })), []),

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
        return { ...ws, portfolios: [...ws.portfolios, p], activeId: id };
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
        return { ...ws, portfolios: [...ws.portfolios, copy], activeId: id };
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
        return { ...ws, portfolios, activeId };
      });
      return removed;
    }, [workspace]),

    restore: useCallback((saved: RemovedPortfolio) =>
      setWorkspace(ws => {
        if (ws.portfolios.some(p => p.id === saved.portfolio.id)) return ws;
        const portfolios = [...ws.portfolios];
        portfolios.splice(Math.min(saved.index, portfolios.length), 0, saved.portfolio);
        return { ...ws, portfolios, activeId: saved.wasActive ? saved.portfolio.id : ws.activeId };
      }), []),
  };

  const priceActions = {
    /** Saves (or with null, removes) a typed price for a fund. Every portfolio uses it. */
    setManualPrice: useCallback((symbol: string, price: number | null) =>
      setWorkspace(ws => {
        const manualPrices: Record<string, ManualPrice> = { ...(ws.manualPrices ?? {}) };
        if (price != null && price > 0) manualPrices[symbol] = { price, at: new Date().toISOString() };
        else delete manualPrices[symbol];
        return { ...ws, manualPrices };
      }), []),

    /** Adds several prices at once (from an import). They're today's, so they replace older ones. */
    addManualPrices: useCallback((prices: Record<string, number>) =>
      setWorkspace(ws => {
        const at = new Date().toISOString();
        const manualPrices: Record<string, ManualPrice> = { ...(ws.manualPrices ?? {}) };
        let changed = false;
        Object.entries(prices).forEach(([symbol, price]) => {
          if (price > 0) { manualPrices[symbol] = { price, at }; changed = true; }
        });
        return changed ? { ...ws, manualPrices } : ws;
      }), []),

    /** Puts typed prices back as they were (null: there wasn't one). For Undo. */
    restoreManualPrices: useCallback((before: Record<string, ManualPrice | null>) =>
      setWorkspace(ws => {
        const manualPrices: Record<string, ManualPrice> = { ...(ws.manualPrices ?? {}) };
        Object.entries(before).forEach(([symbol, m]) => {
          if (m) manualPrices[symbol] = m; else delete manualPrices[symbol];
        });
        return { ...ws, manualPrices };
      }), []),

    /** Drops typed prices for funds the lookup can price again: the live price wins. */
    dropManualPrices: useCallback((symbols: string[]) =>
      setWorkspace(ws => {
        if (!ws.manualPrices || !symbols.some(s => ws.manualPrices![s])) return ws;
        const manualPrices = { ...ws.manualPrices };
        symbols.forEach(s => { delete manualPrices[s]; });
        return { ...ws, manualPrices };
      }), []),
  };

  const active = useMemo(() => activePortfolio(workspace), [workspace]);

  return {
    workspace,
    portfolio: active,
    actions,
    portfolioActions,
    saveState,
    priceActions,
    savedTo: uid ? 'account' as const : 'device' as const,
    ready: loadedFor === (uid ?? DEVICE),
    /** Signed in, but the saved portfolios couldn't be read; nothing is saved until they are. */
    loadFailed,
    retryLoad: useCallback(() => setLoadAttempt(n => n + 1), []),
    retrySave: useCallback(() => setSaveAttempt(n => n + 1), []),
    /** Signed out and this browser won't store anything. */
    deviceSaveFailed,
  };
}
