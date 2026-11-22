import { describe, it, expect } from 'vitest';
import { parseAmount } from '../parseAmount';

describe('parseAmount', () => {
  it.each([
    ['10000', 10000],
    ['10,000', 10000],
    ['$10,000', 10000],
    ['$ 10,000.50', 10000.5],
    ['  2,500  ', 2500],
    ['1,234,567.89', 1234567.89],
    ['2500.', 2500],
    ['.5', 0.5],
    ['0', 0],
  ])('reads %j as %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['$'],
    ['abc'],
    ['10,00'],
    ['1,0000'],
    ['10.000.5'],
    ['-1000'],
    ['10k'],
    ['1 000'],
  ])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNaN();
  });
});
