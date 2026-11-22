import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Stock, ValidationErrors, CalculatorState, CalculatorActions, AllocationResult, CurrentPosition, RebalanceResult, CalculatorMode } from '../types';
import { samplePortfolios } from '../data/samplePortfolios';
import { db } from '../../../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { parseAmount } from '../../../lib/parseAmount';
import { isCash, rebalance, splitByTarget, portfolioValue, targetTotal, targetsAddUp } from '../../../lib/portfolioMath';
import { loadGuestData, saveGuestData } from '../../../lib/deviceStorage';


interface UseCalculatorProps {
  user: User | null;
  stocks: Stock[];
  setStocks?: (stocks: Stock[]) => void;
}

// Helper function to fetch stock info with abort controller
const fetchStockInfo = async (symbol: string, signal: AbortSignal) => {
  try {
    // Use Yahoo Finance search API via our proxy
    const isDevelopment = import.meta.env.DEV;
    const apiUrl = isDevelopment ? import.meta.env.VITE_API_URL : window.location.origin;

    const response = await fetch(
      `${apiUrl}/api/search?q=${encodeURIComponent(symbol)}`,
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
      throw new Error('Failed to fetch stock info');
    }
    const data = await response.json();
    if (data.result && data.result.length > 0) {
      return data.result[0].description;
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
    // Only log unexpected errors
    console.error('Error fetching stock info:', error);
    return null;
  }
};

// Helper function to fetch stock price with abort controller
const fetchStockPrice = async (symbol: string, signal: AbortSignal) => {
  try {
    // In production, use the deployed API URL, in development use the local server
    const isDevelopment = import.meta.env.DEV;
    const apiUrl = isDevelopment
      ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
      : window.location.origin;

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
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || `API error (${response.status})`;
      } catch {
        errorMessage = errorText || `API error (${response.status})`;
      }

      console.warn(`Error fetching stock ${symbol}:`, errorMessage);
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

    console.warn(`No price data available for ${symbol}`, data);
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
    if (error instanceof Error && (error.message?.includes('already been handled') || error.name === 'InterceptorError' || error.constructor?.name === 'InterceptorError')) {
      return null;
    }
    // Only log unexpected errors
    console.warn('Error fetching stock price:', error);
    return null;
  }
};

const DEFAULT_MIX: Stock[] = [
  { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
  { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" }
];

// Marks that a signed-out visitor's data has been read from this device
const DEVICE = '__device__';

export function useCalculator({ user, stocks, setStocks }: UseCalculatorProps) {
  const [amount, setAmount] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [newStockName, setNewStockName] = useState("");
  const [fetchingStock, setFetchingStock] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [localStocks, setLocalStocks] = useState<Stock[]>(() => loadGuestData().stocks ?? DEFAULT_MIX);
  const [allocations, setAllocations] = useState<AllocationResult[] | null>(null);
  const [stockPrices, setStockPrices] = useState<Record<string, number | null>>({});
  const [mode, setMode] = useState<CalculatorMode>('deposit');
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([]);
  const [rebalanceStocks, setRebalanceStocks] = useState<Stock[]>(DEFAULT_MIX);
  const [rebalanceResults, setRebalanceResults] = useState<RebalanceResult[] | null>(null);
  // uid whose saved holdings and targets have finished loading (DEVICE when signed out).
  // Saving waits for this, so starting values never overwrite saved data, and a
  // signed-in user's data is never written to the device after they sign out.
  const [rebalanceLoadedFor, setRebalanceLoadedFor] = useState<string | null>(null);

  // Load rebalance data from database
  const signedInUid = user?.uid ?? null;
  useEffect(() => {
    setRebalanceLoadedFor(null);
    if (!signedInUid) {
      const saved = loadGuestData();
      setCurrentPositions(saved.positions ?? []);
      setRebalanceStocks(saved.rebalanceStocks ?? DEFAULT_MIX);
      setRebalanceLoadedFor(DEVICE);
      return;
    }

    const userId = signedInUid;
    let mounted = true;

    async function loadRebalanceData() {
      try {
        const positionsRef = doc(db, 'userPositions', userId);
        const percentagesRef = doc(db, 'userRebalancePercentages', userId);

        const [positionsSnap, percentagesSnap] = await Promise.all([
          getDoc(positionsRef),
          getDoc(percentagesRef)
        ]);

        if (!mounted) return;

        if (positionsSnap.exists()) {
          setCurrentPositions(positionsSnap.data().positions || []);
        }

        if (percentagesSnap.exists()) {
          setRebalanceStocks(percentagesSnap.data().stocks || []);
        }

        setRebalanceLoadedFor(userId);
      } catch (error) {
        // Leave saving off: writing now could replace data we failed to read
        console.error('Error loading rebalance data:', error);
      }
    }

    void loadRebalanceData();

    return () => {
      mounted = false;
    };
  }, [signedInUid]);

  // Save the signed-out visitor's deposit mix on this device
  useEffect(() => {
    if (!user) saveGuestData({ stocks: localStocks });
  }, [user, localStocks]);

  // Save holdings and rebalance targets: on this device when signed out
  useEffect(() => {
    if (!user && rebalanceLoadedFor === DEVICE) {
      saveGuestData({ positions: currentPositions, rebalanceStocks });
    }
  }, [user, rebalanceLoadedFor, currentPositions, rebalanceStocks]);

  // Save current positions to database
  useEffect(() => {
    if (!user || rebalanceLoadedFor !== user.uid) return;

    // Clean positions to remove any undefined values before saving
    const cleanedPositions = currentPositions.map(pos => {
      const cleaned: CurrentPosition = { ...pos };
      if (pos.inputType === 'shares' && cleaned.value !== undefined) {
        delete cleaned.value;
      } else if (pos.inputType === 'value' && cleaned.shares !== undefined) {
        delete cleaned.shares;
      }
      // Remove any undefined values
      Object.keys(cleaned).forEach(key => {
        if (cleaned[key as keyof CurrentPosition] === undefined) {
          delete cleaned[key as keyof CurrentPosition];
        }
      });
      return cleaned;
    });

    // Save positions (including empty array) to persist deletions
    const positionsRef = doc(db, 'userPositions', user.uid);
    setDoc(positionsRef, { positions: cleanedPositions }).catch(error => {
      console.error('Error saving positions:', error);
    });
  }, [user, rebalanceLoadedFor, currentPositions]);

  // Save rebalance stocks to database
  useEffect(() => {
    if (!user || rebalanceLoadedFor !== user.uid) return;

    // Firestore rejects undefined - omit optional fields when they're undefined
    const cleanedStocks = rebalanceStocks.map(({ name, percentage, companyName }) => {
      const stock: Stock = { name, percentage };
      if (companyName != null) {
        stock.companyName = companyName;
      }
      return stock;
    });
    const percentagesRef = doc(db, 'userRebalancePercentages', user.uid);
    setDoc(percentagesRef, { stocks: cleanedStocks }).catch(error => {
      console.error('Error saving rebalance percentages:', error);
    });
  }, [user, rebalanceLoadedFor, rebalanceStocks]);

  // Cleanup function for ongoing fetches
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const currentStocks = useMemo(() => {
    return user ? stocks : localStocks;
  }, [user, stocks, localStocks]);

  // Function to fetch prices for new stocks
  const fetchMissingPrices = useCallback(async (stockSymbols: string[]) => {
    // Only fetch prices for symbols that haven't been fetched yet (undefined)
    // Don't refetch if price is null (fetch failed) or if price exists (already fetched)
    const missingSymbols = stockSymbols.filter(symbol => stockPrices[symbol] === undefined);
    if (missingSymbols.length === 0) return;

    // Separate cash from regular stocks
    const cashSymbols = missingSymbols.filter(symbol => isCash(symbol));
    const regularSymbols = missingSymbols.filter(symbol => !isCash(symbol));

    // Set cash prices to 1.00 immediately
    if (cashSymbols.length > 0) {
      setStockPrices(prev => {
        const newPrices = { ...prev };
        cashSymbols.forEach(symbol => {
          newPrices[symbol] = 1.00;
        });
        return newPrices;
      });
    }

    // If no regular symbols to fetch, return early
    if (regularSymbols.length === 0) return;

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const pricePromises = regularSymbols.map(symbol =>
        fetchStockPrice(symbol, abortControllerRef.current!.signal)
      );
      const prices = await Promise.all(pricePromises);

      setStockPrices(prev => {
        const newPrices = { ...prev };
        regularSymbols.forEach((symbol, index) => {
          // Store the price (could be a number or null if fetch failed)
          newPrices[symbol] = prices[index];
        });
        return newPrices;
      });
    } catch (error) {
      // Suppress expected errors (abort, DOMException, InterceptorError)
      if (!(error instanceof DOMException) &&
        !(error instanceof Error && (error.name === 'AbortError' || error.name === 'InterceptorError' || error.message?.includes('already been handled')))) {
        console.warn('Error fetching stock prices:', error);
      }
      // On error, mark symbols as null (fetch failed) so we don't retry indefinitely
      setStockPrices(prev => {
        const newPrices = { ...prev };
        regularSymbols.forEach(symbol => {
          if (newPrices[symbol] === undefined) {
            newPrices[symbol] = null;
          }
        });
        return newPrices;
      });
    }
  }, [stockPrices]);

  // Fetch prices for any new stocks
  useEffect(() => {
    const stockSymbols = currentStocks.map(stock => stock.name);
    // Use void to explicitly mark as fire-and-forget, but ensure errors are handled
    fetchMissingPrices(stockSymbols).catch(error => {
      console.warn('Error in fetchMissingPrices:', error);
    });
  }, [currentStocks, fetchMissingPrices]);

  // Fetch prices for rebalancing stocks and current positions
  useEffect(() => {
    if (mode === 'rebalance') {
      const rebalanceSymbols = [
        ...rebalanceStocks.map(stock => stock.name),
        ...currentPositions.map(pos => pos.symbol)
      ];
      // Use void to explicitly mark as fire-and-forget, but ensure errors are handled
      fetchMissingPrices(rebalanceSymbols).catch(error => {
        console.warn('Error in fetchMissingPrices:', error);
      });
    }
  }, [mode, rebalanceStocks, currentPositions, fetchMissingPrices]);

  // Clear validation errors when positions are updated (to clear stale "Couldn't find" errors)
  useEffect(() => {
    if (mode === 'rebalance' && currentPositions.length > 0) {
      // Clear newPosition error if all positions have valid symbols
      setValidationErrors(prev => {
        if (prev.newPosition && prev.newPosition.includes("Couldn't find")) {
          const newErrors = { ...prev };
          delete newErrors.newPosition;
          return newErrors;
        }
        return prev;
      });
    }
  }, [mode, currentPositions]);

  const validateAmount = useCallback((value: string) => {
    const num = parseAmount(value);
    if (!value.trim()) {
      return "Amount is required";
    }
    if (isNaN(num) || num <= 0) {
      return "Please enter a valid positive number";
    }
    return undefined;
  }, []);

  const validatePercentages = useCallback(() => {
    if (currentStocks.length === 0) return undefined;

    const total = currentStocks.reduce((sum, stock) => sum + stock.percentage, 0);
    if (Math.abs(total - 100) > 0.01) { // Allow for small floating point differences
      return `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
    }
    return undefined;
  }, [currentStocks]);

  const addStock = useCallback(async (symbol: string) => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      setValidationErrors(prev => ({ ...prev, newStock: "Please enter a stock symbol" }));
      return;
    }

    // Check if stock already exists
    if (currentStocks.some(stock => stock.name === trimmedSymbol)) {
      setValidationErrors(prev => ({ ...prev, newStock: "Stock already exists in your portfolio" }));
      return;
    }

    // Handle cash specially - skip price fetching
    if (isCash(trimmedSymbol)) {
      setStockPrices(prev => ({ ...prev, [trimmedSymbol]: 1.00 }));
      const newStock = {
        name: trimmedSymbol,
        percentage: 0,
        companyName: 'Cash USD'
      };

      if (user && setStocks) {
        await setStocks([...stocks, newStock]);
      } else {
        setLocalStocks(prev => [...prev, newStock]);
      }
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newStock;
        return newErrors;
      });
      return;
    }

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      // Fetch both stock info and price in parallel
      const [companyName, price] = await Promise.all([
        fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal),
        fetchStockPrice(trimmedSymbol, abortControllerRef.current.signal)
      ]);

      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newStock: `Couldn't find ${trimmedSymbol}` }));
        return;
      }

      // Validate that price can be fetched
      if (price === null) {
        setValidationErrors(prev => ({ ...prev, newStock: `Couldn't fetch price for ${trimmedSymbol}. Please check the symbol and try again.` }));
        return;
      }

      const newStock = {
        name: trimmedSymbol,
        percentage: 0,
        companyName: companyName || undefined
      };

      if (user && setStocks) {
        await setStocks([...stocks, newStock]);
      } else {
        setLocalStocks(prev => [...prev, newStock]);
      }
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newStock;
        return newErrors;
      });
    } catch {
      setValidationErrors(prev => ({
        ...prev,
        newStock: "Failed to add stock. Please try again."
      }));
    } finally {
      setFetchingStock(false);
      abortControllerRef.current = null;
    }
  }, [user, stocks, setStocks, currentStocks]);

  const addCash = useCallback(() => {
    const cashSymbol = 'CASH';

    // Check if cash already exists
    if (currentStocks.some(stock => stock.name === cashSymbol)) {
      setValidationErrors(prev => ({ ...prev, newStock: "Cash already exists in your portfolio" }));
      return;
    }

    const newStock: Stock = {
      name: cashSymbol,
      percentage: 0,
      companyName: 'Cash USD'
    };

    // Set cash price to 1.00 immediately
    setStockPrices(prev => ({ ...prev, [cashSymbol]: 1.00 }));

    if (user && setStocks) {
      void setStocks([...stocks, newStock]);
    } else {
      setLocalStocks(prev => [...prev, newStock]);
    }

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.newStock;
      return newErrors;
    });
  }, [user, stocks, setStocks, currentStocks]);

  const removeStock = useCallback((index: number) => {
    let updatedStocks: Stock[];
    if (user && setStocks) {
      updatedStocks = stocks.filter((_, i) => i !== index);
      void setStocks(updatedStocks);
    } else {
      updatedStocks = localStocks.filter((_, i) => i !== index);
      setLocalStocks(updatedStocks);
    }

    // Calculate total percentage after removal
    const total = updatedStocks.reduce((sum, stock) => sum + stock.percentage, 0);

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (Math.abs(total - 100) > 0.01) {
        newErrors.percentages = `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
      } else {
        delete newErrors.percentages;
      }
      return newErrors;
    });
  }, [user, stocks, setStocks, localStocks]);

  const updateStockPercentage = useCallback((index: number, newPercentage: string) => {
    const parsedValue = parseFloat(newPercentage) || 0;

    if (parsedValue < 0 || parsedValue > 100) {
      setValidationErrors(prev => ({
        ...prev,
        [`stock-${index}`]: "Percentage must be between 0 and 100"
      }));
      return;
    }

    const updateStockAtIndex = (stockList: Stock[]) => {
      const updated = [...stockList];
      if (index >= 0 && index < updated.length) {
        updated[index] = {
          ...updated[index],
          percentage: parsedValue,
        };
      }
      return updated;
    };

    let updatedStocks: Stock[];
    if (user && setStocks) {
      updatedStocks = updateStockAtIndex(stocks);
      void setStocks(updatedStocks);
    } else {
      updatedStocks = updateStockAtIndex(localStocks);
      setLocalStocks(updatedStocks);
    }

    // Calculate total percentage after update
    const total = updatedStocks.reduce((sum, stock) => sum + stock.percentage, 0);

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`stock-${index}`];

      if (Math.abs(total - 100) > 0.01) {
        newErrors.percentages = `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
      } else {
        delete newErrors.percentages;
      }

      return newErrors;
    });
  }, [user, stocks, setStocks, localStocks]);

  const addCurrentPosition = useCallback(async (symbol: string) => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      setValidationErrors(prev => ({ ...prev, newPosition: "Please enter a stock symbol" }));
      return;
    }

    // Check if position already exists - if so, don't add again
    if (currentPositions.some(pos => pos.symbol === trimmedSymbol)) {
      // Clear any "Couldn't find" errors for this symbol since position already exists
      // But set "Position already exists" for explicit duplicate adds
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        // Clear "Couldn't find" errors
        if (newErrors.newPosition && newErrors.newPosition.includes("Couldn't find")) {
          delete newErrors.newPosition;
        }
        // Set "Position already exists" error (for explicit duplicate adds via Add button)
        newErrors.newPosition = "Position already exists";
        return newErrors;
      });
      return;
    }

    // Handle cash specially - skip price fetching
    if (isCash(trimmedSymbol)) {
      setStockPrices(prev => ({ ...prev, [trimmedSymbol]: 1.00 }));
      const newPosition: CurrentPosition = {
        symbol: trimmedSymbol,
        inputType: 'value',
        value: 0,
        companyName: 'Cash USD'
      };
      setCurrentPositions(prev => [...prev, newPosition]);
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newPosition;
        return newErrors;
      });
      return;
    }

    // If stock is already in rebalanceStocks, we know it's valid - use its company name
    // This avoids unnecessary API calls and prevents "Couldn't find" errors for known stocks
    const existingStock = rebalanceStocks.find(stock => stock.name === trimmedSymbol);
    if (existingStock) {
      const newPosition: CurrentPosition = {
        symbol: trimmedSymbol,
        inputType: 'value',
        value: 0,
        companyName: existingStock.companyName
      };
      setCurrentPositions(prev => [...prev, newPosition]);
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newPosition;
        return newErrors;
      });
      // Still fetch price if not already fetched
      if (stockPrices[trimmedSymbol] === undefined) {
        fetchMissingPrices([trimmedSymbol]).catch(error => {
          console.warn('Error fetching price for existing stock:', error);
        });
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      // Fetch both stock info and price in parallel
      const [companyName, price] = await Promise.all([
        fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal),
        fetchStockPrice(trimmedSymbol, abortControllerRef.current.signal)
      ]);

      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newPosition: `Couldn't find ${trimmedSymbol}` }));
        return;
      }

      // Validate that price can be fetched
      if (price === null) {
        setValidationErrors(prev => ({ ...prev, newPosition: `Couldn't fetch price for ${trimmedSymbol}. Please check the symbol and try again.` }));
        return;
      }

      const newPosition: CurrentPosition = {
        symbol: trimmedSymbol,
        inputType: 'value',
        value: 0,
        companyName: companyName || undefined
      };
      setCurrentPositions(prev => [...prev, newPosition]);
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newPosition;
        return newErrors;
      });
    } catch {
      setValidationErrors(prev => ({
        ...prev,
        newPosition: "Failed to add position. Please try again."
      }));
    } finally {
      setFetchingStock(false);
      abortControllerRef.current = null;
    }
  }, [currentPositions, rebalanceStocks, stockPrices, fetchMissingPrices]);

  const removeCurrentPosition = useCallback((index: number) => {
    setCurrentPositions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateCurrentPosition = useCallback((index: number, updates: Partial<CurrentPosition>) => {
    setCurrentPositions(prev => {
      const updated = [...prev];
      if (index >= 0 && index < updated.length) {
        // Filter out undefined values to prevent Firestore errors
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        ) as Partial<CurrentPosition>;
        updated[index] = { ...updated[index], ...cleanUpdates };

        // If switching input types, explicitly remove the unused field
        if (cleanUpdates.inputType === 'shares' && updated[index].value !== undefined) {
          delete updated[index].value;
        } else if (cleanUpdates.inputType === 'value' && updated[index].shares !== undefined) {
          delete updated[index].shares;
        }

        // Clear any validation errors for this position when updating
        const symbol = updated[index].symbol;
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          if (newErrors.newPosition && newErrors.newPosition.includes(symbol)) {
            delete newErrors.newPosition;
          }
          return newErrors;
        });
      }
      return updated;
    });
  }, []);

  // Combined function to add asset to both positions and targets
  const addAssetToBoth = useCallback(async (symbol: string) => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      setValidationErrors(prev => ({
        ...prev,
        newPosition: "Please enter a stock symbol",
        newRebalanceStock: "Please enter a stock symbol"
      }));
      return;
    }

    // Handle cash specially - skip price fetching
    if (isCash(trimmedSymbol)) {
      const positionExists = currentPositions.some(pos => pos.symbol === trimmedSymbol);
      const targetExists = rebalanceStocks.some(stock => stock.name === trimmedSymbol);

      if (positionExists && targetExists) {
        setValidationErrors(prev => ({
          ...prev,
          newPosition: "Cash already exists",
          newRebalanceStock: "Cash already exists"
        }));
        return;
      }

      setStockPrices(prev => ({ ...prev, [trimmedSymbol]: 1.00 }));

      if (!positionExists) {
        const newPosition: CurrentPosition = {
          symbol: trimmedSymbol,
          inputType: 'value',
          value: 0,
          companyName: 'Cash USD'
        };
        setCurrentPositions(prev => [...prev, newPosition]);
      }

      if (!targetExists) {
        const newStock: Stock = {
          name: trimmedSymbol,
          percentage: 0,
          companyName: 'Cash USD'
        };
        setRebalanceStocks(prev => [...prev, newStock]);
      }

      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newPosition;
        delete newErrors.newRebalanceStock;
        return newErrors;
      });
      return;
    }

    // Check if already exists
    const positionExists = currentPositions.some(pos => pos.symbol === trimmedSymbol);
    const targetExists = rebalanceStocks.some(stock => stock.name === trimmedSymbol);

    if (positionExists && targetExists) {
      setValidationErrors(prev => ({
        ...prev,
        newPosition: "Asset already exists",
        newRebalanceStock: "Asset already exists"
      }));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      // Fetch both stock info and price in parallel
      const [companyName, price] = await Promise.all([
        fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal),
        fetchStockPrice(trimmedSymbol, abortControllerRef.current.signal)
      ]);

      if (companyName === null) {
        setValidationErrors(prev => ({
          ...prev,
          newPosition: `Couldn't find ${trimmedSymbol}`,
          newRebalanceStock: `Couldn't find ${trimmedSymbol}`
        }));
        return;
      }

      // Validate that price can be fetched
      if (price === null) {
        setValidationErrors(prev => ({
          ...prev,
          newPosition: `Couldn't fetch price for ${trimmedSymbol}. Please check the symbol and try again.`,
          newRebalanceStock: `Couldn't fetch price for ${trimmedSymbol}. Please check the symbol and try again.`
        }));
        return;
      }

      // Add to positions if not exists
      if (!positionExists) {
        const newPosition: CurrentPosition = {
          symbol: trimmedSymbol,
          inputType: 'shares',
          shares: 0,
          companyName: companyName || undefined
        };
        setCurrentPositions(prev => [...prev, newPosition]);
      }

      // Add to targets if not exists
      if (!targetExists) {
        const newStock: Stock = {
          name: trimmedSymbol,
          percentage: 0,
          companyName: companyName || undefined
        };
        const updatedStocks = [...rebalanceStocks, newStock];
        setRebalanceStocks(updatedStocks);
      }

      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newPosition;
        delete newErrors.newRebalanceStock;
        return newErrors;
      });
    } catch {
      setValidationErrors(prev => ({
        ...prev,
        newPosition: "Failed to add asset. Please try again.",
        newRebalanceStock: "Failed to add asset. Please try again."
      }));
    } finally {
      setFetchingStock(false);
      abortControllerRef.current = null;
    }
  }, [currentPositions, rebalanceStocks]);

  const addCashToBoth = useCallback(() => {
    const cashSymbol = 'CASH';

    // Check if already exists
    const positionExists = currentPositions.some(pos => pos.symbol === cashSymbol);
    const targetExists = rebalanceStocks.some(stock => stock.name === cashSymbol);

    if (positionExists && targetExists) {
      setValidationErrors(prev => ({
        ...prev,
        newPosition: "Cash already exists",
        newRebalanceStock: "Cash already exists"
      }));
      return;
    }

    // Set cash price to 1.00 immediately
    setStockPrices(prev => ({ ...prev, [cashSymbol]: 1.00 }));

    // Add to positions if not exists
    if (!positionExists) {
      const newPosition: CurrentPosition = {
        symbol: cashSymbol,
        inputType: 'value',
        value: 0,
        companyName: 'Cash USD'
      };
      setCurrentPositions(prev => [...prev, newPosition]);
    }

    // Add to targets if not exists
    if (!targetExists) {
      const newStock: Stock = {
        name: cashSymbol,
        percentage: 0,
        companyName: 'Cash USD'
      };
      setRebalanceStocks(prev => [...prev, newStock]);
    }

    setNewStockName("");
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.newPosition;
      delete newErrors.newRebalanceStock;
      return newErrors;
    });
  }, [currentPositions, rebalanceStocks]);

  const addRebalanceStock = useCallback(async (symbol: string) => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      setValidationErrors(prev => ({ ...prev, newRebalanceStock: "Please enter a stock symbol" }));
      return;
    }

    if (rebalanceStocks.some(stock => stock.name === trimmedSymbol)) {
      setValidationErrors(prev => ({ ...prev, newRebalanceStock: "Stock already exists" }));
      return;
    }

    // Handle cash specially - skip price fetching
    if (isCash(trimmedSymbol)) {
      setStockPrices(prev => ({ ...prev, [trimmedSymbol]: 1.00 }));
      const newStock: Stock = {
        name: trimmedSymbol,
        percentage: 0,
        companyName: 'Cash USD'
      };
      setRebalanceStocks(prev => [...prev, newStock]);
      setNewStockName("");
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newRebalanceStock;
        return newErrors;
      });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      // Fetch both stock info and price in parallel
      const [companyName, price] = await Promise.all([
        fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal),
        fetchStockPrice(trimmedSymbol, abortControllerRef.current.signal)
      ]);

      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newRebalanceStock: `Couldn't find ${trimmedSymbol}` }));
        return;
      }

      // Validate that price can be fetched
      if (price === null) {
        setValidationErrors(prev => ({ ...prev, newRebalanceStock: `Couldn't fetch price for ${trimmedSymbol}. Please check the symbol and try again.` }));
        return;
      }

      const newStock: Stock = {
        name: trimmedSymbol,
        percentage: 0,
        companyName: companyName || undefined
      };
      const updatedStocks = [...rebalanceStocks, newStock];
      setRebalanceStocks(updatedStocks);
      setNewStockName("");

      // Validate percentages after adding
      const total = updatedStocks.reduce((sum, stock) => sum + stock.percentage, 0);
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newRebalanceStock;
        if (updatedStocks.length > 0 && Math.abs(total - 100) > 0.01) {
          newErrors.rebalancePercentages = `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
        } else if (Math.abs(total - 100) <= 0.01) {
          delete newErrors.rebalancePercentages;
        }
        return newErrors;
      });
    } catch {
      setValidationErrors(prev => ({
        ...prev,
        newRebalanceStock: "Failed to add stock. Please try again."
      }));
    } finally {
      setFetchingStock(false);
      abortControllerRef.current = null;
    }
  }, [rebalanceStocks]);

  const removeRebalanceStock = useCallback((index: number) => {
    const updatedStocks = rebalanceStocks.filter((_, i) => i !== index);
    setRebalanceStocks(updatedStocks);

    const total = updatedStocks.reduce((sum, stock) => sum + stock.percentage, 0);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (updatedStocks.length > 0 && Math.abs(total - 100) > 0.01) {
        newErrors.rebalancePercentages = `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
      } else {
        delete newErrors.rebalancePercentages;
      }
      return newErrors;
    });
  }, [rebalanceStocks]);

  const updateRebalancePercentage = useCallback((index: number, newPercentage: string) => {
    const parsedValue = parseFloat(newPercentage) || 0;

    if (parsedValue < 0 || parsedValue > 100) {
      setValidationErrors(prev => ({
        ...prev,
        [`rebalance-stock-${index}`]: "Percentage must be between 0 and 100"
      }));
      return;
    }

    const updatedStocks = [...rebalanceStocks];
    if (index >= 0 && index < updatedStocks.length) {
      updatedStocks[index] = {
        ...updatedStocks[index],
        percentage: parsedValue,
      };
    }
    setRebalanceStocks(updatedStocks);

    const total = updatedStocks.reduce((sum, stock) => sum + stock.percentage, 0);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`rebalance-stock-${index}`];

      if (Math.abs(total - 100) > 0.01) {
        newErrors.rebalancePercentages = `Total percentage is ${total.toFixed(1)}%. Please adjust to equal 100%`;
      } else {
        delete newErrors.rebalancePercentages;
      }

      return newErrors;
    });
  }, [rebalanceStocks]);

  const calculateRebalance = useCallback(() => {
    if (currentPositions.length === 0 || rebalanceStocks.length === 0) {
      return null;
    }

    // If no positions have values yet, don't calculate but also don't show error
    if (portfolioValue(currentPositions, stockPrices) <= 0) {
      return null;
    }

    if (!targetsAddUp(rebalanceStocks)) {
      setValidationErrors(prev => ({
        ...prev,
        rebalancePercentages: `Total percentage is ${targetTotal(rebalanceStocks).toFixed(1)}%. Please adjust to equal 100%`
      }));
      return null;
    }

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.rebalancePercentages;
      return newErrors;
    });

    return rebalance(currentPositions, rebalanceStocks, stockPrices);
  }, [currentPositions, rebalanceStocks, stockPrices]);

  // Update rebalance results when positions or stocks change
  useEffect(() => {
    if (mode === 'rebalance') {
      // Use a small timeout to batch multiple rapid updates
      const timeoutId = setTimeout(() => {
        const result = calculateRebalance();
        setRebalanceResults(result);
      }, 100);

      return () => clearTimeout(timeoutId);
    } else {
      setRebalanceResults(null);
    }
  }, [mode, calculateRebalance]);

  const calculateAllocations = useCallback(() => {
    if (!amount) return null;

    const amountError = validateAmount(amount);
    if (amountError) {
      setValidationErrors(prev => ({ ...prev, amount: amountError }));
      return null;
    }

    const percentageError = validatePercentages();
    if (percentageError) {
      setValidationErrors(prev => ({ ...prev, percentages: percentageError }));
      return null;
    }

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.amount;
      delete newErrors.percentages;
      return newErrors;
    });

    return splitByTarget(parseAmount(amount), currentStocks, stockPrices);
  }, [amount, currentStocks, validateAmount, validatePercentages, stockPrices]);

  // Update allocations whenever necessary values change
  useEffect(() => {
    const result = calculateAllocations();
    setAllocations(result);
  }, [calculateAllocations]);

  // Actions object for components
  const actions: CalculatorActions = {
    setAmount: (newAmount: string) => {
      setAmount(newAmount);
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.amount;
        return newErrors;
      });
    },
    addStock,
    addCash,
    removeStock,
    updateStockPercentage,
    applyMix: (mix: Stock[]) => {
      if (user) {
        void setStocks?.(mix);
      } else {
        setLocalStocks(mix);
      }
      setValidationErrors({});
    },
    handleSamplePortfolioChange: (portfolioName: string) => {
      const selectedPortfolio = samplePortfolios.find(p => p.name === portfolioName);
      if (selectedPortfolio) {
        setLocalStocks(selectedPortfolio.stocks);
        setValidationErrors({});
      }
    },
    setNewStockName: (value: string) => {
      setNewStockName(value);
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.newStock;
        delete newErrors.newPosition;
        delete newErrors.newRebalanceStock;
        return newErrors;
      });
    },
    setMode: (newMode: CalculatorMode) => {
      setMode(newMode);
    },
    addCurrentPosition,
    removeCurrentPosition,
    updateCurrentPosition,
    addRebalanceStock,
    removeRebalanceStock,
    updateRebalancePercentage,
    addAssetToBoth,
    addCashToBoth
  };

  // Calculate total portfolio value for rebalance mode
  const totalPortfolioValue = useMemo(() => {
    if (mode !== 'rebalance' || currentPositions.length === 0) {
      return 0;
    }

    return portfolioValue(currentPositions, stockPrices);
  }, [mode, currentPositions, stockPrices]);

  // State object for components
  const state: CalculatorState = {
    amount,
    validationErrors,
    newStockName,
    localStocks,
    currentStocks,
    allocations,
    loading: fetchingStock,
    mode,
    currentPositions,
    rebalanceStocks,
    rebalanceResults,
    stockPrices,
    totalPortfolioValue
  };

  return {
    state,
    actions,
    loading: fetchingStock
  };
}
