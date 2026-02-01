import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { CurrentPosition } from '../types';
import styles from './CurrentPositionsList.module.css';

interface CurrentPositionsListProps {
  positions: CurrentPosition[];
  stockPrices: Record<string, number | null>;
  onUpdatePosition: (index: number, updates: Partial<CurrentPosition>) => void;
  onRemovePosition: (index: number) => void;
}

export function CurrentPositionsList({
  positions,
  stockPrices,
  onUpdatePosition,
  onRemovePosition
}: CurrentPositionsListProps) {
  if (positions.length === 0) return null;

  const getCalculatedValue = (position: CurrentPosition): number => {
    const price = stockPrices[position.symbol];
    if (position.inputType === 'shares') {
      return (position.shares || 0) * (price || 0);
    }
    return position.value || 0;
  };

  const getCalculatedShares = (position: CurrentPosition): number => {
    const price = stockPrices[position.symbol];
    if (position.inputType === 'value') {
      return price && price > 0 ? (position.value || 0) / price : 0;
    }
    return position.shares || 0;
  };

  return (
    <div className={styles.positionsList}>
      {positions.map((position, index) => {
        const price = stockPrices[position.symbol];
        const calculatedValue = getCalculatedValue(position);
        const calculatedShares = getCalculatedShares(position);

        return (
          <div key={index} className={styles.positionItem}>
            <div className={styles.positionSymbol}>
              <span>{position.symbol}</span>
              {position.companyName && (
                <span className={styles.companyName} title={position.companyName}>
                  {position.companyName}
                </span>
              )}
            </div>
            <div className={styles.positionControls}>
              <div className={styles.inputTypeSelector}>
                <button
                  type="button"
                  className={`${styles.typeButton} ${position.inputType === 'shares' ? styles.active : ''}`}
                  onClick={() => onUpdatePosition(index, { inputType: 'shares' })}
                >
                  Shares
                </button>
                <button
                  type="button"
                  className={`${styles.typeButton} ${position.inputType === 'value' ? styles.active : ''}`}
                  onClick={() => onUpdatePosition(index, { inputType: 'value' })}
                >
                  Value
                </button>
              </div>
              <div className={styles.inputWrapper}>
                {position.inputType === 'shares' ? (
                  <input
                    type="number"
                    value={position.shares || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      onUpdatePosition(index, { shares: value });
                    }}
                    className={styles.input}
                    min="0"
                    step="0.0001"
                    placeholder="0"
                  />
                ) : (
                  <div className={styles.valueInputWrapper}>
                    <span className={styles.dollarSign}>$</span>
                    <input
                      type="number"
                      value={position.value || ''}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        onUpdatePosition(index, { value });
                      }}
                      className={styles.input}
                      min="0"
                      step="0.01"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
              {price && (
                <div className={styles.calculatedInfo}>
                  {position.inputType === 'shares' ? (
                    <span className={styles.calculatedValue}>
                      ${calculatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className={styles.calculatedShares}>
                      {calculatedShares.toFixed(4)} shares
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => onRemovePosition(index)}
                className={styles.deleteButton}
                aria-label="Delete position"
                type="button"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
