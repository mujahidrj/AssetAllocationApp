import type { AllocationResult } from '../types';
import styles from './ResultsSection.module.css';

interface ResultsSectionProps {
  allocations: AllocationResult[] | null;
  error?: string;
}

export function ResultsSection({ allocations, error }: ResultsSectionProps) {
  if (!allocations) return null;

  return (
    <div className={styles.resultsSection}>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        allocations.map((allocation) => (
          <div key={allocation.name} className={styles.resultItem}>
            <div className={styles.stockInfo}>
              <span className={styles.stockSymbol}>{allocation.name}</span>
              {allocation.companyName && (
                <span className={styles.companyName}>
                  • {allocation.companyName}
                </span>
              )}
            </div>
            <span className={styles.percentage}>{allocation.percentage}%</span>
            <span className={styles.amount}>${allocation.amount}</span>
          </div>
        ))
      )}
    </div>
  );
}
