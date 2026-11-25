const MINUS = '−';

const dollarsFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,250.00", or "−$450.00" for negatives. */
export function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded < 0 ? MINUS : ''}$${dollarsFmt.format(Math.abs(rounded))}`;
}

/** Share counts always show four decimals so columns line up. */
export const shares = (n: number) => n.toFixed(4);

/** "57.9%" */
export const pct1 = (n: number) => `${n.toFixed(1)}%`;

/** Targets: no decimals unless typed. */
export const pctTarget = (n: number) => `${+n.toFixed(2)}%`;

/** Drift in words, the same everywhere: "7.9 pts over", "16 pts under", "on target" (to a tenth). */
export function driftWords(n: number, withTarget = false): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return 'on target';
  const size = Math.abs(r);
  return `${+size.toFixed(1)} ${size === 1 ? 'pt' : 'pts'} ${r > 0 ? 'over' : 'under'}${withTarget ? ' target' : ''}`;
}

/** "+7.9" / "−7.8" / "0.0" */
export function drift(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0.0';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}`;
}

/** Formats an amount field after typing ("2500" → "2,500"; keeps cents if typed). */
export function formatAmountInput(value: number): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * When a price is from, in market time:
 * "As of 2:41 PM ET" for today, otherwise "Last close Fri Nov 20".
 */
export function priceTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const tz = 'America/New_York';
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (day(at) === day(now)) {
    const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(at);
    return `As of ${time} ET`;
  }
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(at);
  return `Last close ${date.replace(',', '')}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** When a typed price was entered: "Nov 22", plus "(9 days old)" after a week. */
export function priceDate(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const days = Math.floor((now - at.getTime()) / DAY);
  return days >= 7 ? `${date} (${days} days old)` : date;
}

/** On touch screens Enter ("Done") puts the keyboard away; with a real keyboard it does nothing. */
export const closesKeyboard = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** "VTI", "VTI and BND", "VTI, BND and VXUS" */
export const listText = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
