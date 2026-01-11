import type { RebalanceResult } from '../types';
import styles from './RebalanceResultsSection.module.css';

interface RebalanceResultsSectionProps {
  results: RebalanceResult[] | null;
  error?: string;
}

export function RebalanceResultsSection({ results, error }: RebalanceResultsSectionProps) {
  // Show section if there's an error OR if there are results
  if (!error && (!results || !Array.isArray(results) || results.length === 0)) return null;

  // Filter out holds and entries with no net change - only show buys and sells with meaningful differences
  const actionableResults = results?.filter(r => 
    r.action !== 'hold' && Math.abs(r.difference) > 0.01
  ) || [];

  if (!error && actionableResults.length === 0) return null;

  return (
    <div className={styles.resultsSection}>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <div className={styles.resultsHeader}>
            <h3 className={styles.title}>Rebalancing Recommendations</h3>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.resultsTable}>
              <thead>
                <tr>
                  <th className={styles.assetCol}>Asset</th>
                  <th className={styles.actionCol}>Action</th>
                  <th className={styles.amountCol}>Amount</th>
                  <th className={styles.sharesCol}>Shares</th>
                  <th className={styles.changeCol}>Net Change</th>
                </tr>
              </thead>
              <tbody>
                {actionableResults.map((result) => (
                  <tr key={result.name} className={styles.tableRow}>
                    <td className={styles.assetCell}>
                      <div className={styles.symbol}>{result.name}</div>
                      {result.companyName && (
                        <div className={styles.companyName} title={result.companyName}>
                          {result.companyName}
                        </div>
                      )}
                    </td>
                    <td className={styles.actionCell}>
                      <div className={`${styles.action} ${styles[result.action]}`}>
                        {result.action === 'buy' ? 'BUY' : 'SELL'}
                      </div>
                    </td>
                    <td className={styles.amountCell}>
                      ${Math.abs(result.difference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={styles.sharesCell}>
                      {result.sharesToTrade.toFixed(4)}
                    </td>
                    <td className={`${styles.changeCell} ${result.difference >= 0 ? styles.positive : styles.negative}`}>
                      {result.difference >= 0 ? '+' : ''}
                      ${result.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
