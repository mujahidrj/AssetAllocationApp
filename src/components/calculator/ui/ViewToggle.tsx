import styles from './ViewToggle.module.css';

interface ViewToggleProps {
  mode: 'deposit' | 'rebalance';
  onModeChange: (mode: 'deposit' | 'rebalance') => void;
}

export function ViewToggle({ mode, onModeChange }: ViewToggleProps) {
  return (
    <div className={styles.toggleContainer}>
      <button
        className={`${styles.toggleButton} ${mode === 'deposit' ? styles.active : ''}`}
        onClick={() => onModeChange('deposit')}
        type="button"
      >
        Deposit/Withdrawal
      </button>
      <button
        className={`${styles.toggleButton} ${mode === 'rebalance' ? styles.active : ''}`}
        onClick={() => onModeChange('rebalance')}
        type="button"
      >
        Rebalance Portfolio
      </button>
    </div>
  );
}
