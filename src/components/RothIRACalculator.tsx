import { useAuth } from '../lib/useAuth';
import { useStocks } from '../lib/useStocks';
import { useCalculator } from './calculator/hooks/useCalculator';
import { Header } from './calculator/ui/Header';
import { ViewToggle } from './calculator/ui/ViewToggle';
import { GuestModePrompt } from './calculator/ui/GuestModePrompt';
import { AmountInput } from './calculator/ui/AmountInput';
import { StockList } from './calculator/ui/StockList';
import { ResultsSection } from './calculator/ui/ResultsSection';
import { HoldingsTable } from './calculator/ui/HoldingsTable';
import { AllocationSummary } from './calculator/ui/AllocationSummary';
import { RebalanceResultsSection } from './calculator/ui/RebalanceResultsSection';
import { samplePortfolios } from './calculator/data/samplePortfolios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import styles from './RothIRACalculator.module.css';

function RothIRACalculator() {
  const { user } = useAuth();
  const { stocks = [], setStocks, loading } = useStocks();
  const { state, actions } = useCalculator({ user, stocks, setStocks });

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <Header />
        <div className={styles.card}>
          <ViewToggle mode={state.mode} onModeChange={actions.setMode} />

          {user && loading ? (
            <div className={styles.loadingSection}>
              <FontAwesomeIcon icon={faSpinner} spin size="2x" />
              <p>Loading your saved allocations...</p>
            </div>
          ) : state.mode === 'deposit' ? (
            <>
              {!user && (
                <GuestModePrompt
                  onPortfolioChange={actions.handleSamplePortfolioChange}
                  portfolios={samplePortfolios}
                  defaultPortfolio={samplePortfolios[0].name}
                />
              )}

              <AmountInput
                value={state.amount}
                onChange={actions.setAmount}
                error={state.validationErrors.amount}
              />

              <StockList
                stocks={state.currentStocks}
                onUpdatePercentage={actions.updateStockPercentage}
                onRemoveStock={actions.removeStock}
                validationErrors={state.validationErrors}
                newStockName={state.newStockName}
                onNewStockNameChange={actions.setNewStockName}
                onAddStock={() => actions.addStock(state.newStockName)}
                loading={loading || state.loading}
              />

              {state.currentStocks.length > 0 && state.amount && (
                <ResultsSection
                  allocations={state.allocations}
                  error={state.validationErrors.percentages}
                />
              )}
            </>
          ) : (
            <>
              <HoldingsTable
                positions={state.currentPositions}
                targetStocks={state.rebalanceStocks}
                stockPrices={state.stockPrices || {}}
                totalPortfolioValue={state.totalPortfolioValue}
                onUpdatePosition={actions.updateCurrentPosition}
                onRemovePosition={actions.removeCurrentPosition}
                onAddPosition={actions.addCurrentPosition}
                onUpdateTargetPercentage={actions.updateRebalancePercentage}
                onRemoveTargetStock={actions.removeRebalanceStock}
                onAddTargetStock={actions.addRebalanceStock}
                onAddAsset={actions.addAssetToBoth}
                newStockName={state.newStockName}
                onNewStockNameChange={actions.setNewStockName}
                validationErrors={state.validationErrors}
                loading={state.loading}
              />

              <AllocationSummary
                targetTotal={state.rebalanceStocks.reduce((sum, stock) => sum + stock.percentage, 0)}
                currentTotal={state.totalPortfolioValue}
                hasError={!!state.validationErrors.rebalancePercentages}
              />

              {(state.rebalanceResults && state.rebalanceResults.length > 0) ||
                (state.currentPositions.length > 0 && state.rebalanceStocks.length > 0 && state.validationErrors.rebalancePercentages) ? (
                <RebalanceResultsSection
                  results={state.rebalanceResults}
                  error={state.validationErrors.rebalancePercentages}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RothIRACalculator;
