import { useState, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useStocks } from '../lib/useStocks';
import { useAuth } from '../lib/auth';
import { LoginButton } from './LoginButton';
import styles from './RothIRACalculator.module.css';

interface ValidationErrors {
  [key: string]: string | undefined;
}

interface Stock {
  name: string;
  percentage: number;
}

function RothIRACalculator() {
  const [amount, setAmount] = useState("");
  const { user } = useAuth();
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [newStockName, setNewStockName] = useState("");
  const [localStocks, setLocalStocks] = useState<Stock[]>([]);
  
  // Always call the hook, but only use its values when user is signed in
  const { stocks = [], setStocks, loading } = useStocks();

  // Memoize currentStocks to prevent unnecessary recalculations
  const currentStocks = useMemo(() => {
    if (!user) return localStocks;
    return stocks;
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
    if (total !== 100) {
      return `Total percentage is ${total}%. Please adjust to equal 100%`;
    }
    return undefined;
  }, [currentStocks]);

  const addStock = useCallback(() => {
    if (!newStockName.trim()) {
      setValidationErrors(prev => ({ ...prev, newStock: "Please enter a stock name" }));
      return;
    }
    const newStock = { name: newStockName.toUpperCase(), percentage: 0 };
    if (user && setStocks) {
      setStocks([...stocks, newStock]);
    } else {
      setLocalStocks(prev => [...prev, newStock]);
    }
    setNewStockName("");
    setValidationErrors({});
  }, [newStockName, user, stocks, setStocks]);

  const removeStock = useCallback((index: number) => {
    if (user && setStocks) {
      setStocks(stocks.filter((_, i) => i !== index));
    } else {
      setLocalStocks(prev => prev.filter((_, i) => i !== index));
    }
    setValidationErrors({});
  }, [user, stocks, setStocks]);

  const updateStockPercentage = useCallback((index: number, newPercentage: string) => {
    const parsedValue = parseInt(newPercentage) || 0;
    
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

    if (user && setStocks) {
      setStocks(updateStockAtIndex(stocks));
    } else {
      setLocalStocks(prev => updateStockAtIndex(prev));
    }
    
    // Clear individual stock error
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`stock-${index}`];
      return newErrors;
    });
  }, [user, stocks, setStocks]);

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
    
    // Only clear validation errors if both validations pass
    setValidationErrors({});
    const totalAmount = parseFloat(amount);
    return currentStocks.map((stock) => ({
      name: stock.name,
      percentage: stock.percentage,
      amount: (totalAmount * (stock.percentage / 100)).toFixed(2),
    }));
  }, [amount, currentStocks, validateAmount, validatePercentages]);

  // Calculate results outside of render to handle validation properly
  const allocations = useMemo(() => calculateAllocations(), [calculateAllocations]);

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <h1 className={styles.heading}>Asset Allocation Calculator</h1>
          <LoginButton />
        </div>

        <div className={styles.card}>
          {!user && (
            <div className={styles.signInPrompt}>
              <p>You're using the calculator in guest mode. Sign in to save your allocations.</p>
            </div>
          )}

          {user && loading ? (
            <div className={styles.loadingSection}>Loading your saved allocations...</div>
          ) : (
            <>
              <div className={styles.formSection}>
                <label className={styles.label}>Total Investment Amount</label>
                <div className={styles.inputWrapper}>
                  <span className={styles.dollarSign}>$</span>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`${styles.input} ${validationErrors.amount ? styles.inputError : ''}`}
                    placeholder="Enter amount"
                  />
                </div>
                {validationErrors.amount && (
                  <div className={styles.error}>{validationErrors.amount}</div>
                )}
              </div>

              <div className={styles.formSection}>
                <div className={styles.addStockSection}>
                  <div className={styles.newStockInput}>
                    <label className={styles.label}>Add New Stock</label>
                    <input
                      type="text"
                      value={newStockName}
                      onChange={(e) => setNewStockName(e.target.value)}
                      className={`${styles.input} ${validationErrors.newStock ? styles.inputError : ''}`}
                      placeholder="Enter stock symbol"
                    />
                  </div>
                  <button onClick={addStock} className={styles.addButton}>
                    <FontAwesomeIcon icon={faPlus} />
                    <span>Add</span>
                  </button>
                </div>

                <div className={styles.stockList}>
                  {currentStocks.map((stock, index) => (
                    <div key={index} className={styles.stockItem}>
                      <div className={styles.stockSymbol}>{stock.name}</div>
                      <div className={styles.percentageInputWrapper}>
                        <input
                          type="number"
                          value={stock.percentage}
                          onChange={(e) => updateStockPercentage(index, e.target.value)}
                          className={`${styles.percentageInput} ${validationErrors[`stock-${index}`] ? styles.inputError : ''}`}
                          min="0"
                          max="100"
                        />
                        <span className={styles.percentSymbol}>%</span>
                      </div>
                      <button onClick={() => removeStock(index)} className={styles.deleteButton}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  ))}
                  {validationErrors.percentages && (
                    <div className={styles.error}>{validationErrors.percentages}</div>
                  )}
                </div>
              </div>

              <div className={styles.resultsSection}>
                {currentStocks.length === 0 ? (
                  <div className={styles.emptyState}>Add some stocks to see allocations</div>
                ) : validationErrors.percentages ? (
                  <div className={styles.error}>{validationErrors.percentages}</div>
                ) : allocations ? (
                  allocations.map((allocation) => (
                    <div key={allocation.name} className={styles.resultItem}>
                      <span>{allocation.name} ({allocation.percentage}%)</span>
                      <span>${allocation.amount}</span>
                    </div>
                  ))
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RothIRACalculator;
