// Text for the trade list: card title and total, clipboard text and CSV.
// Kept out of Trades.tsx so that file only exports components (fast refresh).
import { money, priceTime, shares as fmtShares } from './format';
import type { Plan, Trade } from './plan';

export function tradeTitle(trades: Trade[]): string {
  const buys = trades.filter(t => t.action === 'buy').length;
  const sells = trades.length - buys;
  if (sells === 0) return buys === 1 ? 'Buy this one' : `Buy these ${buys}`;
  if (buys === 0) return sells === 1 ? 'Sell this one' : `Sell these ${sells}`;
  return 'Your trades';
}

export function tradeSum(plan: Plan): string {
  const hasBuys = plan.trades.some(t => t.action === 'buy');
  const hasSells = plan.trades.some(t => t.action === 'sell');
  if (hasBuys && hasSells) {
    if (Math.abs(plan.net) < 0.005) return 'No new cash';
    return `${plan.net > 0 ? 'Net in' : 'Net out'} ${money(Math.abs(plan.net))}`;
  }
  return money(Math.abs(plan.net));
}

/** Plain text for the clipboard, columns lined up. */
export function tradesText(trades: Trade[], asOf: string | null): string {
  const rows = trades.map(t => [
    `${t.action === 'buy' ? 'Buy' : 'Sell'} ${t.symbol}`,
    money(t.dollars),
    t.shares != null && t.price != null ? `(${fmtShares(t.shares)} shares at ${money(t.price)})` : '(no price)',
  ]);
  const w0 = Math.max(...rows.map(r => r[0].length));
  const w1 = Math.max(...rows.map(r => r[1].length));
  const lines = rows.map(r => `${r[0].padEnd(w0)}  ${r[1].padStart(w1)}  ${r[2]}`);
  const when = priceTime(asOf);
  if (when) lines.push(`Prices: ${when.replace(/^Last close/, 'last close').replace(/^As of/, 'as of')}`);
  return lines.join('\n');
}

export function tradesCsv(trades: Trade[]): string {
  const rows = trades.map(t => [
    t.action === 'buy' ? 'Buy' : 'Sell',
    t.symbol,
    t.dollars.toFixed(2),
    t.shares != null ? t.shares.toFixed(4) : '',
    t.price != null ? t.price.toFixed(2) : '',
  ].join(','));
  return ['Action,Symbol,Dollars,Shares,Price', ...rows].join('\n');
}
