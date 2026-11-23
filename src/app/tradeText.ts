// Text for the trade list: card title and total, share counts, clipboard text and
// CSV. Kept out of Trades.tsx so that file only exports components (fast refresh).
import { money, priceTime, shares as fmtShares } from './format';
import { isCashSymbol } from './model';
import type { Plan, ShortOfShare, Trade } from './plan';

export function tradeTitle(trades: Trade[]): string {
  const buys = trades.filter(t => t.action === 'buy').length;
  const sells = trades.length - buys;
  if (sells === 0) return buys === 1 ? 'Buy this one' : `Buy these ${buys}`;
  if (buys === 0) return sells === 1 ? 'Sell this one' : `Sell these ${sells}`;
  return 'Your trades';
}

/** "$2,500.00", or "$2,461.80 of $2,500.00" when whole shares leave cash over. */
export function tradeSum(plan: Plan): string {
  const hasBuys = plan.trades.some(t => t.action === 'buy');
  const hasSells = plan.trades.some(t => t.action === 'sell');
  if (hasBuys && hasSells) {
    if (Math.abs(plan.net) < 0.005) return 'No new cash';
    return `${plan.net > 0 ? 'Net in' : 'Net out'} ${money(Math.abs(plan.net))}`;
  }
  if (hasBuys && plan.leftover > 0) return `${money(plan.net)} of ${money(plan.net + plan.leftover)}`;
  return money(Math.abs(plan.net));
}

/** "5 shares", "1 share" for whole numbers in whole-share mode; "5.0000 shares" otherwise. */
export function sharesText(n: number, whole = false): string {
  if (whole && Number.isInteger(n)) return `${n} ${n === 1 ? 'share' : 'shares'}`;
  return `${fmtShares(n)} shares`;
}

/** "SPWO ($52.10)", "SPWO ($52.10) and SPTE ($37.16)" */
export const shortList = (short: ShortOfShare[]) =>
  short.map(s => `${s.symbol} (${money(s.price)})`).join(short.length === 2 ? ' and ' : ', ');

/** The one cheapest fund that couldn't get a share. */
export const cheapestShort = (short: ShortOfShare[]) =>
  short.reduce<ShortOfShare | null>((a, b) => (!a || b.price < a.price ? b : a), null);

/** Plain text for the clipboard, columns lined up. */
export function tradesText(plan: Pick<Plan, 'trades' | 'leftover' | 'shortOfShare'>, asOf: string | null, whole = false): string {
  const rows = plan.trades.map(t => [
    `${t.action === 'buy' ? 'Buy' : 'Sell'} ${t.symbol}`,
    money(t.dollars),
    isCashSymbol(t.symbol) ? '(cash)'
      : t.shares != null && t.price != null ? `(${sharesText(t.shares, whole)} at ${money(t.price)})`
      : '(no price)',
  ]);
  const w0 = Math.max(...rows.map(r => r[0].length));
  const w1 = Math.max(...rows.map(r => r[1].length));
  const lines = rows.map(r => `${r[0].padEnd(w0)}  ${r[1].padStart(w1)}  ${r[2]}`);
  if (plan.leftover > 0) {
    const short = plan.shortOfShare.length > 0
      ? ` (not enough for 1 share of ${plan.shortOfShare.map(s => `${s.symbol} at ${money(s.price)}`).join(', ')})`
      : '';
    lines.push(`Cash left over: ${money(plan.leftover)}${short}`);
  }
  const when = priceTime(asOf);
  if (when) lines.push(`Prices: ${when.replace(/^Last close/, 'last close').replace(/^As of/, 'as of')}`);
  return lines.join('\n');
}

export function tradesCsv(trades: Trade[]): string {
  const rows = trades.map(t => [
    t.action === 'buy' ? 'Buy' : 'Sell',
    t.symbol,
    t.dollars.toFixed(2),
    t.shares != null && !isCashSymbol(t.symbol) ? (Number.isInteger(t.shares) ? String(t.shares) : t.shares.toFixed(4)) : '',
    t.price != null ? t.price.toFixed(2) : '',
  ].join(','));
  return ['Action,Symbol,Dollars,Shares,Price', ...rows].join('\n');
}
