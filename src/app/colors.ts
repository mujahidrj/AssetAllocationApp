/** How many fund colours the theme has (--fund-1 … --fund-10, light and dark). */
export const FUND_COLORS = 10;

/** A fund's colour: its symbol's preferred one, or the next free one if another fund has it. */
export function colorsBySymbol(symbols: string[]): Record<string, string> {
  const taken = new Set<number>();
  const map: Record<string, string> = {};
  [...symbols].sort().forEach(symbol => {
    const preferred = [...symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % FUND_COLORS;
    let slot = preferred;
    for (let i = 0; i < FUND_COLORS && taken.has(slot); i++) slot = (preferred + i + 1) % FUND_COLORS;
    taken.add(slot);
    map[symbol] = `var(--fund-${slot + 1})`;
  });
  return map;
}
