import type { Workspace } from './model';

/** How many fund colours the theme has (--fund-1 … --fund-10, light and dark). */
export const FUND_COLORS = 10;

const NONE: Record<string, number> = {};
const has = (map: Record<string, number>, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** The symbols in each portfolio, in the order shown: its funds, then anything held but not targeted. */
export function symbolsOf(ws: Workspace): string[][] {
  return ws.portfolios.map(p => [...new Set([...p.funds.map(f => f.symbol), ...Object.keys(p.holdings).sort()])]);
}

/**
 * Each fund's colour, as a slot from 0 to 9. A fund keeps its slot for good (it's saved
 * with the portfolios), so it has one colour in every view and never changes when funds
 * come and go. A fund without one gets a slot no other fund in its portfolio has (so a
 * portfolio of up to ten funds never repeats a colour), the first one no fund anywhere
 * has if there is one (so All portfolios doesn't either, up to ten funds in all). The
 * first portfolio's funds get the theme's first colours in order. Returns `existing`
 * itself when nothing is new.
 */
export function assignFundColors(portfolios: string[][], existing: Record<string, number> = NONE): Record<string, number> {
  let out = existing;
  const everywhere = new Set(Object.values(existing));
  for (const symbols of portfolios) {
    const here = new Set(symbols.filter(s => has(out, s)).map(s => out[s]));
    for (const s of symbols) {
      if (has(out, s) || s === '__proto__') continue;
      const free = Array.from({ length: FUND_COLORS }, (_, i) => i).filter(i => !here.has(i));
      // More than ten in one portfolio: colours have to repeat
      const slot = free.find(i => !everywhere.has(i)) ?? free[0] ?? Object.keys(out).length % FUND_COLORS;
      if (out === existing) out = { ...existing };
      out[s] = slot;
      here.add(slot);
      everywhere.add(slot);
    }
  }
  return out;
}

/** The CSS colour for a slot. */
export const colorVar = (slot: number) => `var(--fund-${slot + 1})`;
