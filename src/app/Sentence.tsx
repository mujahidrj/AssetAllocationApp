import { forwardRef } from 'react';
import styles from './Calculator.module.css';
import type { Verb } from './model';

/** A small chevron sized to the sentence's type, with no empty space on its right. */
const Caret = () => (
  <svg className={styles.blankCaret} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 1.5 6 6.5l4.5-5" />
  </svg>
);

/**
 * A select drawn as a blank in the sentence: the visible text is the chosen option,
 * so the blank is exactly as wide as its words. The real select sits on top, invisible,
 * so it still opens the native picker (and the phone's wheel).
 */
function BlankSelect<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <span className={styles.blank}>
      {current.label}<Caret />
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

interface SentenceProps {
  verb: Verb;
  onVerb: (verb: Verb) => void;
  canRebalance: boolean;
  amount: string;
  onAmount: (value: string) => void;
  onAmountBlur: () => void;
  portfolioLabel: string;
  onPortfolioClick: () => void;
  menuOpen: boolean;
  showSell: boolean;
  sell: boolean;
  onSell: (sell: boolean) => void;
}

const AMOUNT_PLACEHOLDER = '2,500';

/**
 * "I'm [adding] [$2,500] to [my Roth IRA] [without selling]."
 * Words are kept in groups that never break apart, so on a phone it wraps as
 * "I'm adding $2,500 / to my Roth IRA / without selling."
 */
export const Sentence = forwardRef<HTMLButtonElement, SentenceProps>(function Sentence(props, portfolioRef) {
  const { verb, onVerb, canRebalance, amount, onAmount, onAmountBlur, portfolioLabel, onPortfolioClick, menuOpen, showSell, sell, onSell } = props;
  const hasAmount = verb !== 'rebal';

  const verbOptions: Array<{ value: Verb; label: string }> = [
    { value: 'add', label: 'adding' },
    { value: 'out', label: 'taking out' },
    ...(canRebalance ? [{ value: 'rebal' as const, label: 'just rebalancing' }] : []),
  ];

  const portfolioBlank = (
    <button
      ref={portfolioRef}
      type="button"
      className={styles.blank}
      onClick={onPortfolioClick}
      aria-expanded={menuOpen}
      aria-haspopup="dialog"
    >
      {portfolioLabel}<Caret />
    </button>
  );

  const sellBlank = (
    <BlankSelect
      label="Selling"
      value={sell ? 'yes' : 'no'}
      onChange={v => onSell(v === 'yes')}
      options={[
        { value: 'no', label: 'without selling' },
        { value: 'yes', label: "and selling what's over" },
      ]}
    />
  );

  return (
    <p className={styles.sentence}>
      <span className={styles.keep}>
        I'm{' '}
        <BlankSelect label="What you're doing" value={verb} onChange={onVerb} options={verbOptions} />
        {hasAmount && (
          <>
            {' '}
            <label className={`${styles.blank} ${styles.amountBlank}`}>
              <span className={styles.dollar}>$</span>
              <span className={styles.sizer} data-value={amount || AMOUNT_PLACEHOLDER}>
                <input
                  aria-label="Amount"
                  size={1}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={AMOUNT_PLACEHOLDER}
                  value={amount}
                  onChange={e => onAmount(e.target.value)}
                  onBlur={onAmountBlur}
                />
              </span>
            </label>
          </>
        )}
      </span>{' '}
      {hasAmount ? (
        <span className={styles.keep}>
          {verb === 'out' ? 'from' : 'to'} {portfolioBlank}{showSell ? '' : '.'}
        </span>
      ) : (
        <span className={styles.keep}>{portfolioBlank}.</span>
      )}
      {showSell && (
        <>
          {' '}
          <span className={styles.keep}>{sellBlank}.</span>
        </>
      )}
    </p>
  );
});
