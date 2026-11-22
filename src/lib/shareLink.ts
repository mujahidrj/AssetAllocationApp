import type { Stock } from '../components/calculator/types';

/**
 * A share link carries a target mix in the URL, e.g. `?mix=SPUS:50,SPTE:40,SPWO:10`.
 * Only tickers and percentages go in the link; nothing about holdings or amounts.
 */
const PARAM = 'mix';
const SYMBOL = /^[A-Z0-9.^-]{1,12}$/;

export function encodeMix(stocks: Stock[]): string {
  return stocks
    .filter(s => s.percentage > 0)
    .map(s => `${s.name}:${+s.percentage.toFixed(4)}`)
    .join(',');
}

/** Parses a `mix` value. Returns null unless every entry is valid and the total is 100%. */
export function decodeMix(value: string | null | undefined): Stock[] | null {
  if (!value) return null;
  const stocks: Stock[] = [];
  for (const part of value.split(',')) {
    const [rawSymbol, rawPercent, extra] = part.split(':');
    if (extra !== undefined || !rawSymbol || !rawPercent) return null;
    const name = rawSymbol.trim().toUpperCase();
    const percentage = Number(rawPercent);
    if (!SYMBOL.test(name) || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return null;
    if (stocks.some(s => s.name === name)) return null;
    stocks.push({ name, percentage });
  }
  const total = stocks.reduce((sum, s) => sum + s.percentage, 0);
  return stocks.length > 0 && Math.abs(total - 100) <= 0.01 ? stocks : null;
}

/** Full link to this page carrying the mix. */
export function buildShareLink(stocks: Stock[], location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  const params = new URLSearchParams({ [PARAM]: encodeMix(stocks) });
  // Keep ":" and "," readable in the link
  return `${location.origin}${location.pathname}?${params.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',')}`;
}

/** The mix in the current URL, if there is a valid one. */
export function readSharedMix(search: string = window.location.search): Stock[] | null {
  return decodeMix(new URLSearchParams(search).get(PARAM));
}

/** Removes the mix from the address bar without reloading, so a refresh doesn't ask again. */
export function clearSharedMixFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Not worth failing over
  }
}
