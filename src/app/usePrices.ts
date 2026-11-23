import { useCallback, useEffect, useRef, useState } from 'react';
import { isCashSymbol } from './model';

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

/** Latest prices for the given symbols. Cash is always $1.00. */
export function usePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const requested = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);

  const load = useCallback((list: string[]) => {
    const wanted = list.filter(s => !isCashSymbol(s));
    if (wanted.length === 0) return;
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
          setPrices(prev => ({ ...prev, [symbol]: { price, asOf, status: price ? 'ok' : 'missing' } }));
        })
        .catch(error => {
          if (signal.aborted) return;
          console.warn(`Couldn't get a price for ${symbol}:`, error);
          setPrices(prev => ({ ...prev, [symbol]: { price: null, asOf: null, status: 'missing' } }));
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

  const priceMap: Record<string, number | null> = {};
  symbols.forEach(s => { priceMap[s] = isCashSymbol(s) ? 1 : prices[s]?.price ?? null; });

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
