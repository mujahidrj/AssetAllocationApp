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
 * A saved portfolio, e.g. "Roth IRA": a target mix, plus holdings when the person
 * has chosen to enter them. Money in/out and rebalancing all work from it.
 */
export interface Portfolio {
  id: string;
  /** What the person called it. Empty means never named ("my portfolio"). */
  name: string;
  funds: Fund[];
  holdings: Record<string, Holding>;
  /** The "I already own some of these" switch. */
  tracksHoldings: boolean;
  /** With holdings and money in: also sell what's over target. */
  sell: boolean;
  /** The template the mix started from, if any. */
  templateId?: string;
  /** Trade whole shares only. Off (fractional) unless chosen. */
  wholeShares?: boolean;
  /** Said to be a retirement account (selling inside it isn't taxed). Unset: guessed from the name. */
  retirement?: boolean;
}

/** A price the person typed (or that came from a broker file) for a fund the lookup can't price. */
export interface ManualPrice {
  price: number;
  /** When it was entered, ISO date-time. */
  at: string;
}

/** Everything a person has saved: their portfolios and which one is open. */
export interface Workspace {
  portfolios: Portfolio[];
  activeId: string;
  /** Typed prices by symbol, shared by every portfolio. Used only when the lookup has none. */
  manualPrices?: Record<string, ManualPrice>;
}

export const newPortfolioId = () =>
  `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyPortfolio = (id: string = newPortfolioId(), name = ''): Portfolio => ({
  id,
  name,
  funds: [],
  holdings: {},
  tracksHoldings: false,
  sell: false,
});

export const emptyWorkspace = (): Workspace => {
  const first = emptyPortfolio();
  return { portfolios: [first], activeId: first.id };
};

/** The open portfolio (falls back to the first). */
export const activePortfolio = (ws: Workspace): Portfolio =>
  ws.portfolios.find(p => p.id === ws.activeId) ?? ws.portfolios[0];

/** Name as shown in lists: "My portfolio" when never named. */
export const displayName = (p: Pick<Portfolio, 'name'>) => p.name.trim() || 'My portfolio';

/**
 * Name as it reads in the sentence: "my portfolio", "my Roth IRA", "Sam's IRA",
 * "our joint account".
 */
export function sentenceName(name: string): string {
  const n = name.trim();
  if (!n) return 'my portfolio';
  if (/^(my|our|the|a|an)\b/i.test(n)) return n.replace(/^(My|Our|The|A|An)\b/, w => w.toLowerCase());
  if (/['’]s\b/i.test(n)) return n;
  return `my ${n}`;
}

/** "Portfolio 2", "Portfolio 3", … not already taken. */
export function nextPortfolioName(portfolios: Portfolio[]): string {
  let n = portfolios.length + 1;
  while (portfolios.some(p => p.name === `Portfolio ${n}`)) n++;
  return `Portfolio ${n}`;
}

/** Same targets, ignoring order and 0% funds. */
export function sameMix(a: Fund[], b: Fund[]): boolean {
  const key = (funds: Fund[]) => funds.filter(f => f.target > 0).map(f => `${f.symbol}:${+f.target.toFixed(4)}`).sort().join(',');
  return key(a) === key(b);
}

export type Verb = 'add' | 'out' | 'rebal';

export const CASH_SYMBOLS = ['CASH', 'USD'];
export const isCashSymbol = (symbol: string) => CASH_SYMBOLS.includes(symbol.toUpperCase());

/** Short display names for funds the app knows, used when a full name is long. */
export function shortName(fund: Pick<Fund, 'symbol' | 'name'>): string {
  if (isCashSymbol(fund.symbol)) return 'Cash';
  const name = fund.name ?? '';
  return name
    .replace(/^The\s+/i, '')
    .replace(/^SP Funds\s+/i, '')
    .replace(/\s+(ETF|Fund|Index Fund)$/i, '')
    .trim() || fund.symbol;
}

const RETIREMENT_NAME = /\b(roth|ira|401\s?\(?k\)?|403\s?\(?b\)?|457|hsa|tsp|sep|simple|pension|retirement|rrsp|tfsa|isa|sipp)\b/i;

/** Whether selling inside this portfolio is tax-free: as the person said, or guessed from its name. */
export const isRetirement = (p: Pick<Portfolio, 'name' | 'retirement'>) => p.retirement ?? RETIREMENT_NAME.test(p.name);
