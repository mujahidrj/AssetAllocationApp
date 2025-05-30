import type { SamplePortfolio } from '../types';
import styles from './GuestModePrompt.module.css';

interface GuestModePromptProps {
  onPortfolioChange: (portfolioName: string) => void;
  portfolios: SamplePortfolio[];
  defaultPortfolio: string;
}

export function GuestModePrompt({ onPortfolioChange, portfolios, defaultPortfolio }: GuestModePromptProps) {
  return (
    <div className={styles.signInPrompt}>
      <p>You're using the calculator in guest mode. Sign in to save your allocations.</p>
      <div className={styles.samplePortfolioSection}>
        <label htmlFor="samplePortfolio" className={styles.label}>
          Choose a sample portfolio:
        </label>
        <select 
          id="samplePortfolio"
          className={styles.select}
          onChange={(e) => onPortfolioChange(e.target.value)}
          defaultValue={defaultPortfolio}
        >
          {portfolios.map(portfolio => (
            <option key={portfolio.name} value={portfolio.name}>
              {portfolio.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
