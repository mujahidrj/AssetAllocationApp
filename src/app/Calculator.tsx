import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/useAuth';
import type { AuthProblem } from '../lib/authContext';
import { parseAmount } from '../lib/parseAmount';
import { buildShareLink, clearSharedMixFromUrl, readSharedMix } from '../lib/shareLink';
import styles from './Calculator.module.css';
import { parseBrokerCsv, type ImportResult } from './brokerImport';
import { combinePortfolios } from './combined';
import { CombinedView } from './CombinedView';
import { formatAmountInput, money } from './format';
import { Header } from './Header';
import { CloseIcon, CopyIcon } from './icons';
import { ImportDialog, type ImportChoice, type ImportProblem } from './ImportDialog';
import { MixCard } from './MixCard';
import { displayName, sentenceName, type Fund, type ManualPrice, type Verb } from './model';
import { makePlan, type PriceMap } from './plan';
import { PortfolioMenu } from './PortfolioMenu';
import { Sentence } from './Sentence';
import { matchingTemplate, templates } from './templates';
import { Trades } from './Trades';
import { tradesCsv, tradesText } from './tradeText';
import { usePortfolios, type RemovedPortfolio } from './usePortfolios';
import { usePrices } from './usePrices';
import { useTheme } from './useTheme';
import { stocksFromFunds } from './storage';

const NAME_SUGGESTIONS = ['Roth IRA', 'Traditional IRA', '401(k)', 'Taxable account', 'HSA', "Spouse's IRA"];
const MAIN_SITE = 'https://asset-allocation-app-nine.vercel.app/';
const UNDO_MS = 8000;

/** One message at a time, in the toast spot: an undo, or a problem with what to do about it. */
interface Notice {
  key: string;
  text: string;
  action?: { label: string; run: () => void };
  /** Closes by itself after this long (undo and success messages). Problems stay until dismissed. */
  timeout?: number;
  onDismiss?: () => void;
}

const AUTH_TEXT: Record<AuthProblem, string> = {
  'popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'unauthorized-domain': 'Sign-in only works on the main site.',
  network: "Couldn't reach Google. Check your connection.",
  'not-configured': "Sign-in isn't available right now.",
  'sign-in-failed': "Couldn't sign you in. Try again in a moment.",
  'sign-out-failed': "Couldn't sign you out. Try again.",
};

/** Reads a dropped or chosen file as text (FileReader works everywhere, Blob.text() not quite). */
const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(file);
});

export function Calculator() {
  const { user, signInWithGoogle, signOut, problem: authProblem, clearProblem } = useAuth();
  const {
    workspace, portfolio, actions, portfolioActions, priceActions,
    saveState, savedTo, loadFailed, retryLoad, retrySave, deviceSaveFailed,
  } = usePortfolios(user);
  const { funds, holdings, tracksHoldings, sell } = portfolio;
  const wholeShares = portfolio.wholeShares === true;
  const manualPrices = useMemo(() => workspace.manualPrices ?? {}, [workspace.manualPrices]);
  const theme = useTheme();

  // This portfolio's funds, plus anything held that's no longer in its targets
  const symbols = useMemo(() => {
    const list = funds.map(f => f.symbol);
    if (tracksHoldings) Object.keys(holdings).forEach(s => { if (!list.includes(s)) list.push(s); });
    return list;
  }, [funds, holdings, tracksHoldings]);

  // Prices for every portfolio, so "All portfolios" can add them up
  const allSymbols = useMemo(() => {
    const list = [...symbols];
    workspace.portfolios.forEach(p => {
      p.funds.forEach(f => { if (!list.includes(f.symbol)) list.push(f.symbol); });
      if (p.tracksHoldings) Object.keys(p.holdings).forEach(s => { if (!list.includes(s)) list.push(s); });
    });
    return list;
  }, [symbols, workspace.portfolios]);
  const priceData = usePrices(allSymbols);

  // The live price wins; a typed price fills in only where the lookup has none
  const prices = useMemo(() => {
    const map: PriceMap = { ...priceData.prices };
    Object.entries(manualPrices).forEach(([s, m]) => { if (map[s] == null) map[s] = m.price; });
    return map;
  }, [priceData.prices, manualPrices]);
  const manualInUse = useMemo(() => {
    const used: Record<string, ManualPrice> = {};
    allSymbols.forEach(s => { if (priceData.prices[s] == null && manualPrices[s]) used[s] = manualPrices[s]; });
    return used;
  }, [allSymbols, priceData.prices, manualPrices]);

  // Once the lookup can price a fund again, the typed price goes
  const { dropManualPrices } = priceActions;
  useEffect(() => {
    const live = Object.keys(manualPrices).filter(s => priceData.info[s]?.status === 'ok');
    if (live.length > 0) dropManualPrices(live);
  }, [priceData.info, manualPrices, dropManualPrices]);

  const pricesLoading = symbols.some(s => priceData.info[s]?.status === 'loading');
  const asOf = symbols.map(s => priceData.info[s]?.asOf).filter((t): t is string => !!t).sort()[0] ?? null;

  const [view, setView] = useState<'one' | 'all'>('one');
  const [verb, setVerb] = useState<Verb>('add');
  const [amountText, setAmountText] = useState('');
  const [menu, setMenu] = useState<null | 'list' | 'mix'>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [namingId, setNamingId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [textFallback, setTextFallback] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; result: ImportResult | ImportProblem } | null>(null);
  const [flash, setFlash] = useState<Notice | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [sharedMix, setSharedMix] = useState<Fund[] | null>(() =>
    readSharedMix()?.map(s => ({ symbol: s.name, target: s.percentage })) ?? null
  );
  const blankRef = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(copyTimer.current); clearTimeout(flashTimer.current); }, []);

  const showFlash = useCallback((notice: Notice | null) => {
    clearTimeout(flashTimer.current);
    setFlash(notice);
    if (notice?.timeout) flashTimer.current = setTimeout(() => setFlash(f => (f?.key === notice.key ? null : f)), notice.timeout);
  }, []);

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
    prices,
    wholeShares,
  }), [funds, holdings, tracksHoldings, effectiveVerb, amount, sell, prices, wholeShares]);

  // Copied-text fallback goes stale as soon as the trades change
  const tradesKey = tradesText(plan, asOf, wholeShares);
  useEffect(() => { setTextFallback(null); }, [tradesKey]);

  const combined = useMemo(() => combinePortfolios(workspace.portfolios, prices), [workspace.portfolios, prices]);
  const showingAll = view === 'all' && combined.portfolios.length >= 2;

  const colorSymbols = showingAll ? combined.funds.map(f => f.symbol) : symbols;
  const fundColors = useMemo(() => {
    const map: Record<string, string> = {};
    colorSymbols.forEach((s, i) => { map[s] = `var(--fund-${(i % 5) + 1})`; });
    return map;
  }, [colorSymbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = useCallback((s: string) => fundColors[s] ?? 'var(--fund-5)', [fundColors]);

  const missingPrices = symbols.filter(s => priceData.info[s]?.status === 'missing' && !manualPrices[s]);
  const targetsOk = funds.length > 0 && Math.abs(funds.reduce((sum, f) => sum + f.target, 0) - 100) <= 0.01;

  // "From the Vanguard 3-Fund template", or "…, edited" once it no longer matches
  const startedFrom = templates.find(t => t.id === portfolio.templateId);
  const mixSubtitle = startedFrom
    ? `From the ${startedFrom.group === 'sharia' ? `Sharia ${startedFrom.label}` : startedFrom.label} template${matchingTemplate(funds)?.id === startedFrom.id ? '' : ', edited'}`
    : undefined;

  const helper = (() => {
    if (showingAll) return { text: 'Read-only. Pick one portfolio to get trades.' };
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
    const text = tradesText(plan, asOf, wholeShares);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      showFlash({ key: 'copy', text: "Couldn't copy.", action: { label: 'Show as text', run: () => setTextFallback(text) } });
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
    setView('one');
  };

  const openPortfolio = (id: string) => {
    portfolioActions.switchTo(id);
    setSearchOpen(false);
    setEditingPrice(null);
    setView('one');
  };

  const deletePortfolio = (id: string) => {
    const removed: RemovedPortfolio | null = portfolioActions.remove(id);
    if (!removed) return;
    showFlash({
      key: 'deleted',
      text: `Deleted ${displayName(removed.portfolio)}.`,
      action: { label: 'Undo', run: () => portfolioActions.restore(removed) },
      timeout: UNDO_MS,
    });
  };

  /* ---------- Import from a broker file ---------- */

  const readImportFile = async (file: File) => {
    if (file.size > 5_000_000) { setImporting({ fileName: file.name, result: 'too-big' }); return; }
    const looksLikeText = /\.(csv|txt|tsv)$/i.test(file.name) || /csv|text\/plain|tab-separated/.test(file.type);
    if (!looksLikeText) { setImporting({ fileName: file.name, result: 'not-csv' }); return; }
    try {
      setImporting({ fileName: file.name, result: parseBrokerCsv(await readText(file)) });
    } catch {
      setImporting({ fileName: file.name, result: 'unreadable' });
    }
  };

  const applyImport = (choice: ImportChoice) => {
    const broker = importing && typeof importing.result !== 'string' ? importing.result.broker : null;
    const snapshot = actions.importHoldings(choice.holdings, choice.addFunds);
    // The file's prices stand in only where the lookup can't price a fund
    const fill = Object.fromEntries(Object.entries(choice.prices).filter(([s]) => priceData.info[s]?.status !== 'ok'));
    priceActions.addManualPrices(fill);
    if (choice.cashAmount) {
      setVerb('add');
      setAmountText(formatAmountInput(choice.cashAmount));
    }
    setImporting(null);
    showFlash({
      key: 'imported',
      text: broker ? `Holdings imported from ${broker}.` : 'Holdings imported.',
      action: { label: 'Undo', run: () => actions.restoreHoldings(snapshot) },
      timeout: UNDO_MS,
    });
  };

  /* ---------- Messages ---------- */

  // Problems that last until they're fixed or dismissed
  const problems: Notice[] = [];
  if (authProblem) {
    const retrySignIn = { label: 'Try again', run: () => { void signInWithGoogle(); } };
    problems.push({
      key: `auth-${authProblem}`,
      text: AUTH_TEXT[authProblem],
      action: authProblem === 'unauthorized-domain' ? { label: 'Go to main site', run: () => { window.location.href = MAIN_SITE; } }
        : authProblem === 'sign-out-failed' ? { label: 'Try again', run: () => { void signOut(); } }
        : authProblem === 'not-configured' ? undefined
        : retrySignIn,
      onDismiss: clearProblem,
    });
  }
  if (loadFailed) {
    problems.push({ key: 'load', text: "Couldn't load your portfolios from your account. Nothing will be saved until they load.", action: { label: 'Try again', run: retryLoad } });
  } else if (savedTo === 'account' && saveState === 'error') {
    problems.push({ key: 'save', text: "Couldn't save to your account. Check your connection.", action: { label: 'Retry', run: retrySave } });
  }
  if (savedTo === 'device' && deviceSaveFailed) {
    problems.push({ key: 'device', text: "This browser isn't saving changes. They'll be gone when you close the tab.", action: { label: 'Sign in to sync', run: () => { void signInWithGoogle(); } } });
  }
  // A problem that was dismissed comes back if it happens again later
  useEffect(() => { if (!loadFailed) setDismissed(d => d.filter(k => k !== 'load')); }, [loadFailed]);
  useEffect(() => { if (saveState !== 'error') setDismissed(d => d.filter(k => k !== 'save')); }, [saveState]);

  const notice = flash ?? problems.find(p => !dismissed.includes(p.key)) ?? null;
  const dismiss = (n: Notice) => {
    if (n === flash) showFlash(null);
    else if (n.onDismiss) n.onDismiss();
    else setDismissed(d => [...d, n.key]);
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeImport = useCallback(() => setImporting(null), []);

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

  const naming = namingId === portfolio.id && !showingAll;

  return (
    <div className={styles.page}>
      <Header
        user={user}
        savedTo={savedTo}
        saveState={saveState}
        loadFailed={loadFailed}
        onSignIn={() => { void signInWithGoogle(); }}
        onSignOut={() => { void signOut(); }}
        theme={theme.mode}
        onTheme={theme.setMode}
        onShare={share}
        canShare={targetsOk && !showingAll}
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
                <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => { applyMix(sharedMix); dismissShared(); setView('one'); }}>
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
            portfolioLabel={showingAll ? 'all my portfolios' : sentenceName(portfolio.name)}
            onPortfolioClick={() => setMenu(m => (m ? null : 'list'))}
            menuOpen={menu !== null}
            showSell={tracksHoldings && effectiveVerb === 'add'}
            sell={sell}
            onSell={actions.setSell}
            all={showingAll}
          />
          {menu && (
            <PortfolioMenu
              portfolios={workspace.portfolios}
              activeId={portfolio.id}
              anchor={blankRef.current}
              startOnMix={menu === 'mix'}
              onClose={closeMenu}
              onSwitch={openPortfolio}
              onNew={() => newPortfolio()}
              onDuplicate={() => {
                const id = portfolioActions.duplicate();
                setNamingId(id);
              }}
              onRename={portfolioActions.rename}
              onDelete={deletePortfolio}
              onPickMix={applyMix}
              onBuildOwn={buildOwn}
              all={{
                count: combined.portfolios.length,
                total: combined.total,
                showing: showingAll,
                onShow: () => { setView('all'); setSearchOpen(false); setEditingPrice(null); },
              }}
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

        {showingAll ? (
          <CombinedView combined={combined} colorOf={colorOf} onOpen={id => { openPortfolio(id); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }} />
        ) : (
          <>
            <Trades
              plan={plan}
              funds={funds}
              verb={effectiveVerb}
              colorOf={colorOf}
              asOf={asOf}
              pricesLoading={pricesLoading}
              onRefresh={priceData.refresh}
              copied={copied}
              onCopy={copyTrades}
              onCsv={downloadCsv}
              onPickMix={applyMix}
              onBuildOwn={buildOwn}
              wholeShares={wholeShares}
              onWholeShares={actions.setWholeShares}
              manualPrices={manualInUse}
              onAddPrice={symbol => setEditingPrice(symbol)}
              textFallback={textFallback}
              onCloseText={() => setTextFallback(null)}
            />

            {(funds.length > 0 || searchOpen) && (
              <MixCard
                funds={funds}
                holdings={holdings}
                tracksHoldings={tracksHoldings}
                prices={prices}
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
                onImport={() => fileInput.current?.click()}
                onImportFile={file => { void readImportFile(file); }}
                manualPrices={manualInUse}
                editingPrice={editingPrice}
                onEditPrice={setEditingPrice}
                onSetPrice={priceActions.setManualPrice}
              />
            )}
          </>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,.tsv,text/csv"
          hidden
          data-testid="import-file"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void readImportFile(file);
          }}
        />

        <p className={styles.footnote}>A calculator, not financial advice.</p>
      </main>

      {importing && (
        <ImportDialog
          portfolio={portfolio}
          fileName={importing.fileName}
          result={importing.result}
          prices={prices}
          onApply={applyImport}
          onChooseAnother={() => { setImporting(null); fileInput.current?.click(); }}
          onClose={closeImport}
        />
      )}

      {notice && (
        <div className={`${styles.toast} ${showingAll || plan.status === 'needs-mix' ? styles.toastLow : ''}`} role="status">
          <span className={styles.toastText}>{notice.text}</span>
          {notice.action && (
            <button
              type="button"
              className={styles.toastUndo}
              onClick={() => { notice.action!.run(); if (notice === flash) showFlash(null); }}
            >
              {notice.action.label}
            </button>
          )}
          {!notice.timeout && (
            <button type="button" className={styles.toastClose} onClick={() => dismiss(notice)} aria-label="Dismiss">
              <CloseIcon />
            </button>
          )}
        </div>
      )}

      {!showingAll && plan.status !== 'needs-mix' && (
        <div className={styles.copyBar}>
          <button type="button" className={styles.primary} onClick={copyTrades} disabled={!ok}>
            <CopyIcon />
            <span className={styles.copyBarText}>
              {copyBarLabel}
              {ok && plan.leftover > 0 && !copied && <span className={styles.copyBarSub}>{money(plan.leftover)} left over</span>}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
