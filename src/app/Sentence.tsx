import styles from './Calculator.module.css';
import { ChevronIcon } from './icons';
import type { Verb } from './model';

interface SentenceProps {
  verb: Verb;
  onVerb: (verb: Verb) => void;
  canRebalance: boolean;
  amount: string;
  onAmount: (value: string) => void;
  onAmountBlur: () => void;
  mixLabel: string;
  onMixClick: () => void;
  mixOpen: boolean;
  showSell: boolean;
  sell: boolean;
  onSell: (sell: boolean) => void;
}

/** "I'm [adding] [$2,500] to [my mix ▾] [without selling ▾]." */
export function Sentence(props: SentenceProps) {
  const { verb, onVerb, canRebalance, amount, onAmount, onAmountBlur, mixLabel, onMixClick, mixOpen, showSell, sell, onSell } = props;
  const hasAmount = verb !== 'rebal';

  return (
    <p className={styles.sentence}>
      I'm{' '}
      <select
        className={styles.blank}
        aria-label="What you're doing"
        value={verb}
        onChange={e => onVerb(e.target.value as Verb)}
      >
        <option value="add">adding</option>
        <option value="out">taking out</option>
        <option value="rebal" disabled={!canRebalance}>just rebalancing</option>
      </select>{' '}
      {hasAmount && (
        <>
          <label className={styles.amountBlank}>
            <span>$</span>
            <input
              aria-label="Amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={e => onAmount(e.target.value)}
              onBlur={onAmountBlur}
              style={{ width: `${Math.max(3, amount.length + 0.5)}ch` }}
            />
          </label>{' '}
          {verb === 'out' ? 'from' : 'to'}{' '}
        </>
      )}
      <button type="button" className={styles.blank} onClick={onMixClick} aria-expanded={mixOpen} aria-haspopup="dialog">
        {mixLabel}
        <span className={styles.blankCaret}><ChevronIcon /></span>
      </button>
      {showSell && (
        <>
          {' '}
          <select
            className={styles.blank}
            aria-label="Selling"
            value={sell ? 'yes' : 'no'}
            onChange={e => onSell(e.target.value === 'yes')}
          >
            <option value="no">without selling</option>
            <option value="yes">and selling to match</option>
          </select>
        </>
      )}
      .
    </p>
  );
}
