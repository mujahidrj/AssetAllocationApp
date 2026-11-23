import styles from './Calculator.module.css';
import type { ThemePref } from './useTheme';

const CHOICES: Array<{ value: ThemePref; label: string }> = [
  { value: 'device', label: 'Device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Device / Light / Dark, as three buttons that read as one control. */
export function Appearance({ pref, onPref }: { pref: ThemePref; onPref: (pref: ThemePref) => void }) {
  return (
    <span role="group" aria-label="Appearance" className={styles.segmented}>
      {CHOICES.map(c => (
        <button
          key={c.value}
          type="button"
          aria-pressed={pref === c.value}
          className={`${styles.segment} ${pref === c.value ? styles.segmentOn : ''}`}
          onClick={() => onPref(c.value)}
        >
          {c.label}
        </button>
      ))}
    </span>
  );
}
