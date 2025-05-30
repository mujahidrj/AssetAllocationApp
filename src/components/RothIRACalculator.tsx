import { useAuth } from '../lib/auth';
import { useStocks } from '../lib/useStocks';
import { useCalculator } from './calculator/hooks/useCalculator';
import { Header } from './calculator/ui/Header';
import { GuestModePrompt } from './calculator/ui/GuestModePrompt';
import { AmountInput } from './calculator/ui/AmountInput';
import { AddStockForm } from './calculator/ui/AddStockForm';
import { StockList } from './calculator/ui/StockList';
import { ResultsSection } from './calculator/ui/ResultsSection';
import { samplePortfolios } from './calculator/data/samplePortfolios';
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
          {!user && (
            <GuestModePrompt
              onPortfolioChange={actions.handleSamplePortfolioChange}
              portfolios={samplePortfolios}
              defaultPortfolio={samplePortfolios[0].name}
            />
          )}

          {user && loading ? (
            <div className={styles.loadingSection}>Loading your saved allocations...</div>
          ) : (
            <>
              <AmountInput
                value={state.amount}
                onChange={actions.setAmount}
                error={state.validationErrors.amount}
              />

              <AddStockForm
                value={state.newStockName}
                onChange={(value) => actions.setNewStockName(value)}
                onAdd={() => actions.addStock(state.newStockName)}
                error={state.validationErrors.newStock}
                loading={loading || state.loading}
              />

              {state.currentStocks.length > 0 && (
                <StockList
                  stocks={state.currentStocks}
                  onUpdatePercentage={actions.updateStockPercentage}
                  onRemoveStock={actions.removeStock}
                  validationErrors={state.validationErrors}
                />
              )}

              {state.currentStocks.length > 0 && state.amount && (
                <ResultsSection
                  allocations={state.allocations}
                  error={state.validationErrors.percentages}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RothIRACalculator;
