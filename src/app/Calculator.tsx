import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { parseAmount } from '../lib/parseAmount';
import { buildShareLink, clearSharedMixFromUrl, readSharedMix } from '../lib/shareLink';
import styles from './Calculator.module.css';
import { formatAmountInput, money } from './format';
import { Header } from './Header';
import { CopyIcon } from './icons';
import { MixCard } from './MixCard';
import { displayName, sentenceName, type Fund, type Verb } from './model';
import { makePlan } from './plan';
import { PortfolioMenu } from './PortfolioMenu';
import { Sentence } from './Sentence';
import { matchingTemplate, templates } from './templates';
import { Trades, tradesCsv, tradesText } from './Trades';
import { usePortfolios, type RemovedPortfolio } from './usePortfolios';
import { usePrices } from './usePrices';
import { useTheme } from './useTheme';
import { stocksFromFunds } from './storage';

const NAME_SUGGESTIONS = ['Roth IRA', 'Traditional IRA', '401(k)', 'Taxable account', 'HSA', "Spouse's IRA"];

export function Calculator() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const { workspace, portfolio, actions, portfolioActions, saveState, savedTo } = usePortfolios(user);
  const { funds, holdings, tracksHoldings, sell } = portfolio;
  const theme = useTheme();

  const symbols = useMemo(() => {
    const list = funds.map(f => f.symbol);
    if (tracksHoldings) Object.keys(holdings).forEach(s => { if (!list.includes(s)) list.push(s); });
    return list;
  }, [funds, holdings, tracksHoldings]);
  const priceData = usePrices(symbols);

  const [verb, setVerb] = useState<Verb>('add');
  const [amountText, setAmountText] = useState('');
  const [menu, setMenu] = useState<null | 'list' | 'mix'>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<RemovedPortfolio | null>(null);
  const [sharedMix, setSharedMix] = useState<Fund[] | null>(() =>
    readSharedMix()?.map(s => ({ symbol: s.name, target: s.percentage })) ?? null
  );
  const blankRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(copyTimer.current); clearTimeout(toastTimer.current); }, []);

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

  // "From the Vanguard 3-Fund template", or "…, edited" once it no longer matches
  const startedFrom = templates.find(t => t.id === portfolio.templateId);
  const mixSubtitle = startedFrom
    ? `From the ${startedFrom.group === 'sharia' ? `Sharia ${startedFrom.label}` : startedFrom.label} template${matchingTemplate(funds)?.id === startedFrom.id ? '' : ', edited'}`
    : undefined;

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
    a.download = `${displayName(portfolio).replace(/[^\w-]+/g, '-').toLowerCase()}-trades.csv`;
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
  const applyMix = (next: Fund[], templateId?: string) => {
    const held = tracksHoldings
      ? Object.entries(holdings).filter(([s, h]) => h.amount > 0 && !next.some(f => f.symbol === s)).map(([s]) => {
          const existing = funds.find(f => f.symbol === s);
          return { symbol: s, target: 0, ...(existing?.name ? { name: existing.name } : {}) };
        })
      : [];
    actions.applyMix([...next, ...held], templateId);
  };

  const buildOwn = () => {
    actions.applyMix(funds.filter(f => (holdings[f.symbol]?.amount ?? 0) > 0).map(f => ({ ...f, target: 0 })));
    setSearchOpen(true);
  };

  const newPortfolio = (mix?: Fund[]) => {
    const id = portfolioActions.create(mix ? { funds: mix } : {});
    setNamingId(id);
    setSearchOpen(false);
  };

  const deletePortfolio = (id: string) => {
    const removed = portfolioActions.remove(id);
    if (!removed) return;
    setDeleted(removed);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setDeleted(null), 8000);
  };

  const undoDelete = () => {
    if (deleted) portfolioActions.restore(deleted);
    setDeleted(null);
    clearTimeout(toastTimer.current);
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  // Share-link choices: with one empty portfolio there's nothing to protect
  const onlyEmpty = workspace.portfolios.length === 1 && funds.length === 0;
  const dismissShared = () => { setSharedMix(null); clearSharedMixFromUrl(); };

  const ok = plan.status === 'ok';
  const buyCount = plan.trades.filter(t => t.action === 'buy').length;
  const sellCount = plan.trades.length - buyCount;
  const copyBarLabel = copied
    ? 'Copied'
    : !ok ? 'Copy trades'
    : sellCount === 0 ? `Copy ${buyCount} ${buyCount === 1 ? 'buy' : 'buys'} · ${money(plan.net)}`
    : buyCount === 0 ? `Copy ${sellCount} ${sellCount === 1 ? 'sell' : 'sells'} · ${money(-plan.net)}`
    : `Copy ${plan.trades.length} trades`;

  const naming = namingId === portfolio.id;

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
            <p>Someone shared a portfolio: <b className={styles.num}>{sharedMix.map(f => `${f.symbol} ${f.target}`).join(' · ')}</b></p>
            {onlyEmpty ? (
              <button type="button" className={styles.primary} onClick={() => { applyMix(sharedMix); dismissShared(); }}>Use these funds</button>
            ) : (
              <>
                <button type="button" className={styles.primary} onClick={() => { newPortfolio(sharedMix); dismissShared(); }}>Save as new portfolio</button>
                <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => { applyMix(sharedMix); dismissShared(); }}>
                  Use in {sentenceName(portfolio.name)}
                </button>
              </>
            )}
            <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={dismissShared}>No thanks</button>
          </div>
        )}

        <div className={styles.sentenceWrap}>
          <Sentence
            ref={blankRef}
            verb={effectiveVerb}
            onVerb={setVerb}
            canRebalance={tracksHoldings}
            amount={amountText}
            onAmount={setAmountText}
            onAmountBlur={() => { if (Number.isFinite(amount) && amount > 0) setAmountText(formatAmountInput(amount)); }}
            portfolioLabel={sentenceName(portfolio.name)}
            onPortfolioClick={() => setMenu(m => (m ? null : 'list'))}
            menuOpen={menu !== null}
            showSell={tracksHoldings && effectiveVerb === 'add'}
            sell={sell}
            onSell={actions.setSell}
          />
          {menu && (
            <PortfolioMenu
              portfolios={workspace.portfolios}
              activeId={portfolio.id}
              anchor={blankRef.current}
              startOnMix={menu === 'mix'}
              onClose={closeMenu}
              onSwitch={id => { portfolioActions.switchTo(id); setSearchOpen(false); }}
              onNew={() => newPortfolio()}
              onDuplicate={() => {
                const id = portfolioActions.duplicate();
                setNamingId(id);
              }}
              onRename={portfolioActions.rename}
              onDelete={deletePortfolio}
              onPickMix={applyMix}
              onBuildOwn={buildOwn}
            />
          )}
        </div>
        <p className={`${styles.helper} ${helper.error ? styles.helperError : ''}`}>
          {helper.text}{' '}
          {helper.addOwn && (
            <>
              <button type="button" className={styles.linkButton} onClick={() => actions.setTracksHoldings(true)}>Add what you own</button>
              {' '}to {helper.addOwn}
            </>
          )}
        </p>

        {naming && (
          <form
            className={`${styles.card} ${styles.nameCard}`}
            onSubmit={e => { e.preventDefault(); setNamingId(null); }}
          >
            <label className={styles.nameLabel}>
              Name this portfolio
              <input
                className={styles.nameInput}
                autoFocus
                onFocus={e => e.currentTarget.select()}
                placeholder="Name it, e.g. Roth IRA"
                value={portfolio.name}
                onChange={e => portfolioActions.rename(portfolio.id, e.target.value)}
              />
            </label>
            <div className={styles.chips}>
              {NAME_SUGGESTIONS.map(n => (
                <button key={n} type="button" className={styles.chip} onClick={() => { portfolioActions.rename(portfolio.id, n); setNamingId(null); }}>
                  {n}
                </button>
              ))}
              <button type="submit" className={styles.headLink}>Done</button>
            </div>
          </form>
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
            title={displayName(portfolio)}
            subtitle={mixSubtitle}
            onOpenPortfolios={() => { setMenu('list'); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}
            onTarget={actions.setTarget}
            onHolding={actions.setHolding}
            onTracksHoldings={actions.setTracksHoldings}
            onAddFund={(s, n) => { actions.addFund(s, n); setSearchOpen(false); }}
            onRemoveFund={actions.removeFund}
            onChangeMix={() => { setMenu('mix'); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}
            onScale={actions.scaleTo100}
            onAbsorb={actions.absorbRemainder}
            searchOpen={searchOpen}
            onSearchOpen={setSearchOpen}
          />
        )}

        <p className={styles.footnote}>A calculator, not financial advice.</p>
      </main>

      {deleted && (
        <div className={styles.toast} role="status">
          Deleted {displayName(deleted.portfolio)}.
          <button type="button" className={styles.toastUndo} onClick={undoDelete}>Undo</button>
        </div>
      )}

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
