import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './Calculator.module.css';
import { CheckIcon, ChevronIcon } from './icons';
import { displayName, type Fund, type Portfolio } from './model';
import { money } from './format';
import { FundList, MixPicker } from './MixPicker';
import { describeMix } from './templates';
import { SheetBar } from './SheetBar';
import { useSheetHistory } from './sheetHistory';

interface PortfolioMenuProps {
  portfolios: Portfolio[];
  activeId: string;
  /** The sentence blank it opens from; the menu sits under it and focus returns to it. */
  anchor: HTMLElement | null;
  onClose: () => void;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onPickMix: (funds: Fund[], templateId: string) => void;
  onBuildOwn: () => void;
  /** "All portfolios" row, shown when there are two or more portfolios. */
  all?: {
    /** Portfolios with holdings entered, and their combined value. */
    count: number;
    total: number;
    /** The combined view is what's showing now. */
    showing: boolean;
    onShow: () => void;
  };
}

/**
 * Opens from the portfolio blank in the sentence: switch portfolio, start a new one,
 * and change, rename, copy or delete the open one. A popover on desktop, a bottom
 * sheet on phones.
 */
export function PortfolioMenu(props: PortfolioMenuProps) {
  const { portfolios, activeId, anchor, onClose, onSwitch, onNew, onDuplicate, onRename, onDelete, onPickMix, onBuildOwn, all } = props;
  const showingAll = all?.showing ?? false;
  const [step, setStep] = useState<'list' | 'mix'>('list');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  // Room between the blank and the bottom of the window, so a short (landscape) screen
  // doesn't put the end of the popover off the bottom
  const [room, setRoom] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = portfolios.find(p => p.id === activeId) ?? portfolios[0];

  // Back closes the sheet, or from the template list goes back to the portfolios
  useSheetHistory('portfolios', step === 'list' ? 1 : 2, level => {
    if (level === 0) onClose(); else setStep('list');
  });

  // Sit under the blank, kept inside the column
  useLayoutEffect(() => {
    if (!anchor) return;
    const wrap = menuRef.current?.offsetParent as HTMLElement | null;
    const width = menuRef.current?.offsetWidth ?? 360;
    const a = anchor.getBoundingClientRect();
    const w = wrap?.getBoundingClientRect();
    if (!w) return;
    setLeft(Math.max(0, Math.min(a.left - w.left, w.width - width)));
    setTop(a.bottom - w.top + 8);
    setRoom(Math.max(200, window.innerHeight - a.bottom - 16));
  }, [anchor, step]);

  // Close on Escape or a click outside, and give focus back to the blank
  useEffect(() => {
    const close = () => { onClose(); anchor?.focus(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !renaming) close(); };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [anchor, onClose, renaming]);

  // Move through the rows with the arrow keys
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? items[Math.min(i + 1, items.length - 1)] : items[Math.max(i - 1, 0)];
    next?.focus();
    e.preventDefault();
  };

  const startRename = () => { setDraft(active.name); setRenaming(true); };
  const saveRename = () => { onRename(active.id, draft); setRenaming(false); };

  return (
    <>
      <div className={styles.menuBackdrop} onClick={onClose} aria-hidden="true" data-sheet-backdrop />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left, top, ...(room ? { '--menu-room': `${room}px` } as React.CSSProperties : {}) }}
        role="dialog"
        aria-label={step === 'list' ? 'Portfolios' : 'Templates'}
        onKeyDown={onKeyDown}
        data-sheet
      >
        <SheetBar
          onClose={onClose}
          back={step === 'mix' && (
            <button type="button" className={styles.pickerBack} onClick={() => setStep('list')}>
              <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><ChevronIcon /></span> {displayName(active)}
            </button>
          )}
        />
        {step === 'list' ? (
          <>
            {all && portfolios.length > 1 && (
              <div className={styles.pickerAll}>
                <button
                  type="button"
                  className={styles.pickerItem}
                  aria-current={showingAll}
                  disabled={all.count < 2}
                  onClick={() => { all.onShow(); onClose(); }}
                >
                  <span className={styles.pickerText}>
                    <span className={styles.pickerLabel}>All portfolios</span>
                    <span className={styles.pickerNote}>
                      {all.count < 2
                        ? 'Needs two portfolios with holdings, prices and targets at 100%'
                        : `${all.count} with holdings · ${money(all.total)}`}
                    </span>
                  </span>
                  <span className={styles.pickerCheck}>{showingAll && <CheckIcon />}</span>
                </button>
              </div>
            )}
            <div className={styles.pickerHeading}>Portfolios</div>
            {portfolios.map(p => (
              p.id === active.id && renaming ? (
                <form key={p.id} className={styles.renameRow} onSubmit={e => { e.preventDefault(); saveRename(); }}>
                  <input
                    autoFocus
                    aria-label="Portfolio name"
                    enterKeyHint="done"
                    placeholder="Name it, e.g. Roth IRA"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setRenaming(false); } }}
                    onBlur={saveRename}
                  />
                </form>
              ) : (
                <button
                  key={p.id}
                  type="button"
                  className={styles.pickerItem}
                  aria-current={!showingAll && p.id === active.id}
                  onClick={() => { onSwitch(p.id); onClose(); }}
                >
                  <span className={styles.pickerText}>
                    <span className={styles.pickerLabel}>{displayName(p)}</span>
                    <FundList text={describeMix(p.funds) || 'No funds yet'} />
                  </span>
                  <span className={styles.pickerCheck}>{!showingAll && p.id === active.id && <CheckIcon />}</span>
                </button>
              )
            ))}
            <button type="button" className={styles.pickerItem} onClick={() => { onNew(); onClose(); }}>
              <span className={`${styles.pickerLabel} ${styles.pickerAction}`}>+ New portfolio</span>
            </button>
            {!showingAll && <div className={styles.pickerFoot}>
              <button type="button" className={styles.pickerItem} onClick={() => setStep('mix')}>
                <span className={styles.pickerLabel}>Use a template…</span>
                <span className={styles.pickerCheck} style={{ transform: 'rotate(-90deg)' }}><ChevronIcon /></span>
              </button>
              <button type="button" className={styles.pickerItem} onClick={startRename}>
                <span className={styles.pickerLabel}>Rename</span>
              </button>
              {active.funds.length > 0 && (
                <button type="button" className={styles.pickerItem} onClick={() => { onDuplicate(); onClose(); }}>
                  <span className={styles.pickerLabel}>Copy to a new portfolio</span>
                </button>
              )}
              {portfolios.length > 1 && (
                <button type="button" className={styles.pickerItem} onClick={() => { onDelete(active.id); onClose(); }}>
                  <span className={`${styles.pickerLabel} ${styles.pickerDanger}`}>Delete {displayName(active)}</span>
                </button>
              )}
            </div>}
          </>
        ) : (
          <>
            <MixPicker
              current={active.funds}
              heading="Start from a template"
              onPick={(funds, id) => { onPickMix(funds, id); onClose(); }}
              onBuildOwn={() => { onBuildOwn(); onClose(); }}
            />
          </>
        )}
      </div>
    </>
  );
}
