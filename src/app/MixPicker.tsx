import { useState } from 'react';
import styles from './Calculator.module.css';
import { CheckIcon, ChevronIcon } from './icons';
import type { Fund } from './model';
import { describeMix, matchingTemplate, templates, type Template } from './templates';

interface MixPickerProps {
  current: Fund[];
  onPick: (funds: Fund[], templateId: string) => void;
  onBuildOwn: () => void;
  heading: string;
}

/** The template list: Sharia templates (grouped), the index-fund templates, and "Build my own". */
export function MixPicker({ current, onPick, onBuildOwn, heading }: MixPickerProps) {
  const active = matchingTemplate(current);
  const [shariaOpen, setShariaOpen] = useState(active?.group === 'sharia');
  const sharia = templates.filter(t => t.group === 'sharia');
  const index = templates.filter(t => t.group === 'index');

  const item = (t: Template, sub = false) => (
    <button
      key={t.id}
      type="button"
      className={`${styles.pickerItem} ${sub ? styles.pickerSub : ''}`}
      onClick={() => onPick(t.funds, t.id)}
    >
      <span className={styles.pickerText}>
        <span className={styles.pickerLabel}>{t.label}</span>
        <span className={styles.pickerMix}>{describeMix(t.funds)}</span>
      </span>
      <span className={styles.pickerCheck}>{active?.id === t.id && <CheckIcon />}</span>
    </button>
  );

  return (
    <div className={styles.pickerList}>
      <div className={styles.pickerHeading}>{heading}</div>
      <button type="button" className={styles.pickerItem} aria-expanded={shariaOpen} onClick={() => setShariaOpen(o => !o)}>
        <span className={styles.pickerText}>
          <span className={styles.pickerLabel}>Sharia portfolios</span>
          <span className={styles.pickerNote}>{sharia.length} templates · SP Funds, gold, cash</span>
        </span>
        <span className={styles.pickerCheck} style={{ transform: shariaOpen ? 'rotate(180deg)' : undefined }}><ChevronIcon /></span>
      </button>
      {shariaOpen && sharia.map(t => item(t, true))}
      {index.map(t => item(t))}
      <div className={styles.pickerFoot}>
        <button type="button" className={styles.pickerItem} onClick={onBuildOwn}>
          <span className={`${styles.pickerLabel} ${styles.pickerAction}`}>Build my own</span>
        </button>
      </div>
    </div>
  );
}
