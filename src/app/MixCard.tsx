import { useEffect, useState, type DragEvent } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { drift, money, pct1, priceDate } from './format';
import { shortName, type Fund, type Holding, type ManualPrice } from './model';
import { holdingDollars, type OffTarget, type PriceMap } from './plan';
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

/** Type a price for a fund the lookup can't price. */
function PriceEditor({ symbol, current, onSave, onClose }: {
  symbol: string;
  current: ManualPrice | undefined;
  onSave: (price: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(current ? String(current.price) : '');
  const price = parseAmount(text);
  const valid = Number.isFinite(price) && price > 0;
  return (
    <form
      className={styles.priceEditor}
      onSubmit={e => { e.preventDefault(); if (valid) { onSave(price); onClose(); } }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <label className={styles.priceEditorLabel}>
        Price per share for {symbol}
        <span className={`${styles.field} ${styles.priceField}`}>
          <span>$</span>
          <input autoFocus inputMode="decimal" autoComplete="off" placeholder="0.00" value={text} onChange={e => setText(e.target.value)} aria-label={`Price per share for ${symbol}`} />
        </span>
      </label>
      <span className={styles.priceEditorHint}>From your broker or latest statement.</span>
      <span className={styles.priceEditorActions}>
        <button type="submit" className={styles.primary} disabled={!valid}>Save</button>
        <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onClose}>Cancel</button>
        {current && (
          <button type="button" className={styles.linkButton} onClick={() => { onSave(null); onClose(); }}>Remove my price</button>
        )}
      </span>
    </form>
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
  /** The portfolio's name, e.g. "Roth IRA" */
  title: string;
  /** e.g. "From the Vanguard 3-Fund template, edited" */
  subtitle?: string;
  onOpenPortfolios: () => void;
  /** Opens the file picker to import holdings from a broker file. */
  onImport: () => void;
  /** A file dropped on the card. */
  onImportFile: (file: File) => void;
  /** Typed prices in use (the lookup has none for these). */
  manualPrices: Record<string, ManualPrice>;
  /** The fund whose price editor is open. */
  editingPrice: string | null;
  onEditPrice: (symbol: string | null) => void;
  onSetPrice: (symbol: string, price: number | null) => void;
  /** Furthest off target, when worth a rebalance (and not already rebalancing). */
  offTarget: OffTarget | null;
  onRebalance: () => void;
}

export function MixCard(props: MixCardProps) {
  const { funds, holdings, tracksHoldings, prices, missingPrices, colorOf, onTarget, onHolding, onTracksHoldings, onAddFund, onRemoveFund, onChangeMix, onScale, onAbsorb, searchOpen, onSearchOpen, title, subtitle, onOpenPortfolios, onImport, onImportFile, manualPrices, editingPrice, onEditPrice, onSetPrice, offTarget, onRebalance } = props;
  const [dropping, setDropping] = useState(false);

  const hasFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragOver = (e: DragEvent) => { if (!hasFile(e)) return; e.preventDefault(); setDropping(true); };
  const onDragLeave = (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); };
  const onDrop = (e: DragEvent) => {
    if (!hasFile(e)) return;
    e.preventDefault();
    setDropping(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onImportFile(file);
  };

  const total = funds.reduce((sum, f) => sum + f.target, 0);
  const off = funds.length > 0 && Math.abs(total - 100) > 0.01;
  const diff = Math.round((100 - total) * 100) / 100;
  const largest = funds.length > 0 ? funds.reduce((a, b) => (b.target > a.target ? b : a)) : null;
  const heldTotal = funds.reduce((sum, f) => sum + holdingDollars(f.symbol, holdings[f.symbol], prices), 0);

  return (
    <section
      className={`${styles.card} ${styles.mix} ${tracksHoldings ? styles.withHoldings : ''} ${dropping ? styles.dropping : ''}`}
      aria-label="Your portfolio"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropping && <div className={styles.dropHint} aria-hidden="true">Drop to import into {title}</div>}
      <div className={styles.cardHead}>
        <div className={styles.titleBlock}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {subtitle && <span className={styles.cardSub}>{subtitle}</span>}
        </div>
        <button type="button" className={`${styles.headLink} ${styles.pushRight}`} onClick={onOpenPortfolios}>Switch or add portfolio</button>
      </div>
      <div className={styles.cardTools}>
        <button type="button" className={styles.headLink} onClick={onChangeMix}>Use a template</button>
        <button type="button" className={styles.headLink} onClick={() => onSearchOpen(!searchOpen)} aria-expanded={searchOpen}>+ Add fund</button>
        <button type="button" className={styles.headLink} onClick={onImport}>Import from broker</button>
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
        <div className={styles.mixBar} role="img" aria-label={`Targets: ${funds.filter(f => f.target > 0).map(f => `${f.symbol} ${f.target}%`).join(', ')}`}>
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
        const manual = manualPrices[f.symbol];

        return (
          <div key={f.symbol} className={styles.rowGroup}>
            <div className={`${styles.mixRow} ${f.target === 0 ? styles.zero : ''}`}>
              <div className={styles.fundCell}>
                <span className={styles.swatch} style={{ background: colorOf(f.symbol) }} />
                <b className={styles.symbol} style={{ fontSize: 15 }}>{f.symbol}</b>
                <span className={styles.fundName}>{f.target === 0 ? '0%, not buying' : shortName(f)}</span>
                {missing && !manual && (
                  <button type="button" className={`${styles.linkButton} ${styles.addPrice}`} onClick={() => onEditPrice(f.symbol)}>Add price</button>
                )}
                {manual && (
                  <span className={styles.yourPrice}>
                    <button type="button" className={styles.linkButton} onClick={() => onEditPrice(f.symbol)} aria-label={`Edit your price for ${f.symbol}`}>{money(manual.price)}</button>
                    {' '}· your price, {priceDate(manual.at)}
                  </span>
                )}
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
            {editingPrice === f.symbol && (
              <PriceEditor
                symbol={f.symbol}
                current={manual}
                onSave={price => onSetPrice(f.symbol, price)}
                onClose={() => onEditPrice(null)}
              />
            )}
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
          {offTarget && (
            <span className={styles.furthestOff}>
              Furthest off: {offTarget.symbol} {drift(offTarget.drift)}
              {' · '}
              <button type="button" className={styles.linkButton} onClick={onRebalance}>Rebalance</button>
            </span>
          )}
          {tracksHoldings && <span className={styles.num} style={{ color: 'var(--text-2)' }}>You own {money(heldTotal)}</span>}
        </div>
      )}
    </section>
  );
}
