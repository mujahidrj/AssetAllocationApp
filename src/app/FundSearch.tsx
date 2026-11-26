import { useEffect, useRef, useState } from 'react';
import styles from './Calculator.module.css';
import { SearchIcon } from './icons';
import { cleanResults, looksLikeTicker, ownFundSymbol, type SearchResult as Result } from './searchUtils';


const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;
const TICKER = /^[A-Z0-9.^-]{1,12}$/;


const apiBase = () => (import.meta.env.DEV ? (import.meta.env.VITE_API_URL ?? '') : '');


interface FundSearchProps {
  /** `own`: not found by search, added as the person typed it. */
  onAdd: (symbol: string, name?: string, own?: boolean) => void;
  existing: string[];
  autoFocus?: boolean;
}

export function FundSearch({ onAdd, existing, autoFocus }: FundSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`${apiBase()}/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then(r => {
          if (!r.ok) throw new Error(`Search failed: ${r.status}`);
          return r.json();
        })
        .then((data: { result?: Array<{ symbol?: string; description?: string }> }) => {
          setResults(cleanResults(data.result ?? []));
          setFailed(false);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setFailed(true);
          setOpen(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
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
      setNote(`${s} is already in this portfolio.`);
      return;
    }
    onAdd(s, name, own);
    setQuery('');
    setResults([]);
    setOpen(false);
    setNote(null);
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

  const showList = open && query.trim().length >= MIN_LENGTH && !searching;

  return (
    <div className={styles.search} ref={boxRef}>
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
          onChange={e => { setQuery(e.target.value); setNote(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="fund-results"
        />
        {searching && <span>…</span>}
      </label>
      <button type="button" className={styles.ghost} style={{ height: 40 }} onClick={() => add('CASH', 'Cash')}>+ Cash</button>
      {showList && (
        <ul className={styles.results} id="fund-results" role="listbox">
          {results.length === 0 && (
            <li className={styles.searchNote}>{failed ? 'Fund search isn’t working right now.' : 'No funds match.'}</li>
          )}
          {results.map((r, i) => (
            <li key={r.symbol} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`${styles.result} ${i === active ? styles.resultOn : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(r.symbol, r.description)}
              >
                <span className={styles.resultSymbol}>{r.symbol}</span>
                <span className={styles.resultName}>{r.description}</span>
              </button>
            </li>
          ))}
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
