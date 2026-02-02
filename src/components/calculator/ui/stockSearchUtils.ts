/**
 * Utility functions for stock search filtering logic
 */

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
