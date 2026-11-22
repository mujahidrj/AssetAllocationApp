import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { parseAmount } from '../lib/parseAmount';
import { buildShareLink, clearSharedMixFromUrl, readSharedMix } from '../lib/shareLink';
import styles from './Calculator.module.css';
import { formatAmountInput, money } from './format';
import { Header } from './Header';
import { CopyIcon } from './icons';
import { MixCard } from './MixCard';
import { MixPicker } from './MixPicker';
import type { Fund, Verb } from './model';
import { makePlan } from './plan';
import { Sentence } from './Sentence';
import { matchingTemplate } from './templates';
import { Trades, tradesCsv, tradesText } from './Trades';
import { usePortfolio } from './usePortfolio';
import { usePrices } from './usePrices';
import { useTheme } from './useTheme';
import { stocksFromFunds } from './storage';

export function Calculator() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const { portfolio, actions, saveState, savedTo } = usePortfolio(user);
  const { funds, holdings, tracksHoldings } = portfolio;
  const theme = useTheme();

  const symbols = useMemo(() => {
    const list = funds.map(f => f.symbol);
    if (tracksHoldings) Object.keys(holdings).forEach(s => { if (!list.includes(s)) list.push(s); });
    return list;
  }, [funds, holdings, tracksHoldings]);
  const priceData = usePrices(symbols);

  const [verb, setVerb] = useState<Verb>('add');
  const [amountText, setAmountText] = useState('');
  const [sell, setSell] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharedMix, setSharedMix] = useState<Fund[] | null>(() =>
    readSharedMix()?.map(s => ({ symbol: s.name, target: s.percentage })) ?? null
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const effectiveVerb: Verb = !tracksHoldings && verb === 'rebal' ? 'add' : verb;
  const amount = parseAmount(amountText);
  const amountInvalid = amountText.trim() !== '' && !Number.isFinite(amount);

  const plan = useMemo(() => makePlan({
    funds,
    holdings,
    tracksHoldings,
    verb: effectiveVerb,
    amount: Number.isFinite(amount) ? amount : 0,
    sell,
    prices: priceData.prices,
  }), [funds, holdings, tracksHoldings, effectiveVerb, amount, sell, priceData.prices]);

  const fundColors = useMemo(() => {
    const map: Record<string, string> = {};
    symbols.forEach((s, i) => { map[s] = `var(--fund-${(i % 5) + 1})`; });
    return map;
  }, [symbols]);
  const colorOf = useCallback((s: string) => fundColors[s] ?? 'var(--fund-5)', [fundColors]);

  const missingPrices = symbols.filter(s => priceData.info[s]?.status === 'missing');
  const targetsOk = funds.length > 0 && Math.abs(funds.reduce((sum, f) => sum + f.target, 0) - 100) <= 0.01;

  const template = matchingTemplate(funds);
  const mixLabel = funds.length === 0
    ? 'pick a mix'
    : template
      ? (template.group === 'sharia' ? `the ${template.label} Sharia mix` : `the ${template.label}`)
      : 'my mix';

  const helper = (() => {
    if (amountInvalid) return { text: 'Type an amount like 2,500 or $2,500.50.', error: true };
    if (!tracksHoldings) {
      return {
        text: effectiveVerb === 'out' ? 'No holdings added, so this sells by your targets.' : 'No holdings added, so this splits by your targets.',
        addOwn: effectiveVerb === 'out' ? "sell from what's furthest over first." : "buy only what's behind.",
      };
    }
    if (effectiveVerb === 'rebal') return { text: 'Moving money between funds so each one lands on target. No new cash.' };
    if (effectiveVerb === 'out') return { text: "Selling from whatever's furthest over target first." };
    return { text: sell ? 'Buying and selling so every fund lands exactly on target.' : "Buying only what's behind target, so nothing gets sold." };
  })();

  const copyTrades = async () => {
    try {
      await navigator.clipboard.writeText(tradesText(plan.trades, priceData.asOf));
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked; the trades are still on screen
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([tradesCsv(plan.trades)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async (): Promise<string | null> => {
    const link = buildShareLink(stocksFromFunds(funds));
    try {
      await navigator.clipboard.writeText(link);
      return null;
    } catch {
      return link;
    }
  };

  /** Applying a mix keeps funds you hold, at 0%, so they can be sold. */
  const applyMix = (next: Fund[]) => {
    const held = tracksHoldings
      ? Object.entries(holdings).filter(([s, h]) => h.amount > 0 && !next.some(f => f.symbol === s)).map(([s]) => {
          const existing = funds.find(f => f.symbol === s);
          return { symbol: s, target: 0, ...(existing?.name ? { name: existing.name } : {}) };
        })
      : [];
    actions.applyMix([...next, ...held]);
  };

  const buildOwn = () => {
    actions.applyMix(funds.filter(f => (holdings[f.symbol]?.amount ?? 0) > 0).map(f => ({ ...f, target: 0 })));
    setSearchOpen(true);
  };

  const ok = plan.status === 'ok';
  const buyCount = plan.trades.filter(t => t.action === 'buy').length;
  const sellCount = plan.trades.length - buyCount;
  const copyBarLabel = copied
    ? 'Copied'
    : !ok ? 'Copy trades'
    : sellCount === 0 ? `Copy ${buyCount} ${buyCount === 1 ? 'buy' : 'buys'} · ${money(plan.net)}`
    : buyCount === 0 ? `Copy ${sellCount} ${sellCount === 1 ? 'sell' : 'sells'} · ${money(-plan.net)}`
    : `Copy ${plan.trades.length} trades`;

  return (
    <div className={styles.page}>
      <Header
        user={user}
        savedTo={savedTo}
        saveState={saveState}
        onSignIn={() => { void signInWithGoogle(); }}
        onSignOut={() => { void signOut(); }}
        theme={theme.mode}
        onTheme={theme.setMode}
        onShare={share}
        canShare={targetsOk}
      />

      <main className={styles.main}>
        {sharedMix && (
          <div className={styles.banner} role="status">
            <p>Someone shared a mix with you: <b className={styles.num}>{sharedMix.map(f => `${f.symbol} ${f.target}%`).join(' · ')}</b></p>
            <button type="button" className={styles.primary} onClick={() => { applyMix(sharedMix); setSharedMix(null); clearSharedMixFromUrl(); }}>Use this mix</button>
            <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => { setSharedMix(null); clearSharedMixFromUrl(); }}>No thanks</button>
          </div>
        )}

        <Sentence
          verb={effectiveVerb}
          onVerb={setVerb}
          canRebalance={tracksHoldings}
          amount={amountText}
          onAmount={setAmountText}
          onAmountBlur={() => { if (Number.isFinite(amount) && amount > 0) setAmountText(formatAmountInput(amount)); }}
          mixLabel={mixLabel}
          onMixClick={() => setPickerOpen(o => !o)}
          mixOpen={pickerOpen}
          showSell={tracksHoldings && effectiveVerb === 'add'}
          sell={sell}
          onSell={setSell}
        />
        <p className={`${styles.helper} ${helper.error ? styles.helperError : ''}`}>
          {helper.text}{' '}
          {helper.addOwn && (
            <>
              <button type="button" className={styles.linkButton} onClick={() => actions.setTracksHoldings(true)}>Add what you own</button>
              {' '}to {helper.addOwn}
            </>
          )}
        </p>

        {pickerOpen && (
          <MixPicker current={funds} onPick={applyMix} onBuildOwn={buildOwn} onClose={() => setPickerOpen(false)} />
        )}

        <Trades
          plan={plan}
          funds={funds}
          colorOf={colorOf}
          asOf={priceData.asOf}
          pricesLoading={priceData.loading}
          onRefresh={priceData.refresh}
          copied={copied}
          onCopy={copyTrades}
          onCsv={downloadCsv}
          onPickMix={applyMix}
          onBuildOwn={buildOwn}
        />

        {(funds.length > 0 || searchOpen) && (
          <MixCard
            funds={funds}
            holdings={holdings}
            tracksHoldings={tracksHoldings}
            prices={priceData.prices}
            missingPrices={missingPrices}
            colorOf={colorOf}
            onTarget={actions.setTarget}
            onHolding={actions.setHolding}
            onTracksHoldings={actions.setTracksHoldings}
            onAddFund={(s, n) => { actions.addFund(s, n); setSearchOpen(false); }}
            onRemoveFund={actions.removeFund}
            onChangeMix={() => { setPickerOpen(true); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}
            onScale={actions.scaleTo100}
            onAbsorb={actions.absorbRemainder}
            searchOpen={searchOpen}
            onSearchOpen={setSearchOpen}
          />
        )}

        <p className={styles.footnote}>A calculator, not financial advice.</p>
      </main>

      {plan.status !== 'needs-mix' && (
        <div className={styles.copyBar}>
          <button type="button" className={styles.primary} onClick={copyTrades} disabled={!ok}>
            <CopyIcon />{copyBarLabel}
          </button>
        </div>
      )}
    </div>
  );
}
