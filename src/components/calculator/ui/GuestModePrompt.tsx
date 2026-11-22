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
      <p>You're not signed in, so your mix is saved on this device. Sign in with Google to keep it in sync across devices.</p>
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
          <option value="" disabled>Pick a model portfolio…</option>
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
