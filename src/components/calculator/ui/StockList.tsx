import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { Stock, ValidationErrors } from '../types';
import styles from './StockList.module.css';

interface StockListProps {
  stocks: Stock[];
  onUpdatePercentage: (index: number, percentage: string) => void;
  onRemoveStock: (index: number) => void;
  validationErrors: ValidationErrors;
}

export function StockList({ 
  stocks, 
  onUpdatePercentage, 
  onRemoveStock, 
  validationErrors 
}: StockListProps) {
  if (stocks.length === 0) return null;

  return (
    <div className={styles.stockList}>
      {validationErrors.percentages && (
        <div className={styles.error}>{validationErrors.percentages}</div>
      )}
      {stocks.map((stock, index) => (
        <div key={index} className={styles.stockItem}>
          <div className={styles.stockSymbol}>
            <span>{stock.name}</span>
            {stock.companyName && (
              <span className={styles.companyName} title={stock.companyName}>
                {stock.companyName}
              </span>
            )}
          </div>
          <div className={styles.allocationControls}>
            <input
              type="range"
              value={stock.percentage}
              onChange={(e) => onUpdatePercentage(index, e.target.value)}
              className={styles.percentageSlider}
              min="0"
              max="100"
              step="1"
            />
            <div className={styles.percentageInputWrapper}>
              <input
                type="number"
                value={stock.percentage}
                onChange={(e) => onUpdatePercentage(index, e.target.value)}
                className={`${styles.percentageInput} ${validationErrors[`stock-${index}`] ? styles.inputError : ''}`}
                min="0"
                max="100"
              />
              <span className={styles.percentSymbol}>%</span>
            </div>
          </div>
          <div className={styles.buttonWrapper}>
            <button 
              onClick={() => onRemoveStock(index)} 
              className={styles.deleteButton} 
              aria-label="Delete stock"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
