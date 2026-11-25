import { describe, it, expect } from 'vitest';
import { colorsBySymbol, FUND_COLORS } from '../colors';

describe('fund colours', () => {
  it('gives each fund its own colour, up to ten', () => {
    const symbols = ['VTI', 'VXUS', 'BND', 'SPUS', 'SPTE', 'SPWO', 'SPSK', 'SPRE', 'CASH', 'FXAIX'];
    const colors = Object.values(colorsBySymbol(symbols));
    expect(new Set(colors).size).toBe(FUND_COLORS);
    colors.forEach(c => expect(c).toMatch(/^var\(--fund-([1-9]|10)\)$/));
  });

  it('keeps a fund’s colour whatever order or view it appears in', () => {
    const a = colorsBySymbol(['VTI', 'VXUS', 'BND']);
    const b = colorsBySymbol(['BND', 'VTI', 'VXUS']);
    expect(a).toEqual(b);
    // A fund that doesn't clash keeps its colour when others come along
    const solo = colorsBySymbol(['VTI']).VTI;
    expect(colorsBySymbol(['VTI', 'ZZZZ']).VTI === solo || colorsBySymbol(['VTI', 'ZZZZ']).ZZZZ !== solo).toBe(true);
  });
});
