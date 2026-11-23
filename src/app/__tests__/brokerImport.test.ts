import { describe, it, expect } from 'vitest';
import { holdingsFromAccount, parseBrokerCsv, parseCsv, parseNumber, sameSymbol } from '../brokerImport';
import fidelity from './fixtures/fidelity.csv?raw';
import fidelitySwapped from './fixtures/fidelity_swapped.csv?raw';
import schwab from './fixtures/schwab.csv?raw';
import schwabAll from './fixtures/schwab_all.csv?raw';
import vanguard from './fixtures/vanguard.csv?raw';

const summary = (text: string) =>
  parseBrokerCsv(text).accounts.map(a => ({
    name: a.name,
    total: a.total,
    positions: a.positions.map(p => [p.symbol, p.shares, p.price, p.value, p.cash]),
  }));

describe('parseCsv and parseNumber', () => {
  it('handles quotes, doubled quotes, commas inside quotes, CRLF and a BOM', () => {
    expect(parseCsv('\uFEFFa,"b, c","say ""hi"""\r\n1,2,3')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('reads tab-separated text too', () => {
    expect(parseCsv('Symbol\tValue\nSPUS\t10')).toEqual([['Symbol', 'Value'], ['SPUS', '10']]);
  });

  it('reads money the way brokers write it', () => {
    expect(parseNumber('$1,234.56')).toBe(1234.56);
    expect(parseNumber('+$0.12')).toBe(0.12);
    expect(parseNumber('-$12.00')).toBe(-12);
    expect(parseNumber('($12.50)')).toBe(-12.5);
    expect(parseNumber('--')).toBeNull();
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber('USD')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('parseBrokerCsv', () => {
  it('reads a Fidelity positions file with two accounts, money market as cash and pending activity netted in', () => {
    const result = parseBrokerCsv(fidelity);
    expect(result.broker).toBe('Fidelity');
    expect(result.recognized).toBe(true);
    expect(summary(fidelity)).toEqual([
      {
        name: 'ROTH IRA …3456',
        total: 12302.66,
        positions: [
          ['CASH', null, null, 400.55, true],
          ['SPUS', 210, 51.62, 10840.2, false],
          ['SPWO', 40.5, 26.22, 1061.91, false],
        ],
      },
      {
        // The option contract is left out
        name: 'Individual …5432',
        total: 2024.58,
        positions: [['FXAIX', 10.123, 190.12, 1924.58, false], ['CASH', null, null, 100, true]],
      },
    ]);
  });

  it('trusts the value when the share and price columns are mislabelled', () => {
    expect(summary(fidelitySwapped)[0].positions).toEqual([['SPUS', null, null, 10840.2, false]]);
  });

  it('reads a Schwab file, skipping the account total', () => {
    const result = parseBrokerCsv(schwab);
    expect(result.broker).toBe('Schwab');
    expect(summary(schwab)).toEqual([{
      name: 'Roth Contributory IRA ...123',
      total: 3736.05,
      positions: [['SCHB', 100, 26.12, 2612, false], ['SCHF', 35.5, 21.1, 749.05, false], ['CASH', null, null, 375, true]],
    }]);
  });

  it('splits a Schwab all-accounts file by the title above each table', () => {
    expect(summary(schwabAll).map(a => [a.name, a.positions.map(p => p[0])])).toEqual([
      ['Individual ...456', ['SCHZ', 'CASH']],
      ['Roth IRA ...789', ['SCHB']],
    ]);
  });

  it('reads Vanguard holdings and ignores the transaction history under them', () => {
    const result = parseBrokerCsv(vanguard);
    expect(result.broker).toBe('Vanguard');
    expect(summary(vanguard)).toEqual([{
      name: 'Account …5678',
      total: 8839.43,
      positions: [['CASH', null, null, 1000.5, true], ['VTI', 20, 340.02, 6800.4, false], ['VXUS', 15.25, 68.1, 1038.53, false]],
    }]);
  });

  it('reads a plain Symbol / Shares file', () => {
    const result = parseBrokerCsv('Symbol,Shares\nspus,10\nSPTE,5.5\n');
    expect(result.broker).toBeNull();
    expect(result.accounts[0].positions.map(p => [p.symbol, p.shares])).toEqual([['SPUS', 10], ['SPTE', 5.5]]);
  });

  it('says when a file has no positions table at all', () => {
    expect(parseBrokerCsv('hello,world\nfoo,bar')).toEqual({ broker: null, accounts: [], recognized: false });
  });
});

describe('holdingsFromAccount', () => {
  it('keeps share counts, puts cash under the portfolio’s cash fund, and returns the file’s prices', () => {
    const roth = parseBrokerCsv(fidelity).accounts[0];
    expect(holdingsFromAccount(roth, { include: s => s !== 'SPAXX', cashSymbol: 'CASH' })).toEqual({
      holdings: {
        CASH: { kind: 'dollars', amount: 400.55 },
        SPUS: { kind: 'shares', amount: 210 },
        SPWO: { kind: 'shares', amount: 40.5 },
      },
      prices: { SPUS: 51.62, SPWO: 26.22 },
    });
  });

  it('leaves out what isn’t included and uses dollars when there’s no share count', () => {
    const account = parseBrokerCsv(fidelitySwapped).accounts[0];
    expect(holdingsFromAccount(account, { include: s => s === 'SPUS', cashSymbol: 'USD' })).toEqual({
      holdings: { SPUS: { kind: 'dollars', amount: 10840.2 } },
      prices: {},
    });
  });
});

describe('holdingsFromAccount with money-market funds and share classes', () => {
  it('treats a money-market fund the portfolio targets as that fund, not cash', () => {
    const roth = parseBrokerCsv(fidelity).accounts[0];
    expect(holdingsFromAccount(roth, { include: () => true, cashSymbol: 'CASH' }).holdings).toEqual({
      SPAXX: { kind: 'dollars', amount: 412.55 },
      SPUS: { kind: 'shares', amount: 210 },
      SPWO: { kind: 'shares', amount: 40.5 },
    });
  });

  it('matches share classes however they are written', () => {
    const result = parseBrokerCsv('Symbol,Quantity,Price,Market Value\nBRK/B,2,$500.00,"$1,000.00"\n');
    expect(result.accounts[0].positions[0].symbol).toBe('BRK-B');
    expect(sameSymbol('BRK.B', 'BRK-B')).toBe(true);
    const { holdings } = holdingsFromAccount(result.accounts[0], {
      include: s => s === 'BRK.B',
      cashSymbol: 'CASH',
      symbolFor: s => (sameSymbol(s, 'BRK.B') ? 'BRK.B' : s),
    });
    expect(holdings).toEqual({ 'BRK.B': { kind: 'shares', amount: 2 } });
  });
});

describe('parseBrokerCsv with unusual layouts', () => {
  it('still reads positions when a column has "date" in its name', () => {
    const csv = 'Symbol,Quantity,Price,Market Value,Ex-Div Date\nVTI,2,$100.00,$200.00,12/20/2026\n';
    expect(parseBrokerCsv(csv).accounts[0].positions.map(p => p.symbol)).toEqual(['VTI']);
  });

  it('keeps accounts apart with the older Fidelity "Account Name/Number" column', () => {
    const csv = 'Account Name/Number,Symbol,Description,Quantity,Last Price,Current Value\n'
      + 'ROTH IRA 123,SPUS,X,210,$51.62,"$10,840.20"\nIndividual 456,SPUS,X,10,$51.62,$516.20\n';
    expect(parseBrokerCsv(csv).accounts.map(a => [a.name, a.positions[0].shares])).toEqual([['ROTH IRA 123', 210], ['Individual 456', 10]]);
  });

  it('skips a stray single-cell line inside a table instead of stopping there', () => {
    const csv = 'Symbol,Shares\nSPUS,10\n"Equities"\nSPTE,5\n';
    expect(parseBrokerCsv(csv).accounts[0].positions.map(p => p.symbol)).toEqual(['SPUS', 'SPTE']);
  });

  it('reads a tab-separated file even when descriptions contain commas', () => {
    const tsv = 'Symbol\tDescription\tShares\nSPUS\tSP FUNDS, S&P 500\t10\n';
    expect(parseBrokerCsv(tsv).accounts[0].positions.map(p => [p.symbol, p.shares])).toEqual([['SPUS', 10]]);
  });
});
