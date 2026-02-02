import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faChartLine } from '@fortawesome/free-solid-svg-icons';
import type { Stock, ValidationErrors } from '../types';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { StockSearch } from './StockSearch';
import styles from './StockList.module.css';

interface StockListProps {
  stocks: Stock[];
  onUpdatePercentage: (index: number, percentage: string) => void;
  onRemoveStock: (index: number) => void;
  validationErrors: ValidationErrors;
  newStockName: string;
  onNewStockNameChange: (value: string) => void;
  onAddStock: (symbol?: string, companyName?: string) => void;
  onAddCash: () => void;
  loading?: boolean;
}

export function StockList({
  stocks,
  onUpdatePercentage,
  onRemoveStock,
  validationErrors,
  newStockName,
  onNewStockNameChange,
  onAddStock,
  onAddCash,
  loading = false,
}: StockListProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const hasCash = stocks.some(s => s.name === 'CASH');

  const handleAddStock = () => {
    if (newStockName.trim() && !loading) {
      onAddStock(newStockName.trim());
    }
  };

  const handleSearchSelect = (symbol: string, companyName: string) => {
    onNewStockNameChange(symbol);
    // Auto-add when selected from search
    onAddStock(symbol, companyName);
  };

  return (
    <div className={styles.stockList}>
      {stocks.length === 0 && (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faChartLine} size="3x" />
          <h3>No stocks added yet</h3>
          <p>Add your first stock using the form below to get started.</p>
        </div>
      )}

      {stocks.length > 0 && (
        <>
          {/* Desktop: table layout */}
          {!isMobile && (
            <div className={styles.tableContainer}>
              <table className={styles.stocksTable}>
                <thead>
                  <tr>
                    <th className={styles.assetCol}>Asset</th>
                    <th className={styles.allocationCol}>Allocation</th>
                    <th className={styles.percentageCol}>Percentage</th>
                    <th className={styles.actionsCol}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, index) => (
                    <tr key={index} className={styles.tableRow}>
                      <td className={styles.assetCell}>
                        <div className={styles.symbol}>{stock.name}</div>
                        {stock.companyName && (
                          <div className={styles.companyName} title={stock.companyName}>
                            {stock.companyName}
                          </div>
                        )}
                      </td>
                      <td className={styles.allocationCell}>
                        <input
                          type="range"
                          value={stock.percentage}
                          onChange={(e) => onUpdatePercentage(index, e.target.value)}
                          className={styles.percentageSlider}
                          min="0"
                          max="100"
                          step="1"
                          aria-label={`${stock.name} allocation`}
                        />
                      </td>
                      <td className={styles.percentageCell}>
                        <div className={styles.percentageInputWrapper}>
                          <input
                            type="number"
                            value={stock.percentage}
                            onChange={(e) => onUpdatePercentage(index, e.target.value)}
                            className={`${styles.percentageInput} ${validationErrors[`stock-${index}`] ? styles.inputError : ''}`}
                            min="0"
                            max="100"
                            aria-label={`${stock.name} percentage`}
                          />
                          <span className={styles.percentSymbol}>%</span>
                        </div>
                      </td>
                      <td className={styles.actionsCell}>
                        <button
                          onClick={() => onRemoveStock(index)}
                          className={styles.deleteButton}
                          aria-label="Delete stock"
                          type="button"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className={styles.addRow}>
                    {!hasCash ? (
                      <>
                        <td className={styles.assetCell}>
                          <button
                            onClick={onAddCash}
                            className={styles.addCashButton}
                            disabled={loading}
                            type="button"
                          >
                            Add Cash
                          </button>
                        </td>
                        <td colSpan={2} className={styles.addRowInputCell}>
                          <div onKeyDown={(e) => {
                            if (e.key === 'Enter' && newStockName.trim() && !loading) {
                              e.preventDefault();
                              handleAddStock();
                            }
                          }}>
                            <StockSearch
                              value={newStockName}
                              onChange={onNewStockNameChange}
                              onSelect={handleSearchSelect}
                              error={validationErrors.newStock}
                              loading={loading}
                            />
                          </div>
                        </td>
                        <td className={styles.actionsCell}>
                          <button
                            onClick={handleAddStock}
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
                        <td colSpan={3} className={styles.addRowInputCell}>
                          <div onKeyDown={(e) => {
                            if (e.key === 'Enter' && newStockName.trim() && !loading) {
                              e.preventDefault();
                              handleAddStock();
                            }
                          }}>
                            <StockSearch
                              value={newStockName}
                              onChange={onNewStockNameChange}
                              onSelect={handleSearchSelect}
                              error={validationErrors.newStock}
                              loading={loading}
                            />
                          </div>
                        </td>
                        <td className={styles.actionsCell}>
                          <button
                            onClick={handleAddStock}
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

          {/* Mobile: card layout */}
          {isMobile && (
            <div className={styles.mobileCards}>
              {stocks.map((stock, index) => (
                <div key={index} className={styles.stockCard}>
                  <div className={styles.cardAsset}>
                    <div className={styles.cardAssetInfo}>
                      <div className={styles.symbol}>{stock.name}</div>
                      {stock.companyName && (
                        <div className={styles.companyName} title={stock.companyName}>
                          {stock.companyName}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => onRemoveStock(index)}
                      className={styles.deleteButtonIcon}
                      aria-label="Delete stock"
                      type="button"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                  <div className={styles.cardSliderRow}>
                    <label className={styles.cardLabel}>Allocation</label>
                    <input
                      type="range"
                      value={stock.percentage}
                      onChange={(e) => onUpdatePercentage(index, e.target.value)}
                      className={styles.percentageSlider}
                      min="0"
                      max="100"
                      step="1"
                      aria-label={`${stock.name} allocation`}
                    />
                  </div>
                  <div className={styles.cardPercentRow}>
                    <label className={styles.cardLabel}>Target %</label>
                    <div className={styles.percentageInputWrapper}>
                      <input
                        type="number"
                        value={stock.percentage}
                        onChange={(e) => onUpdatePercentage(index, e.target.value)}
                        className={`${styles.percentageInput} ${validationErrors[`stock-${index}`] ? styles.inputError : ''}`}
                        min="0"
                        max="100"
                        aria-label={`${stock.name} percentage`}
                      />
                      <span className={styles.percentSymbol}>%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add stock form - show on mobile always, on desktop only when empty */}
      {(isMobile || stocks.length === 0) && (
        <div
          className={styles.addFormMobile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newStockName.trim() && !loading) {
              e.preventDefault();
              handleAddStock();
            }
          }}
        >
          <StockSearch
            value={newStockName}
            onChange={onNewStockNameChange}
            onSelect={handleSearchSelect}
            error={validationErrors.newStock}
            loading={loading}
          />
          <button
            onClick={handleAddStock}
            className={styles.addRowButton}
            disabled={loading || !newStockName.trim()}
            type="button"
          >
            Add
          </button>
          {!hasCash && (
            <button
              onClick={onAddCash}
              className={styles.addCashButton}
              disabled={loading}
              type="button"
            >
              Add Cash
            </button>
          )}
        </div>
      )}

      {(validationErrors.percentages || validationErrors.rebalancePercentages) && (
        <div className={styles.error}>
          {validationErrors.rebalancePercentages || validationErrors.percentages}
        </div>
      )}
    </div>
  );
}
