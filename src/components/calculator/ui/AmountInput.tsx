import styles from './AmountInput.module.css';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function AmountInput({ value, onChange, error }: AmountInputProps) {
  return (
    <div className={styles.formSection}>
      <label className={styles.label}>Total Amount for Deposit or Withdrawal</label>
      <div className={styles.inputWrapper}>
        <span className={styles.dollarSign}>$</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          placeholder="Enter amount (e.g. 10000)"
        />
      </div>
      {error && (
        <div className={styles.error}>{error}</div>
      )}
    </div>
  );
}
