import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Stock, ValidationErrors, CalculatorState, CalculatorActions, AllocationResult, CurrentPosition, RebalanceResult, CalculatorMode } from '../types';
import { samplePortfolios } from '../data/samplePortfolios';
import { db } from '../../../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Replace with your Firebase config
const finnhubApiKey = import.meta.env.VITE_FINNHUB_API_KEY;

interface UseCalculatorProps {
  user: User | null;
  stocks: Stock[];
  setStocks?: (stocks: Stock[]) => void;
}

// Helper function to fetch stock info with abort controller
const fetchStockInfo = async (symbol: string, signal: AbortSignal) => {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/search?q=${symbol}&token=${finnhubApiKey}`,
      { signal }
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
      // Ignore abort errors
      return null;
    }
    console.error('Error fetching stock info:', error);
    return null;
  }
};

// Helper function to fetch stock price with abort controller
const fetchStockPrice = async (symbol: string, signal: AbortSignal) => {
  try {
    // In production, use the deployed API URL, in development use the local server
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
      return null;
    }
    console.warn('Error fetching stock price:', error);
    return null;
  }
};

export function useCalculator({ user, stocks, setStocks }: UseCalculatorProps) {
  const [amount, setAmount] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [newStockName, setNewStockName] = useState("");
  const [fetchingStock, setFetchingStock] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [localStocks, setLocalStocks] = useState<Stock[]>([
    { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
    { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" }
  ]);
  const [allocations, setAllocations] = useState<AllocationResult[] | null>(null);
  const [stockPrices, setStockPrices] = useState<Record<string, number | null>>({});
  const [mode, setMode] = useState<CalculatorMode>('deposit');
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([]);
  const [rebalanceStocks, setRebalanceStocks] = useState<Stock[]>([
    { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
    { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" }
  ]);
  const [rebalanceResults, setRebalanceResults] = useState<RebalanceResult[] | null>(null);

  // Load rebalance data from database
  useEffect(() => {
    if (!user) {
      setCurrentPositions([]);
      setRebalanceStocks([
        { name: "FZROX", percentage: 80, companyName: "Fidelity ZERO Total Market Index Fund" },
        { name: "FZILX", percentage: 20, companyName: "Fidelity ZERO International Index Fund" }
      ]);
      return;
    }

    const userId = user.uid;
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
      } catch (error) {
        console.error('Error loading rebalance data:', error);
      }
    }

    void loadRebalanceData();

    return () => {
      mounted = false;
    };
  }, [user]);

  // Save current positions to database
  useEffect(() => {
    if (!user) return;

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
  }, [user, currentPositions]);

  // Save rebalance stocks to database
  useEffect(() => {
    if (!user) return;

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
  }, [user, rebalanceStocks]);

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

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const pricePromises = missingSymbols.map(symbol =>
        fetchStockPrice(symbol, abortControllerRef.current!.signal)
      );
      const prices = await Promise.all(pricePromises);

      setStockPrices(prev => {
        const newPrices = { ...prev };
        missingSymbols.forEach((symbol, index) => {
          // Store the price (could be a number or null if fetch failed)
          newPrices[symbol] = prices[index];
        });
        return newPrices;
      });
    } catch (error) {
      console.warn('Error fetching stock prices:', error);
      // On error, mark symbols as null (fetch failed) so we don't retry indefinitely
      setStockPrices(prev => {
        const newPrices = { ...prev };
        missingSymbols.forEach(symbol => {
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

  const validateAmount = useCallback((value: string) => {
    const num = parseFloat(value);
    if (!value) {
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

    // Abort any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      const companyName = await fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal);
      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newStock: `Couldn't find ${trimmedSymbol}` }));
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

    if (currentPositions.some(pos => pos.symbol === trimmedSymbol)) {
      setValidationErrors(prev => ({ ...prev, newPosition: "Position already exists" }));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      const companyName = await fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal);
      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newPosition: `Couldn't find ${trimmedSymbol}` }));
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
  }, [currentPositions]);

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
      // Fetch company name once - validates ticker exists
      const companyName = await fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal);
      if (companyName === null) {
        setValidationErrors(prev => ({
          ...prev,
          newPosition: `Couldn't find ${trimmedSymbol}`,
          newRebalanceStock: `Couldn't find ${trimmedSymbol}`
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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setFetchingStock(true);

    try {
      const companyName = await fetchStockInfo(trimmedSymbol, abortControllerRef.current.signal);
      if (companyName === null) {
        setValidationErrors(prev => ({ ...prev, newRebalanceStock: `Couldn't find ${trimmedSymbol}` }));
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

    // Calculate current portfolio value
    const positionValues = currentPositions.map(pos => {
      const price = stockPrices[pos.symbol] || 0;
      if (pos.inputType === 'shares') {
        return (pos.shares || 0) * price;
      } else {
        return pos.value || 0;
      }
    });

    const totalPortfolioValue = positionValues.reduce((sum, val) => sum + val, 0);

    // If no positions have values yet, don't calculate but also don't show error
    if (totalPortfolioValue <= 0) {
      return null;
    }

    // Validate percentages sum to 100%
    const totalPercentage = rebalanceStocks.reduce((sum, stock) => sum + stock.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      setValidationErrors(prev => ({
        ...prev,
        rebalancePercentages: `Total percentage is ${totalPercentage.toFixed(1)}%. Please adjust to equal 100%`
      }));
      return null;
    }

    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.rebalancePercentages;
      return newErrors;
    });

    // Create maps of current values and shares by symbol
    // IMPORTANT: Use the same calculation logic as totalPortfolioValue to ensure consistency
    const currentValuesMap = new Map<string, number>();
    const currentSharesMap = new Map<string, number>();

    currentPositions.forEach(pos => {
      const price = stockPrices[pos.symbol] ?? null; // null means fetch failed, undefined means not fetched
      let currentValue: number;
      let currentShares: number;

      if (pos.inputType === 'shares') {
        currentShares = pos.shares || 0;
        // Only calculate value if we have a price
        currentValue = price != null && price > 0 ? currentShares * price : 0;
      } else {
        // Use the actual value from the position
        currentValue = pos.value || 0;
        // Only calculate shares if we have a price
        currentShares = price != null && price > 0 ? currentValue / price : 0;
      }

      // Always set the value, even if 0 (0 is a valid value meaning no position yet)
      currentValuesMap.set(pos.symbol, currentValue);
      currentSharesMap.set(pos.symbol, currentShares);
    });

    // Create a set of symbols in target allocation
    const targetSymbols = new Set(rebalanceStocks.map(stock => stock.name));

    // Calculate rebalance results for stocks in target allocation
    const targetResults: RebalanceResult[] = rebalanceStocks.map(stock => {
      // Get current value - if not in positions, it's 0 (new position to buy)
      const currentValue = currentValuesMap.get(stock.name) || 0;
      const currentShares = currentSharesMap.get(stock.name) || 0;
      const currentPercentage = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
      const targetValue = totalPortfolioValue * (stock.percentage / 100);
      const difference = targetValue - currentValue;
      // Get price - check for null explicitly since null means fetch failed, undefined means not fetched yet
      const price = stockPrices[stock.name] ?? null;
      // Calculate shares to trade - only if we have a valid price (not null, not 0, not undefined)
      const sharesToTrade = price != null && price > 0 && Math.abs(difference) > 0.01
        ? Math.abs(difference) / price
        : 0;

      let action: 'buy' | 'sell' | 'hold' = 'hold';
      if (Math.abs(difference) > 0.01) {
        action = difference > 0 ? 'buy' : 'sell';
      }

      return {
        ...stock,
        amount: targetValue.toFixed(2), // Target value after rebalancing
        currentPrice: price != null ? price : null, // Explicitly handle null vs undefined
        shares: price != null && price > 0 ? targetValue / price : undefined,
        currentValue,
        currentPercentage,
        targetValue,
        difference, // This is what's displayed in the Amount column (via Math.abs)
        action,
        sharesToTrade,
        currentShares
      };
    });

    // Add results for positions that need to be sold (not in target allocation)
    const sellResults: RebalanceResult[] = currentPositions
      .filter(pos => !targetSymbols.has(pos.symbol))
      .map(pos => {
        const currentValue = currentValuesMap.get(pos.symbol) || 0;
        const currentShares = currentSharesMap.get(pos.symbol) || 0;
        const currentPercentage = (currentValue / totalPortfolioValue) * 100;
        const price = stockPrices[pos.symbol] ?? null;

        // These positions should be sold completely
        // Use price-based calculation if price is available, otherwise use current shares
        const sharesToSell = price != null && price > 0 && currentValue > 0
          ? currentValue / price
          : currentShares;
        return {
          name: pos.symbol,
          percentage: 0, // Not in target allocation
          companyName: pos.companyName,
          amount: '0.00',
          currentPrice: price || null,
          shares: undefined,
          currentValue,
          currentPercentage,
          targetValue: 0,
          difference: -currentValue, // Negative means sell
          action: 'sell' as const,
          sharesToTrade: sharesToSell, // Shares to sell
          currentShares
        };
      });

    // Combine and sort results: sells first, then buys, then holds
    const allResults = [...targetResults, ...sellResults].sort((a, b) => {
      if (a.action === 'sell' && b.action !== 'sell') return -1;
      if (a.action !== 'sell' && b.action === 'sell') return 1;
      if (a.action === 'buy' && b.action === 'hold') return -1;
      if (a.action === 'hold' && b.action === 'buy') return 1;
      return 0;
    });

    return allResults;
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

    const totalAmount = parseFloat(amount);

    return currentStocks.map((stock) => {
      const allocationAmount = totalAmount * (stock.percentage / 100);
      const currentPrice = stockPrices[stock.name];
      const shares = currentPrice ? allocationAmount / currentPrice : undefined;

      return {
        ...stock,
        amount: allocationAmount.toFixed(2),
        currentPrice,
        shares
      };
    });
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
    removeStock,
    updateStockPercentage,
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
    addAssetToBoth
  };

  // Calculate total portfolio value for rebalance mode
  const totalPortfolioValue = useMemo(() => {
    if (mode !== 'rebalance' || currentPositions.length === 0) {
      return 0;
    }

    return currentPositions.reduce((sum, pos) => {
      const price = stockPrices[pos.symbol] || 0;
      if (pos.inputType === 'shares') {
        return sum + ((pos.shares || 0) * price);
      } else {
        return sum + (pos.value || 0);
      }
    }, 0);
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
