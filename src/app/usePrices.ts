import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isCashSymbol } from './model';
import { looksLikeTicker } from './searchUtils';

/** Back on the tab after this long, prices are fetched again. */
const STALE_MS = 5 * 60 * 1000;

export interface PriceInfo {
  price: number | null;
  /** ISO time the price was set, from the API. */
  asOf: string | null;
  status: 'loading' | 'ok' | 'missing';
}

const apiBase = () => (import.meta.env.DEV ? (import.meta.env.VITE_API_URL ?? '') : '');

async function fetchPrice(symbol: string, signal: AbortSignal): Promise<{ price: number | null; asOf: string | null }> {
  const response = await fetch(`${apiBase()}/api/stock/${encodeURIComponent(symbol)}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return { price: null, asOf: null };
  const data = await response.json() as { price?: unknown; asOf?: unknown };
  const price = typeof data.price === 'number' && data.price > 0 ? data.price : null;
  return { price, asOf: typeof data.asOf === 'string' ? data.asOf : null };
}

/**
 * A lookup that failed (offline, rate-limited) keeps the price it had, with its older
 * time, rather than throwing away a good price: only a fund that never had one is missing.
 */
const failed = (before: PriceInfo | undefined): PriceInfo =>
  before?.price ? { price: before.price, asOf: before.asOf, status: 'ok' } : { price: null, asOf: null, status: 'missing' };

/** Latest prices for the given symbols. Cash is always $1.00. */
export function usePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const requested = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);

  const lastLoad = useRef(0);

  const load = useCallback((list: string[]) => {
    // A fund of your own, added by name, has no price to look up: you type it
    const own = list.filter(s => !isCashSymbol(s) && !looksLikeTicker(s));
    if (own.length > 0) {
      own.forEach(s => requested.current.add(s));
      setPrices(prev => {
        if (own.every(s => prev[s]?.status === 'missing')) return prev;
        const next = { ...prev };
        own.forEach(s => { next[s] = { price: null, asOf: null, status: 'missing' }; });
        return next;
      });
    }
    const wanted = list.filter(s => !isCashSymbol(s) && looksLikeTicker(s));
    if (wanted.length === 0) return;
    lastLoad.current = Date.now();
    controller.current ??= new AbortController();
    const signal = controller.current.signal;
    wanted.forEach(s => requested.current.add(s));
    setPrices(prev => {
      const next = { ...prev };
      wanted.forEach(s => { next[s] = { price: prev[s]?.price ?? null, asOf: prev[s]?.asOf ?? null, status: 'loading' }; });
      return next;
    });
    wanted.forEach(symbol => {
      fetchPrice(symbol, signal)
        .then(({ price, asOf }) => {
          setPrices(prev => ({ ...prev, [symbol]: price ? { price, asOf, status: 'ok' } : failed(prev[symbol]) }));
        })
        .catch(error => {
          if (signal.aborted) return;
          console.warn(`Couldn't get a price for ${symbol}:`, error);
          setPrices(prev => ({ ...prev, [symbol]: failed(prev[symbol]) }));
        });
    });
  }, []);

  const key = symbols.join(',');
  useEffect(() => {
    load(symbols.filter(s => !requested.current.has(s)));
    // `key` stands in for the symbols array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
    requested.current.clear();
  }, []);

  const refresh = useCallback(() => load(symbols), [load, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tab left open for days, or a lookup that failed offline: fetch again when the
  // tab comes back into view (if the prices are a few minutes old) or the connection returns
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > STALE_MS) refreshRef.current();
    };
    const onOnline = () => refreshRef.current();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Same object until a price changes, so anything built on it can be memoized
  const priceMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    symbols.forEach(s => { map[s] = isCashSymbol(s) ? 1 : prices[s]?.price ?? null; });
    return map;
  }, [prices, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = symbols.some(s => prices[s]?.status === 'loading');
  const asOfTimes = symbols.map(s => prices[s]?.asOf).filter((t): t is string => !!t).sort();

  return {
    prices: priceMap,
    info: prices,
    loading,
    /** Oldest price time among the funds, so the freshness line never overstates. */
    asOf: asOfTimes[0] ?? null,
    refresh,
  };
}
