import type { AllocationResult } from '../types';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import styles from './ResultsSection.module.css';

interface ResultsSectionProps {
  allocations: AllocationResult[] | null;
  error?: string;
}

export function ResultsSection({ allocations, error }: ResultsSectionProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!allocations || !Array.isArray(allocations)) return null;

  return (
    <div className={styles.resultsSection}>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <div className={styles.resultsHeader}>
            <h3 className={styles.title}>Allocation Results</h3>
          </div>

          {/* Desktop: table layout */}
          {!isMobile && (
            <div className={styles.tableWrapper}>
              <table className={styles.resultsTable}>
                <thead>
                  <tr>
                    <th className={styles.assetCol}>Asset</th>
                    <th className={styles.numCol}>Allocation</th>
                    <th className={styles.numCol}>Amount</th>
                    <th className={styles.numCol}>Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((allocation) => (
                    <tr key={allocation.name} className={styles.resultRow}>
                      <td className={styles.assetCell}>
                        <span className={styles.stockSymbol}>{allocation.name}</span>
                        {allocation.companyName && (
                          <span className={styles.companyName}> {allocation.companyName}</span>
                        )}
                      </td>
                      <td className={styles.numCell}>{allocation.percentage}%</td>
                      <td className={styles.numCell}>
                        ${Number(allocation.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={styles.numCell}>
                        {typeof allocation.shares === 'number'
                          ? `${allocation.shares.toFixed(4)} shares`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Mobile: card layout */}
          {isMobile && (
            <div className={styles.mobileCards}>
              {allocations.map((allocation) => (
                <div key={allocation.name} className={styles.resultCard}>
                  <div className={styles.cardAsset}>
                    <span className={styles.stockSymbol}>{allocation.name}</span>
                    {allocation.companyName && (
                      <span className={styles.companyName}>{allocation.companyName}</span>
                    )}
                  </div>
                  <div className={styles.cardDetails}>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Allocation</span>
                      <span>{allocation.percentage}%</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Amount</span>
                      <span className={styles.cardAmount}>
                        ${Number(allocation.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Shares</span>
                      <span>
                        {typeof allocation.shares === 'number'
                          ? `${allocation.shares.toFixed(4)} shares`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}