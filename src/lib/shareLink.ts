import type { Stock } from '../components/calculator/types';

/**
 * A share link carries a target mix in the URL, e.g. `?mix=SPUS:50,SPTE:40,SPWO:10`.
 * Only funds and percentages go in the link; nothing about holdings or amounts.
 * A fund is a ticker, or the name of a fund added by name (a 401(k) fund with no ticker).
 */
const PARAM = 'mix';
const TICKER = /^[A-Z0-9.^-]{1,12}$/;
/** A fund's name, as the app saves one: words, at most 60 characters, at least one letter. */
const NAME = /^(?=.*\p{L})[\p{L}\p{N} .&'()/+%-]{1,60}$/u;

/** The fund as it goes in the portfolio: tickers in capitals, names as they were written. */
function fundSymbol(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (/^[A-Za-z0-9.^-]{1,12}$/.test(text)) return TICKER.test(text.toUpperCase()) ? text.toUpperCase() : null;
  return NAME.test(text) ? text : null;
}

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
    const name = fundSymbol(rawSymbol);
    const percentage = Number(rawPercent);
    if (!name || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return null;
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
