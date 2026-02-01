import type { RebalanceResult } from '../types';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import styles from './RebalanceResultsSection.module.css';

interface RebalanceResultsSectionProps {
  results: RebalanceResult[] | null;
  error?: string;
}

export function RebalanceResultsSection({ results, error }: RebalanceResultsSectionProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Show section if there's an error OR if there are results
  if (!error && (!results || !Array.isArray(results) || results.length === 0)) return null;

  // Filter out holds and entries with no net change - only show buys and sells with meaningful differences
  // Sort so sells appear before buys (sell first to free up cash, then buy)
  const actionableResults = (results?.filter(r =>
    r.action !== 'hold' && Math.abs(r.difference) > 0.01
  ) || []).sort((a, b) => {
    if (a.action === 'sell' && b.action === 'buy') return -1;
    if (a.action === 'buy' && b.action === 'sell') return 1;
    return 0;
  });

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

          {/* Desktop: table layout */}
          {!isMobile && (
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
                      <td className={styles.assetCell} data-label="Asset">
                        <div className={styles.symbol}>{result.name}</div>
                        {result.companyName && (
                          <div className={styles.companyName} title={result.companyName}>
                            {result.companyName}
                          </div>
                        )}
                      </td>
                      <td className={styles.actionCell} data-label="Action">
                        <div className={`${styles.action} ${styles[result.action]}`}>
                          {result.action === 'buy' ? 'BUY' : 'SELL'}
                        </div>
                      </td>
                      <td className={styles.amountCell} data-label="Amount">
                        ${Math.abs(result.difference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={styles.sharesCell} data-label="Shares">
                        {result.currentPrice != null && result.currentPrice > 0 && result.sharesToTrade > 0
                          ? result.sharesToTrade.toFixed(4)
                          : result.currentPrice === null
                            ? 'Price unavailable'
                            : '0.0000'}
                      </td>
                      <td className={`${styles.changeCell} ${result.difference >= 0 ? styles.positive : styles.negative}`} data-label="Net Change">
                        {result.difference >= 0 ? '+' : ''}
                        ${result.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {actionableResults.map((result) => (
                <div key={result.name} className={styles.resultCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardAsset}>
                      <div className={styles.symbol}>{result.name}</div>
                      {result.companyName && (
                        <div className={styles.companyName}>{result.companyName}</div>
                      )}
                    </div>
                    <div className={`${styles.action} ${styles[result.action]}`}>
                      {result.action === 'buy' ? 'BUY' : 'SELL'}
                    </div>
                  </div>
                  <div className={styles.cardDetails}>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Amount</span>
                      <span>${Math.abs(result.difference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Shares</span>
                      <span>
                        {result.currentPrice != null && result.currentPrice > 0 && result.sharesToTrade > 0
                          ? result.sharesToTrade.toFixed(4)
                          : result.currentPrice === null
                            ? 'Price unavailable'
                            : '0.0000'}
                      </span>
                    </div>
                    <div className={`${styles.cardRow} ${styles.netChange} ${result.difference >= 0 ? styles.positive : styles.negative}`}>
                      <span className={styles.cardLabel}>Net Change</span>
                      <span className={styles.changeValue}>
                        {result.difference >= 0 ? '+' : ''}
                        ${result.difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
