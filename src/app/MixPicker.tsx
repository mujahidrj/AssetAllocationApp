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

/** "SPUS 40 · SPTE 38 · …", wrapping only between funds so a symbol never
 *  gets separated from its percentage. */
export function FundList({ text }: { text: string }) {
  const parts = text.split(' · ');
  return (
    <span className={styles.pickerMix}>
      {parts.map((part, i) => (
        <span key={i} className={styles.pickerFund}>{i < parts.length - 1 ? `${part} ·` : part}</span>
      ))}
    </span>
  );
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
        <FundList text={describeMix(t.funds)} />
      </span>
      <span className={styles.pickerCheck}>{active?.id === t.id && <CheckIcon />}</span>
    </button>
  );

  return (
    <div className={styles.pickerList}>
      <div className={styles.pickerHeading}>{heading}</div>
      <button type="button" className={styles.pickerItem} aria-expanded={shariaOpen} onClick={() => setShariaOpen(o => !o)}>
        <span className={styles.pickerText}>
          <span className={styles.pickerLabel}>Sharia templates</span>
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
