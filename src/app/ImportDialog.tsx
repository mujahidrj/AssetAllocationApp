import { useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './Calculator.module.css';
import { CloseIcon } from './icons';
import { money } from './format';
import { holdingsFromAccount, sameSymbol, type ImportedAccount, type ImportedPosition, type ImportResult } from './brokerImport';
import { displayName, isCashSymbol, type Fund, type Holding, type Portfolio } from './model';
import { holdingDollars, type PriceMap } from './plan';

export interface ImportChoice {
  holdings: Record<string, Holding>;
  /** Funds from the file to add to the portfolio at 0%. */
  addFunds: Fund[];
  /** Prices from the file, for funds the lookup can't price. */
  prices: Record<string, number>;
  /** Cash in the account, to put in the amount blank (when ticked). */
  cashAmount: number | null;
}

export type ImportProblem = 'not-csv' | 'unreadable' | 'too-big';

interface ImportDialogProps {
  portfolio: Portfolio;
  fileName: string;
  /** The parsed file, or why it couldn't be read. */
  result: ImportResult | ImportProblem;
  prices: PriceMap;
  onApply: (choice: ImportChoice) => void;
  onChooseAnother: () => void;
  onClose: () => void;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The account whose name best matches the portfolio's ("ROTH IRA …4821" for "Roth IRA"). */
function bestAccount(accounts: ImportedAccount[], name: string): number {
  const n = words(name);
  if (!n) return 0;
  const i = accounts.findIndex(a => words(a.name).startsWith(n) || words(a.name).includes(n));
  return i === -1 ? 0 : i;
}

/** "210 shares", "40.5 shares", "1 share" */
const shareCount = (n: number) => `${+n.toFixed(4)} ${n === 1 ? 'share' : 'shares'}`;

const amountText = (p: Pick<ImportedPosition, 'shares' | 'value' | 'cash'>) =>
  p.shares != null && !p.cash
    ? `${shareCount(p.shares)}${p.value != null ? ` · ${money(p.value)}` : ''}`
    : money(p.value ?? 0);

const wasText = (h: Holding | undefined) =>
  !h || h.amount <= 0 ? 'was nothing' : h.kind === 'shares' ? `was ${shareCount(h.amount)}` : `was ${money(h.amount)}`;

/**
 * Review step for a broker file: pick the account, see what replaces what you own,
 * choose whether funds not in the portfolio come along, then replace.
 */
export function ImportDialog({ portfolio, fileName, result, prices, onApply, onChooseAnother, onClose }: ImportDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const name = displayName(portfolio);
  const parsed = typeof result === 'string' ? null : result;
  const accounts = parsed?.accounts ?? [];
  const [accountIndex, setAccountIndex] = useState(() => bestAccount(accounts, portfolio.name));
  const [picked, setPicked] = useState(accounts.length <= 1);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [useCash, setUseCash] = useState(false);
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const account = accounts[Math.min(accountIndex, accounts.length - 1)];
  const cashFund = portfolio.funds.find(f => isCashSymbol(f.symbol));
  /** The portfolio's own spelling of a symbol from the file (BRK-B → BRK.B), if it has the fund. */
  const mineAs = (symbol: string) => portfolio.funds.find(f => !isCashSymbol(f.symbol) && sameSymbol(f.symbol, symbol))?.symbol ?? null;

  const groups = useMemo(() => {
    if (!account) return null;
    type Row = { key: string; text: string };
    const mine: Row[] = [];
    const others: ImportedPosition[] = [];
    const inFile = new Set<string>();
    let cash = 0;
    let hasCash = false;
    account.positions.forEach(p => {
      if (p.cash) {
        hasCash = true;
        let rest = p.value ?? 0;
        // A money-market fund the portfolio targets is that fund, not cash
        Object.entries(p.moneyMarket ?? {}).forEach(([fund, value]) => {
          const k = mineAs(fund);
          if (k && value > 0) { mine.push({ key: k, text: money(value) }); inFile.add(k); rest -= value; }
        });
        cash += rest;
        return;
      }
      const k = mineAs(p.symbol);
      if (k) { mine.push({ key: k, text: amountText(p) }); inFile.add(k); } else others.push(p);
    });
    cash = Math.max(0, Math.round(cash * 100) / 100);
    if (cashFund && hasCash) { mine.push({ key: cashFund.symbol, text: money(cash) }); inFile.add(cashFund.symbol); }
    const missing = portfolio.funds.filter(f =>
      !inFile.has(f.symbol) && (f.target > 0 || (portfolio.holdings[f.symbol]?.amount ?? 0) > 0));
    return { mine, others, cash: !cashFund && cash > 0.005 ? cash : null, missing };
    // mineAs only reads portfolio.funds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, cashFund, portfolio.funds, portfolio.holdings]);

  const apply = () => {
    if (!account) return;
    const cashSymbol = cashFund?.symbol ?? 'CASH';
    const include = (symbol: string) =>
      symbol === cashSymbol ? !!cashFund : portfolio.funds.some(f => f.symbol === symbol) || adding.has(symbol);
    const { holdings, prices: filePrices } = holdingsFromAccount(account, {
      include,
      cashSymbol,
      symbolFor: s => mineAs(s) ?? s,
    });
    const addFunds: Fund[] = (groups?.others ?? [])
      .filter(p => adding.has(p.symbol))
      .map(p => ({ symbol: p.symbol, target: 0, ...(p.description ? { name: p.description } : {}) }));
    onApply({
      holdings,
      addFunds,
      prices: filePrices,
      cashAmount: useCash && groups?.cash ? groups.cash : null,
    });
  };

  const brokerLine = [parsed?.broker, fileName].filter(Boolean).join(' · ');

  // What "Replace holdings" will put in
  const replacedValue = groups && account
    ? account.positions.reduce((sum, p) => {
        if (p.cash) {
          const claimed = Object.entries(p.moneyMarket ?? {}).filter(([f]) => mineAs(f)).reduce((a, [, v]) => a + v, 0);
          return sum + claimed + (cashFund ? Math.max(0, (p.value ?? 0) - claimed) : 0);
        }
        return sum + (mineAs(p.symbol) || adding.has(p.symbol) ? p.value ?? 0 : 0);
      }, 0)
    : 0;
  const fundCount = groups ? groups.mine.length + groups.others.filter(p => adding.has(p.symbol)).length : 0;

  const problem = typeof result === 'string' ? result : accounts.length === 0 ? (parsed?.recognized ? 'empty' : 'unreadable') : null;

  return (
    <div className={styles.dialogBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className={styles.dialogHead}>
          <div className={styles.titleBlock}>
            <h2 className={styles.cardTitle} id={titleId}>
              {problem ? "We couldn't read this file" : `Import holdings into ${name}`}
            </h2>
            {brokerLine && <span className={styles.cardSub}>{brokerLine}</span>}
          </div>
          <button type="button" className={`${styles.remove} ${styles.pushRight}`} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {problem && (
          <div className={styles.dialogBody}>
            <p>
              {problem === 'not-csv' ? 'That isn’t a CSV file. Export your positions as .csv and try again.'
                : problem === 'too-big' ? 'That file is too big to be a positions export.'
                : problem === 'empty' ? 'This file has no positions in it.'
                : 'Use the Positions export from Fidelity, Schwab or Vanguard, saved as CSV.'}
            </p>
            {howTo && (
              <ul className={styles.howTo}>
                <li><b>Fidelity:</b> Accounts &amp; Trade → Portfolio → Positions, then Download (top right).</li>
                <li><b>Schwab:</b> Accounts → Positions, then Export (top right).</li>
                <li><b>Vanguard:</b> Download center, then choose a CSV file of your holdings.</li>
                <li><b>Anything else:</b> a CSV with a Symbol column and a Shares or Value column.</li>
              </ul>
            )}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primary} onClick={onChooseAnother}>Choose another file</button>
              {!howTo && <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => setHowTo(true)}>How to export</button>}
            </div>
          </div>
        )}

        {!problem && !picked && (
          <div className={styles.dialogBody}>
            <fieldset className={styles.accountPick}>
              <legend className={styles.importHeading}>Which account is {name}?</legend>
              {accounts.map((a, i) => (
                <label key={a.name} className={styles.accountRow}>
                  <input type="radio" name="import-account" checked={i === accountIndex} onChange={() => setAccountIndex(i)} />
                  <span className={styles.accountName}>{a.name}</span>
                  <span className={styles.num}>
                    {a.positions.length} {a.positions.length === 1 ? 'position' : 'positions'} · {money(a.total)}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primary} onClick={() => setPicked(true)}>Next</button>
              <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {!problem && picked && groups && (
          <div className={styles.dialogBody}>
            {accounts.length > 1 && (
              <p className={styles.importNote}>
                From {account.name}.{' '}
                <button type="button" className={styles.linkButton} onClick={() => setPicked(false)}>Change account</button>
              </p>
            )}

            {(groups.mine.length > 0 || groups.missing.length > 0) && (
              <section>
                <h3 className={styles.importHeading}>In this portfolio</h3>
                {groups.mine.map(row => (
                  <div key={row.key} className={styles.importRow}>
                    <b className={styles.symbol}>{row.key}</b>
                    <span className={styles.num}>{row.text}</span>
                    <span className={styles.importWas}>{wasText(portfolio.holdings[row.key])}</span>
                  </div>
                ))}
                {groups.missing.map(f => (
                  <div key={f.symbol} className={styles.importRow}>
                    <b className={styles.symbol}>{f.symbol}</b>
                    <span>Not in file, set to 0</span>
                    <span className={styles.importWas}>
                      {(portfolio.holdings[f.symbol]?.amount ?? 0) > 0
                        ? portfolio.holdings[f.symbol].kind === 'shares' && prices[f.symbol] == null
                          ? wasText(portfolio.holdings[f.symbol])
                          : `was ${money(holdingDollars(f.symbol, portfolio.holdings[f.symbol], prices))}`
                        : ''}
                    </span>
                  </div>
                ))}
              </section>
            )}

            {groups.others.length > 0 && (
              <section>
                <h3 className={styles.importHeading}>Not in this portfolio</h3>
                {groups.others.map(p => (
                  <label key={p.symbol} className={styles.importRow}>
                    <b className={styles.symbol}>{p.symbol}</b>
                    <span className={styles.num}>{amountText(p)}</span>
                    <span className={styles.importCheck}>
                      <input
                        type="checkbox"
                        checked={adding.has(p.symbol)}
                        onChange={e => setAdding(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.symbol); else next.delete(p.symbol);
                          return next;
                        })}
                      />
                      Add at 0%
                    </span>
                  </label>
                ))}
                <p className={styles.importNote}>Funds at 0% count toward your total and get sold when selling is allowed.</p>
              </section>
            )}

            {groups.cash && (
              <section>
                <h3 className={styles.importHeading}>Cash</h3>
                <label className={styles.importRow}>
                  <b className={styles.symbol}>Cash</b>
                  <span className={styles.num}>{money(groups.cash)}</span>
                  <span className={styles.importCheck}>
                    <input type="checkbox" checked={useCash} onChange={e => setUseCash(e.target.checked)} />
                    Use as the amount I want to add
                  </span>
                </label>
              </section>
            )}

            <p className={styles.importSummary}>
              {fundCount === 0
                ? `Clears what you own in ${name}: nothing in this account matches it.`
                : `Replaces what you own in ${name}: ${fundCount} ${fundCount === 1 ? 'fund' : 'funds'}, ${money(replacedValue)}.`}
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primary} onClick={apply}>Replace holdings</button>
              <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
