import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faChartLine } from '@fortawesome/free-solid-svg-icons';
import type { CurrentPosition, Stock } from '../types';
import styles from './HoldingsTable.module.css';

interface HoldingsRow {
  symbol: string;
  companyName?: string;
  currentValue: number;
  currentPercentage: number;
  targetPercentage: number;
  isPosition: boolean; // true if it's a current position, false if it's only in target
  position?: CurrentPosition;
  targetStock?: Stock;
}

interface HoldingsTableProps {
  positions: CurrentPosition[];
  targetStocks: Stock[];
  stockPrices: Record<string, number | null>;
  totalPortfolioValue: number;
  onUpdatePosition: (index: number, updates: Partial<CurrentPosition>) => void;
  onRemovePosition: (index: number) => void;
  onAddPosition: (symbol: string) => Promise<void>;
  onUpdateTargetPercentage: (index: number, percentage: string) => void;
  onRemoveTargetStock: (index: number) => void;
  onAddTargetStock: (symbol: string) => Promise<void>;
  onAddAsset: (symbol: string) => Promise<void>;
  newStockName: string;
  onNewStockNameChange: (value: string) => void;
  validationErrors: Record<string, string | undefined>;
  loading?: boolean;
  showAddForm?: boolean;
  onToggleAddForm?: () => void;
}

export function HoldingsTable({
  positions,
  targetStocks,
  stockPrices,
  totalPortfolioValue,
  onUpdatePosition,
  onRemovePosition,
  onAddPosition,
  onUpdateTargetPercentage,
  onRemoveTargetStock,
  onAddTargetStock,
  onAddAsset,
  newStockName,
  onNewStockNameChange,
  validationErrors,
  loading = false,
  showAddForm = false,
  onToggleAddForm
}: HoldingsTableProps) {
  // Track local input values for better UX while typing
  const [localTargetValues, setLocalTargetValues] = useState<Record<string, string>>({});
  const [localCurrentValues, setLocalCurrentValues] = useState<Record<string, { value?: string }>>({});
  // Create a unified list of holdings
  const holdingsRows: HoldingsRow[] = [];
  
  // Get all unique symbols from positions and target stocks
  const allSymbols = new Set<string>();
  positions.forEach(pos => allSymbols.add(pos.symbol));
  targetStocks.forEach(stock => allSymbols.add(stock.name));

  // Create rows for each unique symbol
  Array.from(allSymbols).forEach(symbol => {
    const position = positions.find(p => p.symbol === symbol);
    const targetStock = targetStocks.find(s => s.name === symbol);
    
    // Calculate current value
    let currentValue = 0;
    if (position) {
      const price = stockPrices[symbol] || 0;
      if (position.inputType === 'shares') {
        currentValue = (position.shares || 0) * price;
      } else {
        currentValue = position.value || 0;
      }
    }
    
    const currentPercentage = totalPortfolioValue > 0 
      ? (currentValue / totalPortfolioValue) * 100 
      : 0;
    const targetPercentage = targetStock?.percentage || 0;

    holdingsRows.push({
      symbol,
      companyName: position?.companyName || targetStock?.companyName,
      currentValue,
      currentPercentage,
      targetPercentage,
      isPosition: !!position,
      position,
      targetStock
    });
  });

  const handleRemovePosition = (symbol: string) => {
    const index = positions.findIndex(p => p.symbol === symbol);
    if (index !== -1) {
      onRemovePosition(index);
    }
  };

  const handleRemoveTarget = (symbol: string) => {
    const index = targetStocks.findIndex(s => s.name === symbol);
    if (index !== -1) {
      onRemoveTargetStock(index);
    }
  };


  // Track pending percentage updates for target stocks that are being added
  const pendingTargetUpdates = useRef<Map<string, number>>(new Map());

  // Apply pending percentage updates when target stocks are added
  useEffect(() => {
    pendingTargetUpdates.current.forEach((percentage, symbol) => {
      const index = targetStocks.findIndex(s => s.name === symbol);
      if (index !== -1) {
        onUpdateTargetPercentage(index, percentage.toString());
        pendingTargetUpdates.current.delete(symbol);
      }
    });
  }, [targetStocks, onUpdateTargetPercentage]);

  const handleUpdateTarget = (symbol: string, percentage: string) => {
    const index = targetStocks.findIndex(s => s.name === symbol);
    const newPercentage = parseFloat(percentage) || 0;
    
    if (index === -1) {
      // Target stock doesn't exist, add it first and store the pending percentage
      pendingTargetUpdates.current.set(symbol, newPercentage);
      void onAddTargetStock(symbol);
      return;
    }
    
    // Update the percentage
    onUpdateTargetPercentage(index, percentage);
  };

  const handleAddAsset = async () => {
    if (!newStockName.trim()) return;
    await onAddAsset(newStockName.trim());
    if (onToggleAddForm && !(validationErrors.newPosition || validationErrors.newRebalanceStock)) {
      onToggleAddForm();
    }
  };

  return (
    <div className={styles.holdingsSection}>
      <h3 className={styles.sectionTitle}>Holdings</h3>
      {showAddForm && (
        <div className={styles.addFormContainer}>
          <div className={styles.addFormInput}>
            <input
              type="text"
              value={newStockName}
              onChange={(e) => onNewStockNameChange(e.target.value)}
              className={`${styles.input} ${validationErrors.newPosition || validationErrors.newRebalanceStock ? styles.inputError : ''}`}
              placeholder="Enter stock symbol"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddAsset();
                }
              }}
            />
          </div>
          <button
            onClick={handleAddAsset}
            className={styles.addFormButton}
            disabled={loading || !newStockName.trim()}
          >
            Add
          </button>
          {onToggleAddForm && (
            <button
              onClick={onToggleAddForm}
              className={styles.cancelButton}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {(validationErrors.newPosition || validationErrors.newRebalanceStock) && (
        <div className={styles.error}>
          {validationErrors.newPosition || validationErrors.newRebalanceStock}
        </div>
      )}
      {holdingsRows.length === 0 ? (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faChartLine} size="3x" />
          <h3>No holdings added yet</h3>
          <p>Add your first asset using the button below.</p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.holdingsTable}>
            <thead>
              <tr>
                <th className={styles.assetCol}>Asset</th>
                <th className={styles.currentCol}>Current</th>
                <th className={styles.percentageCol}>Current %</th>
                <th className={styles.targetCol}>Target %</th>
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdingsRows.map((row) => {
                const positionIndex = positions.findIndex(p => p.symbol === row.symbol);
                const targetIndex = targetStocks.findIndex(s => s.name === row.symbol);
                const price = stockPrices[row.symbol] || 0;

                return (
                  <tr key={row.symbol} className={styles.tableRow}>
                    <td className={styles.assetCell}>
                      <div className={styles.symbol}>{row.symbol}</div>
                      {row.companyName && (
                        <div className={styles.companyName} title={row.companyName}>
                          {row.companyName}
                        </div>
                      )}
                    </td>
                    <td className={styles.currentCell}>
                      {row.isPosition ? (
                        <div className={styles.currentValueInput}>
                          <div className={styles.valueInputWrapper}>
                            <span className={styles.dollarSign}>$</span>
                            <input
                              type="number"
                              value={localCurrentValues[row.symbol]?.value !== undefined
                                ? localCurrentValues[row.symbol].value
                                : (row.position?.value?.toString() || (row.position?.inputType === 'shares' && price > 0 ? ((row.position?.shares || 0) * price).toFixed(2) : ''))}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalCurrentValues(prev => ({
                                  ...prev,
                                  [row.symbol]: { ...prev[row.symbol], value: val }
                                }));
                                const numValue = parseFloat(val);
                                if (!isNaN(numValue) && val !== '' && val !== '.') {
                                  onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                const numValue = parseFloat(val) || 0;
                                onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
                                setLocalCurrentValues(prev => {
                                  const updated = { ...prev };
                                  if (updated[row.symbol]) {
                                    delete updated[row.symbol].value;
                                    if (Object.keys(updated[row.symbol]).length === 0) {
                                      delete updated[row.symbol];
                                    }
                                  }
                                  return updated;
                                });
                              }}
                              className={styles.input}
                              min="0"
                              step="0.01"
                              placeholder="0"
                            />
                          </div>
                          {price > 0 && (
                            <div className={styles.calculatedInfo}>
                              <span className={styles.calculatedShares}>
                                {(row.currentValue / price).toFixed(4)} shares
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.currentValueInput}>
                          <div className={styles.valueInputWrapper}>
                            <span className={styles.dollarSign}>$</span>
                            <input
                              type="number"
                              value={localCurrentValues[row.symbol]?.value || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLocalCurrentValues(prev => ({
                                  ...prev,
                                  [row.symbol]: { ...prev[row.symbol], value: val }
                                }));
                                const numValue = parseFloat(val);
                                if (!isNaN(numValue) && val !== '' && val !== '.') {
                                  // Add position with value
                                  void onAddPosition(row.symbol).then(() => {
                                    setTimeout(() => {
                                      const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                      if (newPosIndex !== -1) {
                                        onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                      }
                                    }, 100);
                                  });
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                const numValue = parseFloat(val) || 0;
                                if (numValue > 0) {
                                  void onAddPosition(row.symbol).then(() => {
                                    setTimeout(() => {
                                      const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                      if (newPosIndex !== -1) {
                                        onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                      }
                                    }, 100);
                                  });
                                }
                                setLocalCurrentValues(prev => {
                                  const updated = { ...prev };
                                  if (updated[row.symbol]) {
                                    delete updated[row.symbol].value;
                                    if (Object.keys(updated[row.symbol]).length === 0) {
                                      delete updated[row.symbol];
                                    }
                                  }
                                  return updated;
                                });
                              }}
                              className={styles.input}
                              min="0"
                              step="0.01"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className={styles.percentageCell}>
                      <span className={styles.readonlyPercentage}>
                        {row.currentPercentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className={styles.targetCell}>
                      <div className={styles.targetInputWrapper}>
                        <input
                          type="number"
                          value={localTargetValues[row.symbol] !== undefined 
                            ? localTargetValues[row.symbol] 
                            : row.targetPercentage.toString()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLocalTargetValues(prev => ({ ...prev, [row.symbol]: val }));
                            handleUpdateTarget(row.symbol, val);
                          }}
                          onBlur={() => {
                            // Clear local value on blur so it uses the actual stored value
                            setLocalTargetValues(prev => {
                              const updated = { ...prev };
                              delete updated[row.symbol];
                              return updated;
                            });
                          }}
                          className={`${styles.targetInput} ${targetIndex !== -1 && validationErrors[`rebalance-stock-${targetIndex}`] ? styles.inputError : ''}`}
                          min="0"
                          max="100"
                          step="0.1"
                        />
                        <span className={styles.percentSymbol}>%</span>
                      </div>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={() => {
                          if (row.isPosition) {
                            handleRemovePosition(row.symbol);
                          }
                          if (row.targetStock) {
                            handleRemoveTarget(row.symbol);
                          }
                        }}
                        className={styles.deleteButton}
                        aria-label="Delete"
                        type="button"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!showAddForm && (
        <button onClick={onToggleAddForm} className={styles.addButton} type="button">
          + Add Asset
        </button>
      )}
    </div>
  );
}
