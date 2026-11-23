import styles from './Calculator.module.css';
import { ChevronIcon } from './icons';
import type { Verb } from './model';

/**
 * A select drawn as a blank in the sentence: the visible text is the chosen option,
 * so the blank is exactly as wide as its words. The real select sits on top, invisible,
 * so it still opens the native picker (and the phone's wheel).
 */
function BlankSelect<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <span className={`${styles.blank} ${styles.blankSelect}`}>
      {current.label}
      <span className={styles.blankCaret}><ChevronIcon /></span>
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
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
      <BlankSelect
        label="What you're doing"
        value={verb}
        onChange={onVerb}
        options={[
          { value: 'add', label: 'adding' },
          { value: 'out', label: 'taking out' },
          { value: 'rebal', label: 'just rebalancing', disabled: !canRebalance },
        ]}
      />{' '}
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
          <BlankSelect
            label="Selling"
            value={sell ? 'yes' : 'no'}
            onChange={v => onSell(v === 'yes')}
            options={[
              { value: 'no', label: 'without selling' },
              { value: 'yes', label: 'and selling to match' },
            ]}
          />
        </>
      )}
      .
    </p>
  );
}
