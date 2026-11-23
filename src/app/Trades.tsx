import styles from './Calculator.module.css';
import { CopyIcon } from './icons';
import { money, pct1, priceTime, shares as fmtShares } from './format';
import type { Fund } from './model';
import { shortName } from './model';
import type { Plan, Trade } from './plan';
import { MixPicker } from './MixPicker';

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

interface TradesProps {
  plan: Plan;
  funds: Fund[];
  colorOf: (symbol: string) => string;
  asOf: string | null;
  pricesLoading: boolean;
  onRefresh: () => void;
  copied: boolean;
  onCopy: () => void;
  onCsv: () => void;
  onPickMix: (funds: Fund[], templateId: string) => void;
  onBuildOwn: () => void;
}

export function Trades({ plan, funds, colorOf, asOf, pricesLoading, onRefresh, copied, onCopy, onCsv, onPickMix, onBuildOwn }: TradesProps) {
  const ok = plan.status === 'ok';
  const zeroFunds = funds.filter(f => f.target === 0).map(f => f.symbol);
  const when = priceTime(asOf);

  const title =
    ok ? tradeTitle(plan.trades)
      : plan.status === 'targets-off' ? 'Targets need to add up to 100%'
      : plan.status === 'needs-mix' ? 'Pick a mix to start'
      : 'Your trades';

  return (
    <section className={`${styles.card} ${styles.trades}`} aria-label="Your trades">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.cardSum}>{ok ? tradeSum(plan) : ''}</span>
        {plan.status !== 'needs-mix' && (
          <span className={styles.tradeHeadActions}>
            <button type="button" className={styles.primary} onClick={onCopy} disabled={!ok}>
              <CopyIcon />{copied ? 'Copied' : 'Copy trades'}
            </button>
            <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onCsv} disabled={!ok}>CSV</button>
          </span>
        )}
      </div>

      {plan.status === 'needs-mix' && (
        <div className={styles.empty}>
          <MixPicker current={funds} heading="Start with a mix" onPick={onPickMix} onBuildOwn={onBuildOwn} />
        </div>
      )}
      {plan.status === 'needs-amount' && (
        <div className={styles.empty}><p>Type an amount above and your trades show up here.</p></div>
      )}
      {plan.status === 'targets-off' && (
        <div className={styles.empty}>
          <p>Your targets add up to {+plan.targetTotal.toFixed(2)}%. Fix them in Your mix below and the trades come back.</p>
        </div>
      )}
      {plan.status === 'needs-holdings' && (
        <div className={styles.empty}><p>Enter what you own in Your mix below to see what to buy and sell.</p></div>
      )}
      {plan.status === 'nothing-to-do' && (
        <div className={styles.empty}><p>Everything is already on target. Nothing to buy or sell.</p></div>
      )}

      {ok && (
        <div>
          {plan.trades.map(t => {
            const fund = funds.find(f => f.symbol === t.symbol);
            return (
              <div key={t.symbol} className={styles.tradeRow}>
                <span className={`${styles.action} ${t.action === 'buy' ? styles.buy : styles.sell}`}>{t.action === 'buy' ? 'Buy' : 'Sell'}</span>
                <div className={styles.fundCell}>
                  <span className={styles.swatch} style={{ background: colorOf(t.symbol) }} />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.symbol}>{t.symbol}</div>
                    <div className={styles.fundName}>{fund ? shortName(fund) : 'Not in your mix'}</div>
                  </div>
                </div>
                <span className={styles.tradeShares}>
                  {t.shares != null ? `${fmtShares(t.shares)} shares` : pricesLoading ? '…' : 'no price'}
                </span>
                <span className={styles.tradeAmount}>{t.action === 'sell' ? money(-t.dollars) : money(t.dollars)}</span>
              </div>
            );
          })}
          {plan.skips.map(s => (
            <div key={s.symbol} className={styles.skipRow}>
              <span className={styles.action}>Skip</span>
              {s.symbol} · already {pct1(s.nowPct)}, target {+s.targetPct.toFixed(2)}%
            </div>
          ))}
        </div>
      )}

      {plan.status !== 'needs-mix' && (
        <div className={styles.cardFoot}>
          <span className={styles.footItem}>{pricesLoading ? 'Updating prices…' : when ?? 'Prices from Yahoo Finance'}</span>
          {when && !pricesLoading && <span className={styles.footItem}>Yahoo Finance</span>}
          <span className={styles.footItem}>
            <button type="button" className={styles.linkButton} onClick={onRefresh}>Refresh</button>
          </span>
          <span className={styles.footItem}>Fractional shares</span>
          {zeroFunds.length > 0 && <span className={styles.footItem}>{zeroFunds.join(', ')} at 0%, skipped</span>}
        </div>
      )}
    </section>
  );
}
