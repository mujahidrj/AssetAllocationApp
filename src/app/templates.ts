import { samplePortfolios } from '../components/calculator/data/samplePortfolios';
import type { Fund } from './model';

export interface Template {
  id: string;
  /** Short label, e.g. "Aggressive" inside the Sharia group. */
  label: string;
  group: 'sharia' | 'index';
  funds: Fund[];
}

const SHARIA_PREFIX = 'Sharia Portfolio ';

export const templates: Template[] = samplePortfolios.map(p => {
  const sharia = p.name.startsWith(SHARIA_PREFIX);
  return {
    id: p.name,
    label: sharia ? p.name.slice(SHARIA_PREFIX.length) : p.name.replace(' Portfolio', ''),
    group: sharia ? 'sharia' : 'index',
    funds: p.stocks.map(s => ({ symbol: s.name, target: s.percentage, ...(s.companyName ? { name: s.companyName } : {}) })),
  };
});

/** "VTI 60 · VXUS 30 · BND 10" */
export const describeMix = (funds: Fund[]) =>
  funds.filter(f => f.target > 0).map(f => `${f.symbol} ${+f.target.toFixed(2)}`).join(' · ');

/** The template the current mix matches exactly, if any. */
export function matchingTemplate(funds: Fund[]): Template | undefined {
  const active = funds.filter(f => f.target > 0);
  return templates.find(t =>
    t.funds.length === active.length &&
    t.funds.every(tf => active.some(f => f.symbol === tf.symbol && Math.abs(f.target - tf.target) < 0.001))
  );
}
