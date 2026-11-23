import styles from './Calculator.module.css';
import { CopyIcon } from './icons';
import { drift, money, pct1, priceDate, priceTime } from './format';
import { cheapestShort, sharesText, shortList, tradeSum, tradeTitle } from './tradeText';
import type { Fund, ManualPrice, Verb } from './model';
import { isCashSymbol, shortName } from './model';
import type { OffTarget, Plan } from './plan';
import { MixPicker } from './MixPicker';

interface TradesProps {
  plan: Plan;
  funds: Fund[];
  verb: Verb;
  colorOf: (symbol: string) => string;
  asOf: string | null;
  pricesLoading: boolean;
  onRefresh: () => void;
  copied: boolean;
  onCopy: () => void;
  onCsv: () => void;
  onPickMix: (funds: Fund[], templateId: string) => void;
  onBuildOwn: () => void;
  wholeShares: boolean;
  onWholeShares: (whole: boolean) => void;
  /** Typed prices in use, by symbol. */
  manualPrices: Record<string, ManualPrice>;
  onAddPrice: (symbol: string) => void;
  /** The trades as text, shown when copying didn't work. */
  textFallback: string | null;
  onCloseText: () => void;
  /** Holdings are on and entered. */
  hasHoldings: boolean;
  /** Furthest off target now (before any trades), when worth rebalancing. */
  offNow: OffTarget | null;
  /** Still that far off after these trades. */
  offAfter: OffTarget | null;
  onRebalance: () => void;
  onEnterHoldings: () => void;
  onImport: () => void;
}

export function Trades(props: TradesProps) {
  const { plan, funds, verb, colorOf, asOf, pricesLoading, onRefresh, copied, onCopy, onCsv, onPickMix, onBuildOwn, wholeShares, onWholeShares, manualPrices, onAddPrice, textFallback, onCloseText, hasHoldings, offNow, offAfter, onRebalance, onEnterHoldings, onImport } = props;
  const ok = plan.status === 'ok';
  const zeroFunds = funds.filter(f => f.target === 0).map(f => f.symbol);
  const when = priceTime(asOf);
  const typed = Object.entries(manualPrices).filter(([s]) => funds.some(f => f.symbol === s) || plan.trades.some(t => t.symbol === s));
  const cheapest = cheapestShort(plan.shortOfShare);

  const title =
    ok ? tradeTitle(plan.trades)
      : plan.status === 'targets-off' ? 'Targets need to add up to 100%'
      : plan.status === 'needs-mix' ? 'Pick a starting point'
      : plan.status === 'short-of-share' ? 'Not enough for one share'
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
        <div className={styles.empty}>
          {offNow ? (
            <div className={styles.emptyAction}>
              <p>
                {offNow.symbol} is at {pct1(offNow.nowPct)}, target {+offNow.targetPct.toFixed(2)}%.
                {' '}Type an amount above, or rebalance what you own.
              </p>
              <button type="button" className={styles.primary} onClick={onRebalance}>Rebalance now</button>
            </div>
          ) : hasHoldings ? (
            <p>Every fund is within range of its target. Type an amount above to see what to buy.</p>
          ) : (
            <p>Type an amount above and your trades show up here.</p>
          )}
        </div>
      )}
      {plan.status === 'targets-off' && (
        <div className={styles.empty}>
          <p>Your targets add up to {+plan.targetTotal.toFixed(2)}%. Fix them below and the trades come back.</p>
        </div>
      )}
      {plan.status === 'needs-holdings' && (
        <div className={styles.empty}>
          <p>
            Rebalancing works from what you own.{' '}
            <button type="button" className={styles.linkButton} onClick={onEnterHoldings}>Enter it below</button>
            {' '}or{' '}
            <button type="button" className={styles.linkButton} onClick={onImport}>import from your broker</button>.
          </p>
        </div>
      )}
      {plan.status === 'nothing-to-do' && (
        <div className={styles.empty}><p>Everything is already on target. Nothing to buy or sell.</p></div>
      )}
      {plan.status === 'short-of-share' && (
        <div className={styles.empty}>
          <p>
            {money(plan.leftover)} won't buy a whole share of anything behind target.
            {cheapest && <> Cheapest is {cheapest.symbol} at {money(cheapest.price)}.</>}{' '}
            <button type="button" className={styles.linkButton} onClick={() => onWholeShares(false)}>Use fractional shares</button>
          </p>
        </div>
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
                  {isCashSymbol(t.symbol) ? 'cash'
                    : t.shares != null ? sharesText(t.shares, wholeShares)
                    : pricesLoading ? '…'
                    : fund ? <button type="button" className={styles.linkButton} onClick={() => onAddPrice(t.symbol)}>Add a price to see shares</button>
                    : 'no price'}
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
          {plan.leftover > 0 && (
            <div className={styles.leftoverRow}>
              <div>
                <div>{verb === 'out' ? 'Extra cash raised' : 'Cash left over'}</div>
                <div className={styles.fundName}>
                  {verb === 'out'
                    ? `Raises ${money(plan.leftover)} more than needed, because shares are whole.`
                    : plan.shortOfShare.length > 0
                      ? `Not enough for one share of ${shortList(plan.shortOfShare)}.`
                      : 'Not enough for one more whole share of anything behind target.'}
                </div>
              </div>
              <span className={styles.tradeAmount}>{money(plan.leftover)}</span>
            </div>
          )}
        </div>
      )}

      {textFallback != null && (
        <div className={styles.textFallback}>
          <label>
            Select the trades and copy them:
            <textarea readOnly value={textFallback} rows={Math.min(10, textFallback.split('\n').length + 1)} autoFocus onFocus={e => e.currentTarget.select()} />
          </label>
          <button type="button" className={styles.linkButton} onClick={onCloseText}>Done</button>
        </div>
      )}

      {plan.status !== 'needs-mix' && (
        <div className={styles.cardFoot}>
          <span className={styles.footItem}>{pricesLoading ? 'Updating prices…' : when ?? 'Prices from Yahoo Finance'}</span>
          {when && !pricesLoading && <span className={styles.footItem}>Yahoo Finance</span>}
          <span className={styles.footItem}>
            <button type="button" className={styles.linkButton} onClick={onRefresh}>Refresh</button>
          </span>
          {typed.map(([symbol, m]) => (
            <span key={symbol} className={styles.footItem}>Your price for {symbol}, {priceDate(m.at)}</span>
          ))}
          <span className={styles.footItem}>
            <span className={styles.footSelect}>
              {wholeShares ? 'Whole shares' : 'Fractional shares'}
              <svg viewBox="0 0 12 8" width="9" height="6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 1.5 6 6.5l4.5-5" /></svg>
              <select aria-label="Shares" value={wholeShares ? 'whole' : 'fractional'} onChange={e => onWholeShares(e.target.value === 'whole')}>
                <option value="fractional">Fractional shares: exact amounts</option>
                <option value="whole">Whole shares: for brokers without fractions</option>
              </select>
            </span>
          </span>
          {zeroFunds.length > 0 && <span className={styles.footItem}>{zeroFunds.join(', ')} at 0%, skipped</span>}
          {ok && offAfter && (
            <>
              <span className={styles.footItem}>{offAfter.symbol} still {drift(offAfter.drift)} after this</span>
              <span className={styles.footItem}>
                <button type="button" className={styles.linkButton} onClick={onRebalance}>Rebalance instead</button>
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
