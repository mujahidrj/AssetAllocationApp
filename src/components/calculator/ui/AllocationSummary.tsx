import styles from './AllocationSummary.module.css';

interface AllocationSummaryProps {
  targetTotal: number;
  currentTotal: number;
  hasError?: boolean;
}

export function AllocationSummary({ targetTotal, currentTotal }: AllocationSummaryProps) {
  const isTargetValid = Math.abs(targetTotal - 100) <= 0.01;

  return (
    <div className={styles.summarySection}>
      <h3 className={styles.sectionTitle}>Allocation Summary</h3>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Target Total:</span>
          <span className={`${styles.value} ${isTargetValid ? styles.valid : styles.invalid}`}>
            {targetTotal.toFixed(1)}% {isTargetValid && '✓'}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.label}>Current Total:</span>
          <span className={styles.value}>
            ${currentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
