/** One fund in the target mix. */
export interface Fund {
  symbol: string;
  /** Full fund name, when known. */
  name?: string;
  /** Target percentage, 0–100. */
  target: number;
}

/** What you own of one fund, typed as dollars or as shares. */
export interface Holding {
  kind: 'dollars' | 'shares';
  amount: number;
}

/**
 * The one portfolio both money in/out and rebalancing work from:
 * a target mix, plus holdings when the person has chosen to enter them.
 */
export interface Portfolio {
  funds: Fund[];
  holdings: Record<string, Holding>;
  /** The "I already own some of these" switch. */
  tracksHoldings: boolean;
}

export const emptyPortfolio = (): Portfolio => ({ funds: [], holdings: {}, tracksHoldings: false });

export type Verb = 'add' | 'out' | 'rebal';

export const CASH_SYMBOLS = ['CASH', 'USD'];
export const isCashSymbol = (symbol: string) => CASH_SYMBOLS.includes(symbol.toUpperCase());

/** Short display names for funds the app knows, used when a full name is long. */
export function shortName(fund: Fund): string {
  if (isCashSymbol(fund.symbol)) return 'Cash';
  const name = fund.name ?? '';
  return name
    .replace(/^The\s+/i, '')
    .replace(/^SP Funds\s+/i, '')
    .replace(/\s+(ETF|Fund|Index Fund)$/i, '')
    .trim() || fund.symbol;
}
