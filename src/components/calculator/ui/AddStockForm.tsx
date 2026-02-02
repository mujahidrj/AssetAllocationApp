import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { StockSearch } from './StockSearch';
import styles from './AddStockForm.module.css';

interface AddStockFormProps {
  value: string;
  onChange: (value: string) => void;
  onAdd: (symbol?: string, companyName?: string) => void;
  error?: string;
  loading?: boolean;
}

export function AddStockForm({ value, onChange, onAdd, error, loading }: AddStockFormProps) {
  const handleSearchSelect = (symbol: string, companyName: string) => {
    onChange(symbol);
    // Auto-add when selected from search
    onAdd(symbol, companyName);
  };

  const handleAddClick = () => {
    if (value.trim() && !loading) {
      onAdd();
    }
  };

  return (
    <div className={styles.formSection}>
      <label className={styles.label}>Add New Stock</label>
      <div className={styles.addStockSection}>
        <div className={styles.newStockInput}>
          <StockSearch
            value={value}
            onChange={onChange}
            onSelect={handleSearchSelect}
            error={error}
            loading={loading}
          />
        </div>
        <button
          onClick={handleAddClick}
          className={`${styles.addButton} ${loading ? styles.loading : ''}`}
          disabled={loading || !value.trim()}
        >
          {loading ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : (
            <>
              <FontAwesomeIcon icon={faPlus} />
              <span>Add</span>
            </>
          )}
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
