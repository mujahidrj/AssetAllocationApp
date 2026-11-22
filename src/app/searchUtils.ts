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
