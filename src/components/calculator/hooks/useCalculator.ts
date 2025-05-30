import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Stock, ValidationErrors, CalculatorState, CalculatorActions, AllocationResult } from '../types';
import { samplePortfolios } from '../data/samplePortfolios';

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
    const encodedUrl = encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    const response = await fetch(
      `https://api.allorigins.win/get?url=${encodedUrl}`,
      { signal }
    );
    if (!response.ok) {
      console.warn(`API error (${response.status}) for symbol ${symbol}. Stock prices will not be available.`);
      return null;
    }
    const { contents } = await response.json();
    const data = JSON.parse(contents);
    if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return data.chart.result[0].meta.regularMarketPrice;
    }
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

  const calculateAllocations = useCallback(async () => {
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

    // Fetch current prices for all stocks
    const pricePromises = currentStocks.map(stock => 
      fetchStockPrice(stock.name, abortControllerRef.current?.signal || new AbortController().signal)
    );
    const prices = await Promise.all(pricePromises);

    return currentStocks.map((stock, index) => {
      const allocationAmount = totalAmount * (stock.percentage / 100);
      const currentPrice = prices[index];
      const shares = currentPrice ? allocationAmount / currentPrice : undefined;

      return {
        ...stock,
        amount: allocationAmount.toFixed(2),
        currentPrice,
        shares
      };
    });
  }, [amount, currentStocks, validateAmount, validatePercentages]);

  // Update allocations whenever calculation changes
  useEffect(() => {
    let mounted = true;
    const updateAllocations = async () => {
      try {
        const result = await calculateAllocations();
        if (mounted) {
          setAllocations(result);
        }
      } catch (error) {
        console.warn('Error calculating allocations:', error);
        if (mounted) {
          setAllocations(null);
        }
      }
    };
    updateAllocations();
    return () => {
      mounted = false;
    };
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
    }
  };

  // State object for components
  const state: CalculatorState = {
    amount,
    validationErrors,
    newStockName,
    localStocks,
    currentStocks,
    allocations,
    loading: fetchingStock
  };

  return {
    state,
    actions,
    loading: fetchingStock
  };
}
