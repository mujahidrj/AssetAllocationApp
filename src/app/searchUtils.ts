/**
 * Utility functions for stock search filtering logic
 */

/**
 * Checks if a ticker symbol is an option (call or put)
 * @param symbol - The stock ticker symbol to check
 * @param description - Optional description to check for option keywords
 * @returns true if the ticker is an option, false otherwise
 */
export function isOption(symbol: string, description?: string): boolean {
  const symbolUpper = symbol.toUpperCase();
  const descUpper = (description || '').toUpperCase();
  
  // Check description for option keywords
  if (descUpper.includes('CALL') || descUpper.includes('PUT') || descUpper.includes('OPTION')) {
    return true;
  }
  
  // Options typically have long alphanumeric codes with dates and strike prices
  // Pattern: TICKER + YYMMDD + C/P + STRIKE (e.g., AAPL230120C00150000)
  // Check for patterns like: 6 digits (date) followed by C or P, then more digits (strike)
  const optionPattern = /\d{6}[CP]\d+/;
  if (optionPattern.test(symbolUpper)) {
    return true;
  }
  
  // Check for C or P suffix that might indicate options (but be careful not to exclude share classes)
  // Options with C/P suffix usually have longer codes, not just 1-2 characters
  const baseTicker = getBaseTicker(symbol);
  if (baseTicker.length > 0 && symbolUpper.length > baseTicker.length + 3) {
    const suffix = symbolUpper.substring(baseTicker.length);
    if (suffix.includes('C') || suffix.includes('P')) {
      // Check if it looks like an option code (has numbers and C/P)
      if (/\d/.test(suffix) && (suffix.includes('C') || suffix.includes('P'))) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Checks if a ticker symbol is a futures contract
 * @param symbol - The stock ticker symbol to check
 * @param description - Optional description to check for futures keywords
 * @returns true if the ticker is a futures contract, false otherwise
 */
export function isFutures(symbol: string, description?: string): boolean {
  const symbolUpper = symbol.toUpperCase();
  const descUpper = (description || '').toUpperCase();
  
  // Check description for futures keywords
  if (descUpper.includes('FUTURE') || descUpper.includes('FUTURES') || descUpper.includes('FUTURE CONTRACT')) {
    return true;
  }
  
  // Futures often end with "=F" (e.g., ES=F, NQ=F, CL=F)
  if (symbolUpper.endsWith('=F')) {
    return true;
  }
  
  // Some futures have "F" suffix but we need to distinguish from Frankfurt exchange (.F)
  // Futures with F suffix usually don't have a dot before F
  if (symbolUpper.endsWith('F') && !symbolUpper.includes('.')) {
    // Check if it's a common futures pattern (short ticker + F, like ESF, NQF)
    const commonFutures = ['ESF', 'NQF', 'CLF', 'GCF', 'ZCF', 'HGF', 'SIF', 'YMF'];
    if (commonFutures.includes(symbolUpper)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Checks if a ticker symbol is US-based
 * @param symbol - The stock ticker symbol to check
 * @returns true if the ticker is US-based, false otherwise
 */
export function isUSTicker(symbol: string): boolean {
  // US stocks typically have no suffix, or US-specific suffixes
  if (!symbol.includes('.')) {
    return true; // No suffix = US stock
  }

  const symbolUpper = symbol.toUpperCase();
  const suffix = symbolUpper.substring(symbolUpper.lastIndexOf('.'));

  // Non-US exchange suffixes to filter out (check these FIRST before treating as US share class)
  const nonUSSuffixes = [
    '.SZ', '.SS', '.SH', // China
    '.TO', '.V', // Canada
    '.L', '.LN', // London
    '.HK', // Hong Kong
    '.MX', // Mexico
    '.BC', '.BO', // Various non-US
    '.T', '.TA', // Tokyo
    '.AS', // Amsterdam
    '.DE', // Germany
    '.PA', // Paris
    '.BR', // Brazil
    '.SA', // South Africa
    '.SW', // Switzerland
    '.ST', // Stockholm
    '.CO', // Copenhagen
    '.OL', // Oslo
    '.HE', // Helsinki
    '.IS', // Iceland
    '.LS', // Lisbon
    '.MC', // Madrid
    '.MI', // Milan
    '.VI', // Vienna
    '.AT', // Athens
    '.IR', // Ireland
    '.DU', // Dusseldorf
    '.F', // Frankfurt (must check before single-letter US share class check)
    '.HA', // Hamburg
    '.MU', // Munich
    '.BE', // Berlin
    '.SG', // Singapore
    '.KL', // Kuala Lumpur
    '.JK', // Jakarta
    '.BK', // Bangkok
    '.NS', // India
    '.BO', // Bombay
    '.KS', // Korea
    '.TW', // Taiwan
    '.TWO', // Taiwan OTC
    '.AU', // Australia
    '.NZ', // New Zealand
    '.AX', // ASX
  ];

  // Check non-US suffixes first
  if (nonUSSuffixes.some(nonUS => symbolUpper.endsWith(nonUS))) {
    return false;
  }

  // If it's a single letter suffix and not in non-US list, treat as US share class
  if (suffix.length === 2 && /^\.\w$/.test(suffix)) {
    return true; // Single letter suffix like .A, .B = US share class
  }

  // Any other suffix pattern is not US
  return false;
}

/**
 * Checks if a ticker is a primary ticker (no exchange suffix or US share class)
 * @param symbol - The stock ticker symbol to check
 * @returns true if the ticker is primary
 */
export function isPrimaryTicker(symbol: string): boolean {
  // Primary tickers don't have dots (exchange suffixes) or are US share classes
  if (!symbol.includes('.')) return true;
  // Only US share classes (single letter suffixes) are considered primary
  // Non-US exchange suffixes are not primary
  return isUSTicker(symbol) && symbol.substring(symbol.lastIndexOf('.')).length === 2;
}

/**
 * Gets the base ticker by removing exchange suffixes
 * @param symbol - The stock ticker symbol
 * @returns The base ticker without exchange suffix
 */
export function getBaseTicker(symbol: string): string {
  const dotIndex = symbol.indexOf('.');
  return dotIndex > 0 ? symbol.substring(0, dotIndex) : symbol;
}

export interface SearchResult {
  symbol: string;
  description: string;
}

/** US listings only, no options or futures, one entry per company (primary ticker first). */
export function cleanResults(raw: Array<{ symbol?: string; description?: string }>): SearchResult[] {
  const seen = new Set<string>();
  const usable = raw
    .filter((r): r is SearchResult => !!r.symbol && !!r.description)
    .filter(r => !isOption(r.symbol, r.description) && !isFutures(r.symbol, r.description) && isUSTicker(r.symbol));
  const ordered = [...usable.filter(r => isPrimaryTicker(r.symbol)), ...usable.filter(r => !isPrimaryTicker(r.symbol))];
  const out: SearchResult[] = [];
  ordered.forEach(r => {
    const base = getBaseTicker(r.symbol);
    if (!seen.has(base)) {
      seen.add(base);
      out.push(r);
    }
  });
  return out.slice(0, 8);
}

/** Longest name kept for a fund added by name. Share links accept the same. */
export const OWN_NAME_MAX = 60;

/**
 * What to call a fund of your own that search can't find: its ticker if it looks
 * like one, otherwise its name as typed (without the characters share links use).
 */
export function ownFundSymbol(typed: string): string {
  const upper = typed.trim().toUpperCase();
  if (looksLikeTicker(upper)) return upper;
  const name = typed.replace(/[,:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name.length <= OWN_NAME_MAX) return name;
  // Too long: end at a whole word ("…Trust Select", never "…Trust Se")
  const cut = name.slice(0, OWN_NAME_MAX + 1);
  const space = cut.lastIndexOf(' ');
  return (space > OWN_NAME_MAX / 2 ? cut.slice(0, space) : name.slice(0, OWN_NAME_MAX)).trim();
}

/** Could be a ticker the price lookup knows ("VTI", "BRK.B"), rather than a fund's name. Indexes (^GSPC) can't be bought. */
export const looksLikeTicker = (symbol: string) => /^[A-Za-z0-9.-]{1,12}$/.test(symbol.trim());

/**
 * Funds most people mean, in rough order of how often they're used. A search for
 * "bond" or "vanguard" offers these first, even when the price service's search
 * leaves them out (it returns ten matches, often obscure ones).
 */
export const COMMON_FUNDS: SearchResult[] = [
  { symbol: 'VTI', description: 'Vanguard Total Stock Market ETF' },
  { symbol: 'VOO', description: 'Vanguard S&P 500 ETF' },
  { symbol: 'VXUS', description: 'Vanguard Total International Stock ETF' },
  { symbol: 'BND', description: 'Vanguard Total Bond Market ETF' },
  { symbol: 'AGG', description: 'iShares Core U.S. Aggregate Bond ETF' },
  { symbol: 'SPY', description: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'IVV', description: 'iShares Core S&P 500 ETF' },
  { symbol: 'FXAIX', description: 'Fidelity 500 Index Fund' },
  { symbol: 'FSKAX', description: 'Fidelity Total Market Index Fund' },
  { symbol: 'FZROX', description: 'Fidelity ZERO Total Market Index Fund' },
  { symbol: 'FZILX', description: 'Fidelity ZERO International Index Fund' },
  { symbol: 'FTIHX', description: 'Fidelity Total International Index Fund' },
  { symbol: 'FXNAX', description: 'Fidelity U.S. Bond Index Fund' },
  { symbol: 'VTSAX', description: 'Vanguard Total Stock Market Index Fund Admiral Shares' },
  { symbol: 'VTIAX', description: 'Vanguard Total International Stock Index Fund Admiral Shares' },
  { symbol: 'VBTLX', description: 'Vanguard Total Bond Market Index Fund Admiral Shares' },
  { symbol: 'VFIAX', description: 'Vanguard 500 Index Fund Admiral Shares' },
  { symbol: 'BNDX', description: 'Vanguard Total International Bond ETF' },
  { symbol: 'VT', description: 'Vanguard Total World Stock ETF' },
  { symbol: 'VEA', description: 'Vanguard FTSE Developed Markets ETF' },
  { symbol: 'VWO', description: 'Vanguard FTSE Emerging Markets ETF' },
  { symbol: 'VNQ', description: 'Vanguard Real Estate ETF' },
  { symbol: 'SCHB', description: 'Schwab U.S. Broad Market ETF' },
  { symbol: 'SCHF', description: 'Schwab International Equity ETF' },
  { symbol: 'SCHZ', description: 'Schwab U.S. Aggregate Bond ETF' },
  { symbol: 'SCHD', description: 'Schwab U.S. Dividend Equity ETF' },
  { symbol: 'ITOT', description: 'iShares Core S&P Total U.S. Stock Market ETF' },
  { symbol: 'IXUS', description: 'iShares Core MSCI Total International Stock ETF' },
  { symbol: 'QQQ', description: 'Invesco QQQ Trust' },
  { symbol: 'TLT', description: 'iShares 20+ Year Treasury Bond ETF' },
  { symbol: 'SGOV', description: 'iShares 0-3 Month Treasury Bond ETF' },
  { symbol: 'GLD', description: 'SPDR Gold Shares' },
  { symbol: 'SPUS', description: 'SP Funds S&P 500 Sharia Industry Exclusions ETF' },
  { symbol: 'SPTE', description: 'SP Funds S&P Global Technology ETF' },
  { symbol: 'SPWO', description: 'SP Funds S&P World ETF' },
  { symbol: 'SPSK', description: 'SP Funds Dow Jones Global Sukuk ETF' },
  { symbol: 'SPRE', description: 'SP Funds S&P Global REIT Sharia ETF' },
  { symbol: 'HLAL', description: 'Wahed FTSE USA Shariah ETF' },
];

/** At most this many common funds go above the search's own results. */
const MAX_COMMON = 4;
const MAX_RESULTS = 8;

const nameWords = (text: string) => text.toUpperCase().split(/[^A-Z0-9&+]+/).filter(Boolean);

/**
 * What the fund search shows: a ticker typed in full first ("VO" before VOO), then common
 * funds that match, then the rest of the search's results. A word that's also a ticker
 * ("bond" is PIMCO's BOND) means the common funds named by it first. Indexes (^GSPC, ^TNX)
 * are left out, since they can't be bought.
 */
export function rankResults(query: string, raw: Array<{ symbol?: string; description?: string }>): SearchResult[] {
  const q = query.trim().toUpperCase();
  const words = nameWords(q);
  const found = cleanResults(raw.filter(r => !r.symbol?.startsWith('^')));
  const byName = (r: SearchResult) => words.length > 0 && words.every(w => nameWords(r.description).some(n => n.startsWith(w)));
  const common = COMMON_FUNDS.filter(r => r.symbol.startsWith(q) || byName(r)).slice(0, MAX_COMMON);
  const exactCommon = COMMON_FUNDS.find(r => r.symbol === q);
  const exactFound = found.find(r => r.symbol === q);
  const first = exactCommon ?? (common.some(byName) ? undefined : exactFound);
  const out: SearchResult[] = [];
  [...(first ? [first] : []), ...common, ...(exactFound ? [exactFound] : []), ...found].forEach(r => {
    if (!out.some(x => x.symbol === r.symbol)) out.push(r);
  });
  return out.slice(0, MAX_RESULTS);
}
