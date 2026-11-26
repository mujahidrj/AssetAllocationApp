import { useEffect, useRef, useState } from 'react';
import styles from './Calculator.module.css';
import { SearchIcon } from './icons';
import { looksLikeTicker, ownFundSymbol, rankResults, type SearchResult as Result } from './searchUtils';


const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;
const TICKER = /^[A-Z0-9.-]{1,12}$/;
/** On touch screens the search moves up the screen so its results sit above the keyboard. */
const TOUCH = '(pointer: coarse)';


const apiBase = () => (import.meta.env.DEV ? (import.meta.env.VITE_API_URL ?? '') : '');


interface FundSearchProps {
  /** `own`: not found by search, added as the person typed it. */
  onAdd: (symbol: string, name?: string, own?: boolean) => void;
  existing: string[];
  autoFocus?: boolean;
  /** The search has the cursor (the phone's copy bar steps aside meanwhile). */
  onFocusChange?: (focused: boolean) => void;
}

export function FundSearch({ onAdd, existing, autoFocus, onFocusChange }: FundSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }
    // The last results stay up until the new ones arrive
    const controller = new AbortController();
    setSearching(true);
    const debounce = setTimeout(() => {
      fetch(`${apiBase()}/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then(r => {
          if (!r.ok) throw new Error(`Search failed: ${r.status}`);
          return r.json();
        })
        .then((data: { result?: Array<{ symbol?: string; description?: string }> }) => {
          setResults(rankResults(q, data.result ?? []));
          setFailed(false);
          setActive(-1);
          setOpen(true);
          // With a mouse, a list that opens below the window's edge is brought into view
          if (!window.matchMedia?.(TOUCH).matches) {
            requestAnimationFrame(() => listRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
          }
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // The common funds can still answer ("bond" still means BND, AGG…)
          setResults(rankResults(q, []));
          setFailed(true);
          setActive(-1);
          setOpen(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  const add = (symbol: string, name?: string, own = false) => {
    const s = own ? ownFundSymbol(symbol) : symbol.trim().toUpperCase();
    if (!s) return;
    if (existing.includes(s)) {
      // Said under the field, so the list makes way for it
      setNote(`${s} is already in this portfolio.`);
      setOpen(false);
      return;
    }
    // The search stays open for the next fund; the cursor goes to this one's target
    setQuery('');
    setResults([]);
    setOpen(false);
    setNote(null);
    onAdd(s, name, own);
  };

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focusChange = useRef(onFocusChange);
  useEffect(() => { focusChange.current = onFocusChange; });
  // A result tapped is gone as soon as its fund is added, and a focused element that goes
  // away says nothing (no blur). So also watch where the cursor goes next.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const inside = !!boxRef.current?.contains(e.target as Node);
      if (!inside) clearTimeout(timer.current); // Left before the search moved up: leave the page be
      focusChange.current?.(inside);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  // Closed while it had the cursor: no blur comes, so say so here. (Still in the page
  // with the cursor means React is only trying the effect twice, in development.)
  useEffect(() => {
    const box = boxRef.current;
    // Opened with the cursor already in it (autoFocus)
    if (box?.contains(document.activeElement)) focusChange.current?.(true);
    return () => {
      if (box?.isConnected && box.contains(document.activeElement)) return;
      clearTimeout(timer.current);
      focusChange.current?.(false);
    };
  }, []);
  const onInputFocus = () => {
    setOpen(true);
    // After the keyboard has opened, bring the field near the top so the results fit above it
    if (!window.matchMedia?.(TOUCH).matches) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => boxRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 250);
  };

  // What search didn't find can still be added: a ticker it can't check right now (or doesn't
  // know), or a fund with no ticker at all, by name (many 401(k) funds). Offered after the
  // results too when a name was typed, since loosely matching results are usual for names.
  const typed = query.trim();
  const tickerLike = looksLikeTicker(typed);
  const offerOwn = typed.length >= MIN_LENGTH &&
    (results.length === 0 || (!tickerLike && !results.some(r => r.symbol.toUpperCase() === typed.toUpperCase())));
  const addOwn = () => (tickerLike ? add(typed) : add(typed, undefined, true));
  const options = results.length + (offerOwn ? 1 : 0);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(i => Math.min(i + 1, options - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : results.find(r => r.symbol.toUpperCase() === typed.toUpperCase());
      if (pick) add(pick.symbol, pick.description);
      // Not before search has answered: it may well know the fund
      else if (offerOwn && !searching && (active === results.length || results.length === 0)) addOwn();
      else if (TICKER.test(typed.toUpperCase())) add(typed);
    }
  };

  const showList = open && query.trim().length >= MIN_LENGTH && (results.length > 0 || !searching);

  // On touch screens the keyboard covers the bottom of the screen, and the page doesn't
  // shrink for it: fit the list to the part still showing, where the browser says.
  const [listMax, setListMax] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!showList || !vv || !window.matchMedia?.(TOUCH).matches) { setListMax(null); return; }
    const fit = () => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      // The list starts 56px below the top of the search (.results)
      const room = vv.offsetTop + vv.height - (box.top + 56) - 12;
      setListMax(Math.max(120, Math.min(320, Math.round(room))));
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    window.addEventListener('scroll', fit, { passive: true });
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      window.removeEventListener('scroll', fit);
    };
  }, [showList]);

  return (
    <div
      className={styles.search}
      ref={boxRef}
      onFocus={() => onFocusChange?.(true)}
      onBlur={e => {
        if (boxRef.current?.contains(e.relatedTarget as Node | null)) return;
        clearTimeout(timer.current);
        onFocusChange?.(false);
      }}
    >
      <label className={`${styles.field} ${styles.searchField}`}>
        <SearchIcon />
        <input
          aria-label="Add a fund by ticker or name"
          placeholder="Add a fund: ticker or name"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          // A row highlighted in the last results isn't what Enter should add for new words
          onChange={e => { setQuery(e.target.value); setNote(null); setActive(-1); }}
          onFocus={onInputFocus}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="fund-results"
        />
        {searching && <span>…</span>}
      </label>
      <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => add('CASH', 'Cash')}>+ Cash</button>
      {showList && (
        <ul className={styles.results} id="fund-results" role="listbox" ref={listRef} style={listMax ? { maxHeight: listMax } : undefined}>
          {results.length === 0 && (
            <li className={styles.searchNote}>{failed ? 'Fund search isn’t working right now.' : 'No funds match.'}</li>
          )}
          {results.map((r, i) => {
            const have = existing.includes(r.symbol);
            return (
              <li key={r.symbol} role="option" aria-selected={i === active} aria-disabled={have || undefined}>
                <button
                  type="button"
                  className={`${styles.result} ${i === active ? styles.resultOn : ''} ${have ? styles.resultHave : ''}`}
                  disabled={have}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(r.symbol, r.description)}
                >
                  <span className={styles.resultSymbol}>{r.symbol}</span>
                  <span className={styles.resultName}>{have ? 'Already in this portfolio' : r.description}</span>
                </button>
              </li>
            );
          })}
          {failed && results.length > 0 && (
            <li className={styles.searchNote}>Search isn’t working right now. These are common funds.</li>
          )}
          {offerOwn && (
            <li role="option" aria-selected={active === results.length}>
              <button
                type="button"
                className={`${styles.result} ${styles.resultOwn} ${active === results.length ? styles.resultOn : ''}`}
                onMouseEnter={() => setActive(results.length)}
                onClick={addOwn}
              >
                <span className={styles.resultOwnAdd}>+ Add {tickerLike ? typed.toUpperCase() : `“${ownFundSymbol(typed)}”`}</span>
                <span className={styles.resultOwnNote}>{tickerLike ? 'Looks up its price' : 'As your own fund. You’ll type its price.'}</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {note && <div className={styles.searchNote} role="status" style={{ position: 'absolute', top: 52, left: 0 }}>{note}</div>}
    </div>
  );
}
