import { Fragment, type Ref } from 'react';
import styles from './Calculator.module.css';
import { CopyIcon } from './icons';
import { formatAmountInput, listText, money, pct1, priceDate, priceTime } from './format';
import { cheapestShort, sharesText, shortList, tradeSum, tradeTitle } from './tradeText';
import type { Fund, ManualPrice, Verb } from './model';
import { isCashSymbol, shortName } from './model';
import type { OffTarget, Plan, Trade } from './plan';
import { MixPicker } from './MixPicker';
import { PriceEditor } from './MixCard';

export interface SellChoice {
  /** What buying alone would leave off target, furthest first. */
  off: OffTarget[];
  /** Selling is on (the trades shown include the sells). */
  selling: boolean;
  /** The sells that would fix it. */
  sells: Trade[];
  /** Selling in a portfolio that isn't a retirement account: mention tax. */
  taxNote: boolean;
}

/** "SPUS would still be at 56.6% after this. Target is 50%." */
function offText(off: OffTarget[]): string {
  if (off.length === 1) {
    const [o] = off;
    return o.targetPct > 0
      ? `${o.symbol} would still be at ${pct1(o.nowPct)} after this. Target is ${+o.targetPct.toFixed(2)}%.`
      : `${o.symbol} isn't in your targets and would still be ${pct1(o.nowPct)} of this portfolio after this.`;
  }
  if (off.length === 2) return `${off[0].symbol} and ${off[1].symbol} would still be off target after this.`;
  return `${off.length} funds would still be off target after this.`;
}

/** "Add a price for VXUS": the first in ink, any others outlined, then an optional "Try again". */
function PriceButtons({ symbols, onAddPrice, onRetry }: { symbols: string[]; onAddPrice: (symbol: string) => void; onRetry?: () => void }) {
  return (
    <div className={`${styles.priceButtons} ${symbols.length > 1 ? styles.priceButtonsWide : ''}`}>
      {symbols.map((s, i) => (
        <button key={s} type="button" className={i === 0 ? styles.primary : styles.ghost} style={i === 0 ? undefined : { height: 40 }} onClick={() => onAddPrice(s)}>
          Add a price for {s}
        </button>
      ))}
      {onRetry && <button type="button" className={styles.linkButton} onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** "Selling $1,450.00 of SPUS so everything lands on target." */
function sellingText(sells: Trade[], whole: boolean): string {
  const what = sells.length === 1 ? `${money(sells[0].dollars)} of ${sells[0].symbol}`
    : sells.length === 2 ? `${money(sells[0].dollars)} of ${sells[0].symbol} and ${money(sells[1].dollars)} of ${sells[1].symbol}`
    : `from ${sells.length} funds`;
  return `Selling ${what} so everything lands ${whole ? 'as close to target as whole shares allow' : 'on target'}.`;
}

interface TradesProps {
  plan: Plan;
  funds: Fund[];
  verb: Verb;
  /** What's typed in the amount (0 when nothing is). */
  amount: number;
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
  onRebalance: () => void;
  /** Adding, and buying alone would leave something well off target: offer to sell too. */
  sellChoice: SellChoice | null;
  onSell: (sell: boolean) => void;
  /** "It's a retirement account": no more tax note for this portfolio. */
  onRetirement: () => void;
  onEnterHoldings: () => void;
  onImport: () => void;
  /** Funds held as shares whose price lookup failed (no typed price either). */
  priceFailed: string[];
  /** The fund whose price editor is open here, in the trades card. */
  editingPrice: string | null;
  onSetPrice: (symbol: string, price: number | null) => void;
  onClosePrice: () => void;
  /** Prices have been loading for a while. */
  pricesSlow: boolean;
  /** Taking out more than is owned: everything is sold. */
  sellsEverything: boolean;
  /** On the Copy and CSV buttons, so the page can tell when they've scrolled away. */
  copyRef?: Ref<HTMLSpanElement>;
}

export function Trades(props: TradesProps) {
  const { plan, funds, verb, amount, colorOf, asOf, pricesLoading, onRefresh, copied, onCopy, onCsv, onPickMix, onBuildOwn, wholeShares, onWholeShares, manualPrices, onAddPrice, textFallback, onCloseText, hasHoldings, offNow, onRebalance, onEnterHoldings, onImport, priceFailed, editingPrice, onSetPrice, onClosePrice, pricesSlow, sellsEverything, sellChoice, onSell, onRetirement, copyRef } = props;
  const ok = plan.status === 'ok';
  const zeroFunds = funds.filter(f => f.target === 0).map(f => f.symbol);
  const when = priceTime(asOf);
  const typed = Object.entries(manualPrices).filter(([s]) => funds.some(f => f.symbol === s) || plan.trades.some(t => t.symbol === s));
  const cheapest = cheapestShort(plan.shortOfShare);
  // Held as shares with no price: the lookup either failed or is still going
  const failed = plan.unpriced.filter(s => priceFailed.includes(s));
  const waiting = plan.unpriced.filter(s => !priceFailed.includes(s));
  // Funds the lookup couldn't price (and nobody typed a price for), named in the footer
  const noPrice = plan.status === 'needs-prices' ? [] : priceFailed.filter(s => funds.some(f => f.symbol === s));

  const title =
    ok ? (sellsEverything ? 'Sell everything' : tradeTitle(plan.trades))
      : plan.status === 'targets-off' ? 'Targets need to add up to 100%'
      : plan.status === 'needs-mix' ? (amount > 0 && verb !== 'rebal' ? `Pick a template to split $${formatAmountInput(amount)}` : 'Pick a starting point')
      : plan.status === 'short-of-share' ? 'Not enough for one share'
      : plan.status === 'needs-prices' ? (failed.length > 1 ? 'Prices are missing' : failed.length === 1 ? 'A price is missing' : pricesSlow ? 'Still getting prices…' : 'Getting prices…')
      : 'Your trades';

  return (
    <section className={`${styles.card} ${styles.trades}`} aria-label="Your trades">
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.cardSum}>{ok ? tradeSum(plan) : ''}</span>
        {plan.status !== 'needs-mix' && (
          <span ref={copyRef} className={styles.tradeHeadActions}>
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
      {plan.status === 'needs-prices' && (
        <div className={styles.empty}>
          {editingPrice && plan.unpriced.includes(editingPrice) ? (
            // Typed here, so the trades appear where you're looking
            <PriceEditor symbol={editingPrice} current={undefined} onSave={price => onSetPrice(editingPrice, price)} onClose={onClosePrice} />
          ) : failed.length > 0 ? (
            <div className={styles.emptyAction}>
              <p>
                {failed.length === 1
                  ? <>Couldn't get a price for {failed[0]}. You entered it in shares, so your trades need its price first.</>
                  : <>Couldn't get prices for {listText(failed)}. You entered them in shares, so your trades need their prices first.</>}
              </p>
              <PriceButtons symbols={failed} onAddPrice={onAddPrice} onRetry={onRefresh} />
            </div>
          ) : pricesSlow ? (
            <div className={styles.emptyAction}>
              <p>
                {listText(waiting)} {waiting.length === 1 ? 'is' : 'are'} taking a while.
                {' '}You can add {waiting.length === 1 ? 'its price' : 'their prices'} yourself.
              </p>
              <PriceButtons symbols={waiting} onAddPrice={onAddPrice} />
            </div>
          ) : (
            <p>
              You entered {listText(waiting)} in shares, so your trades show up once
              {waiting.length === 1 ? ' it has a price.' : ' they have prices.'}
            </p>
          )}
        </div>
      )}
      {plan.status === 'nothing-to-do' && (
        <div className={styles.empty}><p>Everything is already on target. Nothing to buy or sell.</p></div>
      )}
      {plan.status === 'short-of-share' && (
        <div className={styles.empty}>
          <p>
            {verb === 'rebal' && cheapest
              ? <>Selling what's over target doesn't free up enough for one share of {cheapest.symbol} at {money(cheapest.price)}.</>
              : <>
                  {money(plan.leftover)} won't buy a whole share of anything behind target.
                  {cheapest && <> Cheapest is {cheapest.symbol} at {money(cheapest.price)}.</>}
                </>}{' '}
            <button type="button" className={styles.linkButton} onClick={() => onWholeShares(false)}>Use fractional shares</button>
          </p>
        </div>
      )}

      {ok && (
        <div>
          {plan.trades.map(t => {
            const fund = funds.find(f => f.symbol === t.symbol);
            return (
              <Fragment key={t.symbol}>
              <div className={styles.tradeRow}>
                <span className={`${styles.action} ${t.action === 'buy' ? styles.buy : styles.sell}`}>{t.action === 'buy' ? 'Buy' : 'Sell'}</span>
                <div className={styles.fundCell}>
                  <span className={styles.swatch} style={{ background: colorOf(t.symbol) }} />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.symbol}>{t.symbol}</div>
                    <div className={styles.fundName}>{!fund ? 'Not in this portfolio' : shortName(fund) !== fund.symbol ? shortName(fund) : ''}</div>
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
              {editingPrice === t.symbol && (
                <PriceEditor symbol={t.symbol} current={undefined} onSave={price => onSetPrice(t.symbol, price)} onClose={onClosePrice} />
              )}
              </Fragment>
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

      {ok && sellChoice && (
        <div className={styles.sellNote}>
          {sellChoice.selling ? (
            <>
              <p>
                {sellingText(sellChoice.sells, wholeShares)}{' '}
                <button type="button" className={styles.linkButton} onClick={() => onSell(false)}>Only buy</button>
              </p>
              {sellChoice.taxNote && (
                <p className={styles.sellTax}>
                  Selling in a taxable account may mean paying tax.{' '}
                  <button type="button" className={styles.linkButton} onClick={onRetirement}>It's a retirement account</button>
                </p>
              )}
            </>
          ) : (
            <p>
              {offText(sellChoice.off)}{' '}
              <button type="button" className={styles.linkButton} onClick={() => onSell(true)}>Sell some to fix it</button>
            </p>
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
          {noPrice.length > 0 && (
            <span className={`${styles.footItem} ${styles.footProblem}`}>No price for {listText(noPrice)}</span>
          )}
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

        </div>
      )}
    </section>
  );
}
