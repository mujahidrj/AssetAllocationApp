import { useState } from 'react';
import styles from './Calculator.module.css';
import { CheckIcon, ChevronIcon } from './icons';
import type { Fund } from './model';
import { describeMix, matchingTemplate, templates, type Template } from './templates';

interface MixPickerProps {
  current: Fund[];
  onPick: (funds: Fund[]) => void;
  onBuildOwn: () => void;
  onClose?: () => void;
  /** Shown inside the trades card on first run, without the popover frame. */
  inline?: boolean;
}

export function MixPicker({ current, onPick, onBuildOwn, onClose, inline }: MixPickerProps) {
  const active = matchingTemplate(current);
  const [shariaOpen, setShariaOpen] = useState(active?.group === 'sharia');
  const sharia = templates.filter(t => t.group === 'sharia');
  const index = templates.filter(t => t.group === 'index');
  const hasOwn = current.some(f => f.target > 0);

  const item = (t: Template, sub = false) => (
    <button
      key={t.id}
      type="button"
      className={`${styles.pickerItem} ${sub ? styles.pickerSub : ''} ${active?.id === t.id ? styles.pickerItemOn : ''}`}
      onClick={() => { onPick(t.funds); onClose?.(); }}
    >
      <span className={styles.pickerLabel}>{t.label}</span>
      <span className={styles.pickerMix}>{describeMix(t.funds)}</span>
    </button>
  );

  return (
    <div
      className={`${styles.picker} ${inline ? styles.pickerInline : ''}`}
      role={inline ? undefined : 'dialog'}
      aria-label="Choose a mix"
      onKeyDown={e => { if (e.key === 'Escape') onClose?.(); }}
    >
      {hasOwn && !inline && (
        <button type="button" className={`${styles.pickerItem} ${!active ? styles.pickerItemOn : ''}`} onClick={onClose}>
          <span className={styles.pickerLabel}>My mix</span>
          <span className={styles.pickerMix}>{describeMix(current)}</span>
          {!active && <CheckIcon />}
        </button>
      )}
      <div className={styles.pickerHeading}>{inline ? 'Start with a mix' : 'Start from a template'}</div>
      <button
        type="button"
        className={styles.pickerItem}
        aria-expanded={shariaOpen}
        onClick={() => setShariaOpen(o => !o)}
      >
        <span className={styles.pickerLabel}>Sharia mixes</span>
        <span className={styles.pickerMix}>{sharia.length} mixes · SP Funds, gold, cash</span>
        <span style={{ transform: shariaOpen ? 'rotate(180deg)' : undefined, display: 'inline-flex' }}><ChevronIcon /></span>
      </button>
      {shariaOpen && sharia.map(t => item(t, true))}
      {index.map(t => item(t))}
      <div className={styles.pickerFoot}>
        <button type="button" className={styles.pickerItem} onClick={() => { onBuildOwn(); onClose?.(); }}>
          <span className={styles.pickerLabel} style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Build my own</span>
        </button>
      </div>
    </div>
  );
}
