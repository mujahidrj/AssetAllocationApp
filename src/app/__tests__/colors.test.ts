import { describe, it, expect } from 'vitest';
import { assignFundColors, colorVar, FUND_COLORS } from '../colors';

describe('fund colours', () => {
  it('gives a small portfolio the first colours, in order', () => {
    expect(assignFundColors([['VTI', 'VXUS', 'BND']])).toEqual({ VTI: 0, VXUS: 1, BND: 2 });
    expect(colorVar(0)).toBe('var(--fund-1)');
  });

  it('never repeats a colour within a portfolio of up to ten funds', () => {
    const symbols = ['VTI', 'VXUS', 'BND', 'SPUS', 'SPTE', 'SPWO', 'SPSK', 'SPRE', 'CASH', 'FXAIX'];
    const slots = assignFundColors([symbols]);
    expect(new Set(symbols.map(s => slots[s])).size).toBe(FUND_COLORS);
    // A fund new to a portfolio avoids the colours of the funds already in it
    const more = assignFundColors([['VTI', 'VXUS'], ['SPUS', 'VXUS', 'AGG']]);
    expect(more.SPUS).not.toBe(more.VXUS);
    expect(more.AGG).not.toBe(more.VXUS);
    expect(more.AGG).not.toBe(more.SPUS);
    // And from every other fund too, while there are colours to spare
    expect(new Set(Object.values(more)).size).toBe(4);
  });

  it('keeps every fund’s colour as funds come and go, here or in other portfolios', () => {
    const before = assignFundColors([['VTI', 'VXUS', 'BND'], ['SPUS', 'SPTE']]);
    // VTI removed, AGG added elsewhere, a new portfolio first
    const after = assignFundColors([['GLD', 'VXUS'], ['VXUS', 'BND', 'AGG'], ['SPUS', 'SPTE']], before);
    (['VXUS', 'BND', 'SPUS', 'SPTE'] as const).forEach(s => expect(after[s]).toBe(before[s]));
    expect(after.AGG).not.toBe(after.VXUS);
    expect(after.AGG).not.toBe(after.BND);
  });

  it('changes nothing when every fund has a colour', () => {
    const slots = { VTI: 3, BND: 0 };
    expect(assignFundColors([['VTI', 'BND']], slots)).toBe(slots);
  });
});
