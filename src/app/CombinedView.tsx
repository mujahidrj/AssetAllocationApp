import styles from './Calculator.module.css';
import { drift, money, pct1 } from './format';
import type { Combined } from './combined';
import { shortName } from './model';

interface CombinedViewProps {
  combined: Combined;
  colorOf: (symbol: string) => string;
  onOpen: (portfolioId: string) => void;
}

const reasonText = { 'no-holdings': 'no holdings', 'targets-off': "targets don't add up to 100%" } as const;

/** "Roth IRA, HSA" as links that open each portfolio. */
function PortfolioLinks({ list, onOpen }: { list: Array<{ id: string; name: string }>; onOpen: (id: string) => void }) {
  return (
    <>
      {list.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === list.length - 1 ? ' and ' : ', ')}
          <button type="button" className={styles.linkButton} onClick={() => onOpen(p.id)}>{p.name}</button>
        </span>
      ))}
    </>
  );
}

/**
 * Every portfolio with holdings, as one: where new money helps most, then the
 * combined split against the combined target. Read-only; trades stay per portfolio.
 */
export function CombinedView({ combined, colorOf, onOpen }: CombinedViewProps) {
  const { total, funds, portfolios, excluded, behind, unpriced } = combined;
  const withTarget = funds.filter(f => f.targetPct > 0.005);
  const withValue = funds.filter(f => f.value > 0.005);

  return (
    <>
      <section className={`${styles.card} ${styles.trades}`} aria-label="Where new money helps most">
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Where new money helps most</h2>
        </div>
        {behind.length === 0 ? (
          <div className={styles.empty}><p>Everything is within a dollar of target overall. Add new money anywhere.</p></div>
        ) : (
          behind.map(f => (
            <div key={f.symbol} className={styles.behindRow}>
              <div className={styles.fundCell}>
                <span className={styles.swatch} style={{ background: colorOf(f.symbol) }} />
                <div style={{ minWidth: 0 }}>
                  <div>
                    <b className={styles.symbol}>{f.symbol}</b>
                    <span className={styles.behindStats}> · {pct1(-f.drift)} behind · {money(f.short)} short</span>
                  </div>
                  <div className={styles.fundName}>
                    In <PortfolioLinks list={f.targetedIn} onOpen={onOpen} />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={`${styles.card} ${styles.mix}`} aria-label="All portfolios">
        <div className={styles.cardHead}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h2 className={styles.cardTitle}>All portfolios</h2>
              <span className={styles.cardSum}>{money(total)}</span>
            </div>
            <span className={styles.cardSub}>Targets are each portfolio's targets, weighted by its value.</span>
          </div>
        </div>

        <div className={styles.barLabel}>Target</div>
        <div className={styles.mixBar} role="img" aria-label={`Combined target: ${withTarget.map(f => `${f.symbol} ${pct1(f.targetPct)}`).join(', ')}`}>
          {withTarget.map(f => <span key={f.symbol} style={{ width: `${f.targetPct}%`, background: colorOf(f.symbol) }} />)}
        </div>
        <div className={styles.barLabel}>Now</div>
        <div className={styles.mixBar} role="img" aria-label={`Now: ${withValue.map(f => `${f.symbol} ${pct1(f.nowPct)}`).join(', ')}`}>
          {withValue.map(f => <span key={f.symbol} style={{ width: `${f.nowPct}%`, background: colorOf(f.symbol) }} />)}
        </div>

        <div className={styles.combinedHead}>
          <span>Fund</span><span>Target</span><span>Now</span><span>Drift</span><span>Value</span>
        </div>
        {funds.map(f => (
          <div key={f.symbol} className={styles.combinedRow}>
            <div className={styles.fundCell}>
              <span className={styles.swatch} style={{ background: colorOf(f.symbol) }} />
              <b className={styles.symbol} style={{ fontSize: 15 }}>{f.symbol}</b>
              <span className={styles.fundName}>{shortName(f)}</span>
            </div>
            <span className={styles.num}><span className={styles.phoneLabel}>Target </span>{pct1(f.targetPct)}</span>
            <span className={styles.num}><span className={styles.phoneLabel}>Now </span>{pct1(f.nowPct)}</span>
            <span className={`${styles.num} ${Math.abs(f.drift) >= 5 ? styles.driftBig : styles.driftSmall}`}>{drift(f.drift)}</span>
            <span className={`${styles.num} ${styles.combinedValue}`}>
              {unpriced.some(u => u.symbol === f.symbol) && f.value < 0.005 ? <span className={styles.noPrice}>no price</span> : money(f.value)}
            </span>
          </div>
        ))}

        <div className={styles.combinedHead} style={{ marginTop: 8 }}>
          <span>Portfolio</span><span /><span /><span>Share</span><span>Value</span>
        </div>
        {portfolios.map(p => (
          <div key={p.id} className={styles.combinedRow}>
            <div className={styles.fundCell}>
              <button type="button" className={styles.linkButton} onClick={() => onOpen(p.id)}>{p.name}</button>
            </div>
            <span /><span />
            <span className={styles.num}>{pct1(p.share)}</span>
            <span className={`${styles.num} ${styles.combinedValue}`}>{money(p.value)}</span>
          </div>
        ))}

        {unpriced.length > 0 && (
          <div className={styles.mixFoot}>
            {unpriced.map(u => (
              <span key={u.symbol}>
                No price for {u.symbol}, so it counts as $0. Add one in <PortfolioLinks list={u.heldIn} onOpen={onOpen} />.
              </span>
            ))}
          </div>
        )}
        <div className={styles.mixFoot}>
          {excluded.length > 0
            ? <span>Not included: {excluded.map(e => `${e.name}, ${reasonText[e.reason]}`).join('; ')}.</span>
            : <span>Every portfolio is included.</span>}
        </div>
      </section>
    </>
  );
}
