import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons';
import styles from './AddStockForm.module.css';

interface AddStockFormProps {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  error?: string;
  loading?: boolean;
}

export function AddStockForm({ value, onChange, onAdd, error, loading }: AddStockFormProps) {
  return (
    <div className={styles.formSection}>
      <label className={styles.label}>Add New Stock</label>
      <div className={styles.addStockSection}>
        <div className={styles.newStockInput}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder="Enter stock symbol (e.g. VOO)"
            disabled={loading}
          />
        </div>
        <button
          onClick={onAdd}
          className={`${styles.addButton} ${loading ? styles.loading : ''}`}
          disabled={loading}
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
