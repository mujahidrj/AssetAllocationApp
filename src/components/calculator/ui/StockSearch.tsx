import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faSearch } from '@fortawesome/free-solid-svg-icons';
import { isUSTicker, isPrimaryTicker, getBaseTicker, isOption, isFutures } from './stockSearchUtils';
import styles from './StockSearch.module.css';

interface StockSearchResult {
  symbol: string;
  description: string;
  price?: number | null;
}

interface StockSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string, description: string) => void;
  error?: string;
  loading?: boolean;
  disabled?: boolean;
  onEnterPress?: () => void; // Called when Enter is pressed but no results are available
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
  onEnterPress,
}: StockSearchProps) {
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const priceAbortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate dropdown position - always above the input, cascading upward
  const calculateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;

    const inputRect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    // Calculate fixed positioning to escape scrollable containers
    // Fixed positioning is relative to viewport, not document
    // Always position above the input, cascading upward (especially important on mobile)
    const resultCount = searchResults.length;
    const itemHeight = 60; // Approximate height per result item
    const estimatedDropdownHeight = Math.min(250, resultCount * itemHeight + 20); // Dynamic height based on results
    const spaceAbove = inputRect.top;
    const spaceBelow = viewportHeight - inputRect.bottom;

    // Always try to position above first (cascading upward from search box)
    // Only use available space above, don't go off-screen
    const maxAvailableHeight = Math.min(estimatedDropdownHeight, spaceAbove - 16);
    const topPosition = inputRect.top - maxAvailableHeight - 4;

    const style: React.CSSProperties = {
      position: 'fixed',
      left: `${Math.max(8, inputRect.left)}px`, // Keep within viewport with margins
      width: `${Math.min(inputRect.width, viewportWidth - inputRect.left - 8)}px`, // Ensure it fits on screen
      top: `${Math.max(8, topPosition)}px`, // Position above input, but don't go above viewport
      maxHeight: `${Math.max(100, maxAvailableHeight)}px`, // Use available space above
      zIndex: 99999,
      // Ensure dropdown doesn't go off-screen on mobile
      maxWidth: 'calc(100vw - 16px)',
    };

    setDropdownStyle(style);
  }, [searchResults.length]);


  // Fetch stock price for a single symbol
  const fetchStockPrice = useCallback(async (symbol: string, signal: AbortSignal): Promise<number | null> => {
    try {
      const isDevelopment = import.meta.env.DEV;
      const apiUrl = isDevelopment ? import.meta.env.VITE_API_URL : window.location.origin;

      const response = await fetch(
        `${apiUrl}/api/stock/${encodeURIComponent(symbol)}`,
        {
          signal,
          credentials: 'same-origin',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // Handle both formats: direct { price: ... } and Yahoo Finance nested format
      if (data?.price) {
        return data.price;
      }

      // Fallback: try to extract from Yahoo Finance API response structure
      if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return data.chart.result[0].meta.regularMarketPrice;
      }

      return null;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Abort errors are expected when requests are cancelled - silently ignore
        return null;
      }
      // Suppress DOMException and InterceptorError (often from aborted requests handled by MSW)
      if (error instanceof DOMException) {
        return null;
      }
      // Check for InterceptorError (MSW error when aborting already-handled requests)
      if (error instanceof Error && error.message?.includes('already been handled')) {
        return null;
      }
      // Silently ignore expected errors - only log truly unexpected ones if needed
      return null;
    }
  }, []);

  // Fetch prices for all search results and filter out those without prices
  const fetchPricesForResults = useCallback(async (results: StockSearchResult[], signal: AbortSignal): Promise<StockSearchResult[]> => {
    setIsFetchingPrices(true);

    try {
      // Fetch prices for all symbols in parallel
      const pricePromises = results.map(result =>
        fetchStockPrice(result.symbol, signal).then(price => ({
          ...result,
          price
        }))
      );

      const resultsWithPrices = await Promise.all(pricePromises);

      // Return all results, even if price couldn't be fetched
      // This allows users to add stocks even if price fetch temporarily fails
      return resultsWithPrices;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return [];
      }
      return [];
    } finally {
      setIsFetchingPrices(false);
    }
  }, [fetchStockPrice]);

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
        // Filter to only US stocks, excluding options and futures
        const usResults = data.result.filter((item: { symbol?: string; description?: string }) => {
          const symbol = item.symbol || '';
          const description = item.description || '';

          // Must be a valid symbol
          if (!symbol) return false;

          // Exclude options (calls and puts)
          if (isOption(symbol, description)) return false;

          // Exclude futures contracts
          if (isFutures(symbol, description)) return false;

          // Must be US-based
          return isUSTicker(symbol);
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

        // Abort any ongoing price fetch
        if (priceAbortControllerRef.current) {
          priceAbortControllerRef.current.abort();
        }

        priceAbortControllerRef.current = new AbortController();

        // Fetch prices for all results (results without prices will still be shown)
        const resultsWithPrices = await fetchPricesForResults(finalResults, priceAbortControllerRef.current.signal);

        // Only update if not aborted
        if (!priceAbortControllerRef.current.signal.aborted) {
          setSearchResults(resultsWithPrices);
          // Show results dropdown if we have results OR if query is long enough but no results (to show "no results" message)
          setShowResults(resultsWithPrices.length > 0 || query.length >= MIN_SEARCH_LENGTH);

          // Calculate dropdown position after results are set and DOM updated
          // Use requestAnimationFrame to ensure DOM has updated with new results
          requestAnimationFrame(() => {
            setTimeout(() => {
              calculateDropdownPosition();
            }, 0);
          });
        }
      } else {
        // API returned no data - show "no results" if query is long enough
        setSearchResults([]);
        setShowResults(query.length >= MIN_SEARCH_LENGTH);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Abort errors are expected when requests are cancelled - silently ignore
        return;
      }
      // Suppress DOMException and InterceptorError (often from aborted requests handled by MSW)
      if (error instanceof DOMException) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      // Check for InterceptorError (MSW error when aborting already-handled requests)
      if (error instanceof Error && error.message?.includes('already been handled')) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }
      // Only log unexpected errors
      console.error('Error searching stocks:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  }, [calculateDropdownPosition, fetchPricesForResults]);

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
  const handleSelect = useCallback((result: StockSearchResult) => {
    // Close dropdown immediately before calling onSelect to prevent UI glitches
    setShowResults(false);
    setSearchResults([]);
    setSelectedIndex(-1);
    // Use setTimeout to ensure state updates complete before calling onSelect
    // This prevents the dropdown from briefly reappearing
    setTimeout(() => {
      onSelect(result.symbol, result.description);
    }, 0);
  }, [onSelect]);

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
          e.stopPropagation(); // Prevent parent handlers from firing
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
          // Allow other keys to bubble up
          break;
      }
    } else if (e.key === 'Enter' && !showResults && onEnterPress) {
      // Only call onEnterPress if there are no results and callback is provided
      e.preventDefault();
      e.stopPropagation();
      onEnterPress();
    }
    // If no dropdown is open and no onEnterPress callback, Enter key will bubble up to parent form handlers
  };

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (priceAbortControllerRef.current) {
        priceAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Close results when clicking outside (handles both mouse and touch events)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        resultsRef.current &&
        !resultsRef.current.contains(target)
      ) {
        setShowResults(false);
        setSearchResults([]);
      }
    };

    // Use both mousedown and touchstart for better mobile support
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Recalculate position when window resizes, scrolls, or results change
  // Also recalculate on mobile when virtual keyboard appears/disappears
  useEffect(() => {
    if (showResults && searchResults.length > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        calculateDropdownPosition();
      });

      const handleResize = () => {
        requestAnimationFrame(() => {
          calculateDropdownPosition();
        });
      };

      const handleScroll = () => {
        requestAnimationFrame(() => {
          calculateDropdownPosition();
        });
      };

      // Handle mobile virtual keyboard
      const handleOrientationChange = () => {
        // Small delay to allow viewport to adjust
        setTimeout(() => {
          requestAnimationFrame(() => {
            calculateDropdownPosition();
          });
        }, 100);
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true); // Capture scroll events from all elements
      window.addEventListener('orientationchange', handleOrientationChange);
      // Visual viewport API for better mobile keyboard handling
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleResize);
        window.visualViewport.addEventListener('scroll', handleScroll);
      }

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('orientationchange', handleOrientationChange);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleResize);
          window.visualViewport.removeEventListener('scroll', handleScroll);
        }
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
                // Recalculate position when input gains focus (important for mobile)
                requestAnimationFrame(() => {
                  calculateDropdownPosition();
                });
              }
            }}
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder="Search stock symbol or company..."
            disabled={disabled || loading}
            autoComplete="off"
          />
          {(isSearching || isFetchingPrices) && (
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
                <div className={styles.resultHeader}>
                  <div className={styles.resultSymbol}>{result.symbol}</div>
                  {result.price !== null && result.price !== undefined && (
                    <div className={styles.resultPrice}>
                      ${result.price.toFixed(2)}
                    </div>
                  )}
                </div>
                <div className={styles.resultDescription}>{result.description}</div>
              </button>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && value.length >= MIN_SEARCH_LENGTH && !isSearching && !isFetchingPrices && (
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
