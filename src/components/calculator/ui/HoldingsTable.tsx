import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faChartLine } from '@fortawesome/free-solid-svg-icons';
import type { CurrentPosition, Stock } from '../types';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { StockSearch } from './StockSearch';
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

/** 'row' = Option 2 (labels left, values right) | 'stacked' = Option 3 (labels above, values below) */
export type MobileHoldingsLayout = 'row' | 'stacked';

interface HoldingsTableProps {
  mobileLayoutVariant?: MobileHoldingsLayout;
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
  onAddCashToBoth: () => void;
  newStockName: string;
  onNewStockNameChange: (value: string) => void;
  validationErrors: Record<string, string | undefined>;
  loading?: boolean;
}

export function HoldingsTable({
  mobileLayoutVariant = 'row',
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
  onAddCashToBoth,
  newStockName,
  onNewStockNameChange,
  validationErrors,
  loading = false
}: HoldingsTableProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const hasCash = positions.some(p => p.symbol === 'CASH') && targetStocks.some(s => s.name === 'CASH');

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
  };

  const handleSearchSelect = (symbol: string, companyName: string) => {
    onNewStockNameChange(symbol);
    // Auto-add when selected from search
    onAddAsset(symbol);
  };

  return (
    <div className={styles.holdingsSection}>
      <h3 className={styles.sectionTitle}>Holdings</h3>
      {holdingsRows.length === 0 ? (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faChartLine} size="3x" />
          <h3>No holdings added yet</h3>
          <p>Add your first asset using the form below.</p>
        </div>
      ) : null}

      {/* Desktop: table layout */}
      {!isMobile && holdingsRows.length > 0 && (
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
                    <td className={styles.assetCell} data-label="Asset">
                      <div className={styles.symbol}>{row.symbol}</div>
                      {row.companyName && (
                        <div className={styles.companyName} title={row.companyName}>
                          {row.companyName}
                        </div>
                      )}
                    </td>
                    <td className={styles.currentCell} data-label="Current">
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
                                // Only update if position exists - don't call onAddPosition for existing positions
                                if (!isNaN(numValue) && val !== '' && val !== '.' && positionIndex !== -1) {
                                  onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                const numValue = parseFloat(val) || 0;
                                // Only update if position exists - don't call onAddPosition for existing positions
                                if (positionIndex !== -1) {
                                  onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
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
                                  // Check if position already exists - if so, just update it
                                  const existingPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                  if (existingPosIndex !== -1) {
                                    onUpdatePosition(existingPosIndex, { inputType: 'value', value: numValue });
                                  } else {
                                    // Add position with value only if it doesn't exist
                                    void onAddPosition(row.symbol).then(() => {
                                      setTimeout(() => {
                                        const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                        if (newPosIndex !== -1) {
                                          onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                        }
                                      }, 100);
                                    });
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                const numValue = parseFloat(val) || 0;
                                if (numValue > 0) {
                                  // Check if position already exists - if so, just update it
                                  const existingPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                  if (existingPosIndex !== -1) {
                                    onUpdatePosition(existingPosIndex, { inputType: 'value', value: numValue });
                                  } else {
                                    // Add position with value only if it doesn't exist
                                    void onAddPosition(row.symbol).then(() => {
                                      setTimeout(() => {
                                        const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                        if (newPosIndex !== -1) {
                                          onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                        }
                                      }, 100);
                                    });
                                  }
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
                    <td className={styles.percentageCell} data-label="Current %">
                      <span className={styles.readonlyPercentage}>
                        {row.currentPercentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className={styles.targetCell} data-label="Target %">
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
                    <td className={styles.actionsCell} data-label="Actions">
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
              <tr className={styles.addRow}>
                {!hasCash ? (
                  <>
                    <td className={styles.assetCell}>
                      <button
                        onClick={onAddCashToBoth}
                        className={styles.addCashButton}
                        disabled={loading}
                        type="button"
                      >
                        Add Cash
                      </button>
                    </td>
                    <td colSpan={3} className={styles.addRowInputCell}>
                      <div onKeyDown={(e) => {
                        if (e.key === 'Enter' && newStockName.trim() && !loading) {
                          e.preventDefault();
                          handleAddAsset();
                        }
                      }}>
                        <StockSearch
                          value={newStockName}
                          onChange={onNewStockNameChange}
                          onSelect={handleSearchSelect}
                          error={validationErrors.newPosition || validationErrors.newRebalanceStock}
                          loading={loading}
                        />
                      </div>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={handleAddAsset}
                        className={styles.addRowButton}
                        disabled={loading || !newStockName.trim()}
                        type="button"
                      >
                        Add
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td colSpan={4} className={styles.addRowInputCell}>
                      <div onKeyDown={(e) => {
                        if (e.key === 'Enter' && newStockName.trim() && !loading) {
                          e.preventDefault();
                          handleAddAsset();
                        }
                      }}>
                        <StockSearch
                          value={newStockName}
                          onChange={onNewStockNameChange}
                          onSelect={handleSearchSelect}
                          error={validationErrors.newPosition || validationErrors.newRebalanceStock}
                          loading={loading}
                        />
                      </div>
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        onClick={handleAddAsset}
                        className={styles.addRowButton}
                        disabled={loading || !newStockName.trim()}
                        type="button"
                      >
                        Add
                      </button>
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: card layout - use mobileLayoutVariant="stacked" for Option 3 */}
      {isMobile && holdingsRows.length > 0 && (
        <div className={`${styles.mobileCards} ${mobileLayoutVariant === 'stacked' ? styles.mobileCardsStacked : ''}`}>
          {holdingsRows.map((row) => {
            const positionIndex = positions.findIndex(p => p.symbol === row.symbol);
            const targetIndex = targetStocks.findIndex(s => s.name === row.symbol);
            const price = stockPrices[row.symbol] || 0;

            return (
              <div key={row.symbol} className={styles.holdingCard}>
                <div className={styles.cardAsset}>
                  <div className={styles.cardAssetInfo}>
                    <div className={styles.symbol}>{row.symbol}</div>
                    {row.companyName && (
                      <div className={styles.companyName}>{row.companyName}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (row.isPosition) handleRemovePosition(row.symbol);
                      if (row.targetStock) handleRemoveTarget(row.symbol);
                    }}
                    className={styles.deleteButtonIcon}
                    aria-label="Delete"
                    type="button"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
                <div className={styles.cardRow}>
                  <label className={styles.cardLabel}>Current value</label>
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
                            // Only update if position exists - don't call onAddPosition for existing positions
                            if (!isNaN(numValue) && val !== '' && val !== '.' && positionIndex !== -1) {
                              onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            const numValue = parseFloat(val) || 0;
                            // Only update if position exists - don't call onAddPosition for existing positions
                            if (positionIndex !== -1) {
                              onUpdatePosition(positionIndex, { inputType: 'value', value: numValue });
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
                              // Check if position already exists - if so, just update it
                              const existingPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                              if (existingPosIndex !== -1) {
                                onUpdatePosition(existingPosIndex, { inputType: 'value', value: numValue });
                              } else {
                                // Add position with value only if it doesn't exist
                                void onAddPosition(row.symbol).then(() => {
                                  setTimeout(() => {
                                    const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                    if (newPosIndex !== -1) {
                                      onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                    }
                                  }, 100);
                                });
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            const numValue = parseFloat(val) || 0;
                            if (numValue > 0) {
                              // Check if position already exists - if so, just update it
                              const existingPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                              if (existingPosIndex !== -1) {
                                onUpdatePosition(existingPosIndex, { inputType: 'value', value: numValue });
                              } else {
                                // Add position with value only if it doesn't exist
                                void onAddPosition(row.symbol).then(() => {
                                  setTimeout(() => {
                                    const newPosIndex = positions.findIndex(p => p.symbol === row.symbol);
                                    if (newPosIndex !== -1) {
                                      onUpdatePosition(newPosIndex, { inputType: 'value', value: numValue });
                                    }
                                  }, 100);
                                });
                              }
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
                </div>
                <div className={styles.cardRow}>
                  <label className={styles.cardLabel}>Current %</label>
                  <span className={styles.readonlyPercentage}>
                    {row.currentPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className={styles.cardRow}>
                  <label className={styles.cardLabel}>Target %</label>
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form - mobile when has holdings, both when empty */}
      {(isMobile && holdingsRows.length > 0) || holdingsRows.length === 0 ? (
        <div className={styles.addFormMobile}>
          <div onKeyDown={(e) => {
            if (e.key === 'Enter' && newStockName.trim() && !loading) {
              e.preventDefault();
              handleAddAsset();
            }
          }}>
            <StockSearch
              value={newStockName}
              onChange={onNewStockNameChange}
              onSelect={handleSearchSelect}
              error={validationErrors.newPosition || validationErrors.newRebalanceStock}
              loading={loading}
            />
          </div>
          <button
            onClick={handleAddAsset}
            className={styles.addRowButton}
            disabled={loading || !newStockName.trim()}
            type="button"
          >
            Add
          </button>
          {!hasCash && (
            <button
              onClick={onAddCashToBoth}
              className={styles.addCashButton}
              disabled={loading}
              type="button"
            >
              Add Cash
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
