import { useEffect, useRef, useState } from 'react';
import type { Stock } from '../types';
import { buildShareLink, clearSharedMixFromUrl, readSharedMix } from '../../../lib/shareLink';
import styles from './ShareMix.module.css';

const describe = (mix: Stock[]) => mix.map(s => `${s.name} ${+s.percentage.toFixed(2)}%`).join(' · ');

interface SharedMixBannerProps {
  onApply: (mix: Stock[]) => void;
}

/** Offers the mix from a share link, if the page was opened with one. */
export function SharedMixBanner({ onApply }: SharedMixBannerProps) {
  const [mix, setMix] = useState<Stock[] | null>(() => readSharedMix());

  if (!mix) return null;

  const close = () => {
    clearSharedMixFromUrl();
    setMix(null);
  };

  return (
    <div className={styles.banner} role="status">
      <p className={styles.bannerText}>
        Someone shared a mix with you: <strong>{describe(mix)}</strong>
      </p>
      <div className={styles.bannerActions}>
        <button type="button" className={styles.primary} onClick={() => { onApply(mix); close(); }}>
          Use this mix
        </button>
        <button type="button" className={styles.secondary} onClick={close}>
          No thanks
        </button>
      </div>
    </div>
  );
}

interface ShareLinkButtonProps {
  stocks: Stock[];
}

/** Copies a link that opens this calculator with the same mix. */
export function ShareLinkButton({ stocks }: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const total = stocks.reduce((sum, s) => sum + s.percentage, 0);
  const canShare = stocks.some(s => s.percentage > 0) && Math.abs(total - 100) <= 0.01;

  const copy = async () => {
    const link = buildShareLink(stocks);
    try {
      await navigator.clipboard.writeText(link);
      setFallbackLink(null);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: show the link so it can be copied by hand
      setFallbackLink(link);
    }
  };

  return (
    <div className={styles.share}>
      <button type="button" className={styles.secondary} onClick={copy} disabled={!canShare}>
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
      {fallbackLink && (
        <input
          className={styles.linkField}
          readOnly
          value={fallbackLink}
          aria-label="Share link"
          onFocus={e => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
