import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faSearch } from '@fortawesome/free-solid-svg-icons';
import { isUSTicker, isPrimaryTicker, getBaseTicker } from './stockSearchUtils';
import styles from './StockSearch.module.css';

interface StockSearchResult {
  symbol: string;
  description: string;
}

interface StockSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string, description: string) => void;
  error?: string;
  loading?: boolean;
  disabled?: boolean;
}

const DEBOUNCE_DELAY = 300; // ms
const MIN_SEARCH_LENGTH = 2;

export function StockSearch({
  value,
  onChange,
  onSelect,
  error,
  loading = false,
  disabled = false,
}: StockSearchProps) {
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate dropdown position - always below the input
  const calculateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;

    const inputRect = inputRef.current.getBoundingClientRect();

    // Calculate fixed positioning to escape scrollable containers
    const style: React.CSSProperties = {
      position: 'fixed',
      left: `${inputRect.left}px`,
      width: `${inputRect.width}px`,
      top: `${inputRect.bottom + 4}px`,
      zIndex: 99999,
    };

    setDropdownStyle(style);
  }, []);


  // Helper function to check if a string looks like a valid ticker symbol
  const isValidTickerFormat = useCallback((str: string): boolean => {
    const trimmed = str.trim().toUpperCase();
    // Valid ticker: 1-5 letters/numbers, optionally followed by .A, .B, etc. (US share class)
    return /^[A-Z0-9]{1,5}(\.[A-Z])?$/.test(trimmed);
  }, []);

  // Fetch search results from Yahoo Finance API
  const searchStocks = useCallback(async (query: string) => {
    if (query.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsSearching(true);

    try {
      // Use Yahoo Finance search API via our proxy
      const isDevelopment = import.meta.env.DEV;
      const apiUrl = isDevelopment ? import.meta.env.VITE_API_URL : window.location.origin;

      const response = await fetch(
        `${apiUrl}/api/search?q=${encodeURIComponent(query)}`,
        {
          signal: abortControllerRef.current.signal,
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }

      const data = await response.json();

      if (data.result && Array.isArray(data.result)) {
        // Filter to only US stocks first
        const usResults = data.result.filter((item: { symbol?: string; description?: string }) => {
          const symbol = item.symbol || '';
          return symbol && isUSTicker(symbol);
        });

        // Group results by base ticker
        const tickerMap = new Map<string, StockSearchResult>();

        usResults.forEach((item: { symbol?: string; description?: string }) => {
          const symbol = item.symbol || '';
          const description = item.description || '';

          if (!symbol || !description) return;

          const baseTicker = getBaseTicker(symbol);

          // Store the primary ticker for each base ticker
          if (!tickerMap.has(baseTicker) || isPrimaryTicker(symbol)) {
            tickerMap.set(baseTicker, { symbol, description });
          }
        });

        // Prioritize primary tickers and filter out duplicates
        const seenBaseTickers = new Set<string>();
        const results: StockSearchResult[] = [];

        // First pass: add primary tickers
        usResults.forEach((item: { symbol?: string; description?: string }) => {
          const symbol = item.symbol || '';
          const description = item.description || '';

          if (!symbol || !description) return;

          const baseTicker = getBaseTicker(symbol);

          if (isPrimaryTicker(symbol) && !seenBaseTickers.has(baseTicker)) {
            seenBaseTickers.add(baseTicker);
            results.push({ symbol, description });
          }
        });

        // Second pass: if we don't have enough results, add non-primary but unique base tickers
        if (results.length < 10) {
          usResults.forEach((item: { symbol?: string; description?: string }) => {
            const symbol = item.symbol || '';
            const description = item.description || '';

            if (!symbol || !description || results.length >= 10) return;

            const baseTicker = getBaseTicker(symbol);

            if (!seenBaseTickers.has(baseTicker)) {
              seenBaseTickers.add(baseTicker);
              // Use the primary ticker from our map if available, otherwise use this one
              const primary = tickerMap.get(baseTicker);
              results.push(primary || { symbol, description });
            }
          });
        }

        // Limit to 10 results
        const finalResults = results.slice(0, 10);

        setSearchResults(finalResults);
        // Show results dropdown if we have results OR if query is long enough but no results (to show "no results" message)
        setShowResults(finalResults.length > 0 || query.length >= MIN_SEARCH_LENGTH);

        // Calculate dropdown position after results are set
        setTimeout(() => {
          calculateDropdownPosition();
        }, 0);
      } else {
        // API returned no data - show "no results" if query is long enough
        setSearchResults([]);
        setShowResults(query.length >= MIN_SEARCH_LENGTH);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Ignore abort errors
        return;
      }
      console.error('Error searching stocks:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  }, [calculateDropdownPosition]);

  // Debounced search handler
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (value.trim().length >= MIN_SEARCH_LENGTH) {
      debounceTimerRef.current = setTimeout(() => {
        searchStocks(value.trim());
      }, DEBOUNCE_DELAY);
    } else {
      setSearchResults([]);
      setShowResults(false);
      setIsSearching(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value, searchStocks]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
  };

  // Handle result selection
  const handleSelect = (result: StockSearchResult) => {
    onSelect(result.symbol, result.description);
    setShowResults(false);
    setSearchResults([]);
    setSelectedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showResults && searchResults.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
            handleSelect(searchResults[selectedIndex]);
          } else if (searchResults.length > 0) {
            // Select first result if none selected
            handleSelect(searchResults[0]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowResults(false);
          setSelectedIndex(-1);
          break;
        default:
          // Allow other keys (including Enter when no dropdown) to bubble up
          break;
      }
    }
    // If no dropdown is open, Enter key will bubble up to parent form handlers
  };

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Recalculate position when window resizes, scrolls, or results change
  useEffect(() => {
    if (showResults && searchResults.length > 0) {
      calculateDropdownPosition();
      const handleResize = () => calculateDropdownPosition();
      const handleScroll = () => calculateDropdownPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true); // Capture scroll events from all elements
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [showResults, searchResults.length, calculateDropdownPosition]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className={styles.searchContainer}>
      <div className={styles.inputWrapper}>
        <div className={styles.inputContainer}>
          <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowResults(true);
              }
            }}
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder="Search stock symbol or company..."
            disabled={disabled || loading}
            autoComplete="off"
          />
          {isSearching && (
            <FontAwesomeIcon icon={faSpinner} spin className={styles.spinnerIcon} />
          )}
        </div>
        {showResults && searchResults.length > 0 && (
          <div
            ref={resultsRef}
            className={styles.resultsDropdown}
            style={dropdownStyle}
          >
            {searchResults.map((result, index) => (
              <button
                key={`${result.symbol}-${index}`}
                type="button"
                className={`${styles.resultItem} ${index === selectedIndex ? styles.resultItemSelected : ''
                  }`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={styles.resultSymbol}>{result.symbol}</div>
                <div className={styles.resultDescription}>{result.description}</div>
              </button>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && value.length >= MIN_SEARCH_LENGTH && !isSearching && (
          <div
            className={styles.noResults}
            style={dropdownStyle}
          >
            No results found for "{value}"
          </div>
        )}
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {value.length > 0 && value.length < MIN_SEARCH_LENGTH && (
        <div className={styles.hint}>
          Type at least {MIN_SEARCH_LENGTH} characters to search
        </div>
      )}
    </div>
  );
}
