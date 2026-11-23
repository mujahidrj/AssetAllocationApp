import { useEffect, useState } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { drift, money, pct1 } from './format';
import { shortName, type Fund, type Holding } from './model';
import { holdingDollars, type PriceMap } from './plan';
import { FundSearch } from './FundSearch';
import { parseAmount } from '../lib/parseAmount';

/** A number field that lets you type freely and only commits valid numbers. */
function NumberField({ value, onCommit, label, className, prefix, suffix, decimals }: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const show = (n: number) => (n === 0 ? '' : decimals != null ? n.toLocaleString('en-US', { maximumFractionDigits: decimals }) : String(+n.toFixed(2)));
  const [draft, setDraft] = useState(show(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(show(value));
    // show() only depends on decimals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);

  return (
    <label className={`${styles.field} ${className ?? ''}`}>
      {prefix && <span>{prefix}</span>}
      <input
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={draft}
        onFocus={() => setEditing(true)}
        onBlur={() => { setEditing(false); setDraft(show(value)); }}
        onChange={e => {
          const text = e.target.value;
          setDraft(text);
          if (text.trim() === '') { onCommit(0); return; }
          const n = parseAmount(text);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  );
}

interface MixCardProps {
  funds: Fund[];
  holdings: Record<string, Holding>;
  tracksHoldings: boolean;
  prices: PriceMap;
  missingPrices: string[];
  colorOf: (symbol: string) => string;
  onTarget: (symbol: string, target: number) => void;
  onHolding: (symbol: string, holding: Holding | null) => void;
  onTracksHoldings: (on: boolean) => void;
  onAddFund: (symbol: string, name?: string) => void;
  onRemoveFund: (symbol: string) => void;
  onChangeMix: () => void;
  onScale: () => void;
  onAbsorb: (symbol: string) => void;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  /** e.g. "Vanguard 3-Fund mix, edited" */
  subtitle?: string;
}

export function MixCard(props: MixCardProps) {
  const { funds, holdings, tracksHoldings, prices, missingPrices, colorOf, onTarget, onHolding, onTracksHoldings, onAddFund, onRemoveFund, onChangeMix, onScale, onAbsorb, searchOpen, onSearchOpen, subtitle } = props;

  const total = funds.reduce((sum, f) => sum + f.target, 0);
  const off = funds.length > 0 && Math.abs(total - 100) > 0.01;
  const diff = Math.round((100 - total) * 100) / 100;
  const largest = funds.length > 0 ? funds.reduce((a, b) => (b.target > a.target ? b : a)) : null;
  const heldTotal = funds.reduce((sum, f) => sum + holdingDollars(f.symbol, holdings[f.symbol], prices), 0);

  return (
    <section className={`${styles.card} ${styles.mix} ${tracksHoldings ? styles.withHoldings : ''}`} aria-label="Your mix">
      <div className={styles.cardHead}>
        <div className={styles.titleBlock}>
          <h2 className={styles.cardTitle}>Your mix</h2>
          {subtitle && <span className={styles.cardSub}>{subtitle}</span>}
        </div>
        <button type="button" className={styles.headLink} onClick={onChangeMix}>Change mix</button>
        <button type="button" className={styles.headLink} onClick={() => onSearchOpen(!searchOpen)} aria-expanded={searchOpen}>+ Add fund</button>
        <button
          type="button"
          role="switch"
          aria-checked={tracksHoldings}
          className={styles.switch}
          onClick={() => onTracksHoldings(!tracksHoldings)}
        >
          I already own some of these
          <span className={`${styles.track} ${tracksHoldings ? styles.trackOn : ''}`}><span className={styles.knob} /></span>
        </button>
      </div>

      {funds.length > 0 && (
        <div className={styles.mixBar} role="img" aria-label={`Mix: ${funds.filter(f => f.target > 0).map(f => `${f.symbol} ${f.target}%`).join(', ')}`}>
          {funds.filter(f => f.target > 0).map(f => (
            <span key={f.symbol} style={{ width: `${(f.target / Math.max(total, 100)) * 100}%`, background: colorOf(f.symbol) }} />
          ))}
        </div>
      )}

      {funds.length > 0 && (
        <div className={styles.mixHead}>
          <span>Fund</span>
          <span>Target</span>
          {tracksHoldings && <><span>You own</span><span style={{ textAlign: 'right' }}>Now</span></>}
          <span />
        </div>
      )}

      {funds.map(f => {
        const holding = holdings[f.symbol];
        const price = prices[f.symbol] ?? null;
        const dollars = holdingDollars(f.symbol, holding, prices);
        const now = heldTotal > 0 ? (dollars / heldTotal) * 100 : 0;
        const d = now - f.target;
        const kind = holding?.kind ?? 'dollars';
        const missing = missingPrices.includes(f.symbol);

        return (
          <div key={f.symbol} className={`${styles.mixRow} ${f.target === 0 ? styles.zero : ''}`}>
            <div className={styles.fundCell}>
              <span className={styles.swatch} style={{ background: colorOf(f.symbol) }} />
              <b className={styles.symbol} style={{ fontSize: 15 }}>{f.symbol}</b>
              <span className={styles.fundName}>{f.target === 0 ? '0%, not buying' : shortName(f)}</span>
              {missing && <span className={styles.noPrice}>no price</span>}
            </div>
            <NumberField
              className={styles.targetField}
              label={`${f.symbol} target percent`}
              value={f.target}
              suffix="%"
              onCommit={n => onTarget(f.symbol, Math.min(100, Math.max(0, n)))}
            />
            {tracksHoldings && (
              <>
                <div>
                  <div className={styles.ownCell}>
                    <NumberField
                      label={`${f.symbol} you own, in ${kind === 'dollars' ? 'dollars' : 'shares'}`}
                      value={holding?.amount ?? 0}
                      prefix={kind === 'dollars' ? '$' : undefined}
                      suffix={kind === 'shares' ? 'shares' : undefined}
                      decimals={kind === 'dollars' ? 2 : 4}
                      onCommit={n => onHolding(f.symbol, n > 0 ? { kind, amount: n } : null)}
                    />
                    <span className={styles.unitToggle} role="group" aria-label={`${f.symbol} enter as`}>
                      <button
                        type="button"
                        className={kind === 'dollars' ? styles.unitOn : ''}
                        aria-pressed={kind === 'dollars'}
                        onClick={() => kind !== 'dollars' && onHolding(f.symbol, dollars > 0 ? { kind: 'dollars', amount: Math.round(dollars * 100) / 100 } : null)}
                      >$</button>
                      <button
                        type="button"
                        className={kind === 'shares' ? styles.unitOn : ''}
                        aria-pressed={kind === 'shares'}
                        disabled={!price}
                        onClick={() => kind !== 'shares' && price && onHolding(f.symbol, { kind: 'shares', amount: Math.round((dollars / price) * 10000) / 10000 })}
                      >shares</button>
                    </span>
                  </div>
                  {kind === 'shares' && holding && price != null && (
                    <div className={styles.ownHint}>= {money(dollars)}</div>
                  )}
                </div>
                <span className={styles.nowCell}>
                  {heldTotal > 0 ? (
                    <><span className={styles.phoneLabel}>Now </span>{pct1(now)} <span className={Math.abs(d) >= 5 ? styles.driftBig : styles.driftSmall}>{drift(d)}</span></>
                  ) : '—'}
                </span>
              </>
            )}
            <button type="button" className={styles.remove} onClick={() => onRemoveFund(f.symbol)} aria-label={`Remove ${f.symbol}`}>
              <CloseIcon />
            </button>
          </div>
        );
      })}

      {(searchOpen || funds.length === 0) && (
        <FundSearch onAdd={(s, n) => { onAddFund(s, n); }} existing={funds.map(f => f.symbol)} autoFocus={searchOpen} />
      )}

      {funds.length > 0 && (
        <div className={styles.mixFoot}>
          <span className={`${styles.totalText} ${off ? styles.totalOff : ''}`}>
            {off ? `Total ${+total.toFixed(2)}% · ${Math.abs(diff)}% ${diff > 0 ? 'left' : 'over'}` : 'Total 100%'}
          </span>
          {off && (
            <>
              <button type="button" className={styles.linkButton} onClick={onScale}>Scale to 100%</button>
              {largest && (
                <button type="button" className={styles.linkButton} onClick={() => onAbsorb(largest.symbol)}>
                  {diff > 0 ? `Put ${diff}% in ${largest.symbol}` : `Take ${Math.abs(diff)}% from ${largest.symbol}`}
                </button>
              )}
            </>
          )}
          {tracksHoldings && <span className={styles.num} style={{ color: 'var(--text-2)' }}>You own {money(heldTotal)}</span>}
        </div>
      )}
    </section>
  );
}
