import { describe, it, expect } from 'vitest';
import { describeMix, matchingTemplate, templates } from '../templates';

describe('templates', () => {
  it('groups the Sharia mixes and shortens names', () => {
    expect(templates.filter(t => t.group === 'sharia').map(t => t.label)).toEqual([
      'Aggressive', 'Growth', 'Moderate', 'Income', 'Conservative', 'Sukuk',
    ]);
    expect(templates.filter(t => t.group === 'index').map(t => t.label)).toEqual([
      'Fidelity 2-Fund', 'Vanguard 3-Fund', 'Schwab 3-Fund',
    ]);
  });

  it('describes a mix, leaving out 0% funds', () => {
    expect(describeMix([{ symbol: 'VTI', target: 60 }, { symbol: 'VXUS', target: 40 }, { symbol: 'X', target: 0 }])).toBe('VTI 60 · VXUS 40');
  });

  it('recognises a template regardless of order or 0% extras', () => {
    const vanguard = templates.find(t => t.label === 'Vanguard 3-Fund')!;
    expect(matchingTemplate([...vanguard.funds].reverse().concat({ symbol: 'OLD', target: 0 }))?.id).toBe(vanguard.id);
    expect(matchingTemplate([{ symbol: 'VTI', target: 100 }])).toBeUndefined();
  });
});
