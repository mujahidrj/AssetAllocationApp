import styles from './Calculator.module.css';
import { CopyIcon } from './icons';
import { money, pct1, priceTime, shares as fmtShares } from './format';
import { tradeSum, tradeTitle } from './tradeText';
import type { Fund } from './model';
import { shortName } from './model';
import type { Plan } from './plan';
import { MixPicker } from './MixPicker';

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
      : plan.status === 'needs-mix' ? 'Pick a starting point'
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
          <MixPicker current={funds} heading="Start from a template" onPick={onPickMix} onBuildOwn={onBuildOwn} />
        </div>
      )}
      {plan.status === 'needs-amount' && (
        <div className={styles.empty}><p>Type an amount above and your trades show up here.</p></div>
      )}
      {plan.status === 'targets-off' && (
        <div className={styles.empty}>
          <p>Your targets add up to {+plan.targetTotal.toFixed(2)}%. Fix them below and the trades come back.</p>
        </div>
      )}
      {plan.status === 'needs-holdings' && (
        <div className={styles.empty}><p>Enter what you own below to see what to buy and sell.</p></div>
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
                    <div className={styles.fundName}>{fund ? shortName(fund) : 'Not in this portfolio'}</div>
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
