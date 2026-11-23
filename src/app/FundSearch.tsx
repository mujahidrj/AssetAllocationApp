import { useEffect, useRef, useState } from 'react';
import styles from './Calculator.module.css';
import { SearchIcon } from './icons';
import { getBaseTicker, isFutures, isOption, isPrimaryTicker, isUSTicker } from './searchUtils';

interface Result {
  symbol: string;
  description: string;
}

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;
const TICKER = /^[A-Z0-9.^-]{1,12}$/;

const apiBase = () => (import.meta.env.DEV ? (import.meta.env.VITE_API_URL ?? '') : '');

/** US listings only, no options or futures, one entry per company (primary ticker first). */
export function cleanResults(raw: Array<{ symbol?: string; description?: string }>): Result[] {
  const seen = new Set<string>();
  const usable = raw
    .filter((r): r is Result => !!r.symbol && !!r.description)
    .filter(r => !isOption(r.symbol, r.description) && !isFutures(r.symbol, r.description) && isUSTicker(r.symbol));
  const ordered = [...usable.filter(r => isPrimaryTicker(r.symbol)), ...usable.filter(r => !isPrimaryTicker(r.symbol))];
  const out: Result[] = [];
  ordered.forEach(r => {
    const base = getBaseTicker(r.symbol);
    if (!seen.has(base)) {
      seen.add(base);
      out.push(r);
    }
  });
  return out.slice(0, 8);
}

interface FundSearchProps {
  onAdd: (symbol: string, name?: string) => void;
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
        .then(r => (r.ok ? r.json() : { result: [] }))
        .then((data: { result?: Array<{ symbol?: string; description?: string }> }) => {
          setResults(cleanResults(data.result ?? []));
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
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

  const add = (symbol: string, name?: string) => {
    const s = symbol.trim().toUpperCase();
    if (existing.includes(s)) {
      setNote(`${s} is already in this portfolio.`);
      return;
    }
    onAdd(s, name);
    setQuery('');
    setResults([]);
    setOpen(false);
    setNote(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : results.find(r => r.symbol.toUpperCase() === query.trim().toUpperCase());
      if (pick) add(pick.symbol, pick.description);
      else if (TICKER.test(query.trim().toUpperCase())) add(query);
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
          {results.length === 0 && <li className={styles.searchNote}>No US funds or stocks match “{query.trim()}”.</li>}
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
        </ul>
      )}
      {note && <div className={styles.searchNote} role="status" style={{ position: 'absolute', top: 52, left: 0 }}>{note}</div>}
    </div>
  );
}
