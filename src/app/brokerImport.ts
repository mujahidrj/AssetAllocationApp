/**
 * Reads a broker's "positions" download (Fidelity, Schwab, Vanguard, or any CSV
 * with a Symbol column and a Quantity/Shares or Value column) into holdings.
 *
 * Columns are found by their header names, not their positions, because brokers
 * add, drop and reorder columns from time to time. One file can hold several
 * accounts: Fidelity and Vanguard repeat the account in a column; Schwab starts
 * each account with a title line above its header row.
 */
import { isCashSymbol, type Holding } from './model';

export type Broker = 'Fidelity' | 'Schwab' | 'Vanguard';

export interface ImportedPosition {
  symbol: string;
  description?: string;
  /** Share count, when the file has one and it agrees with the value. */
  shares: number | null;
  /** Price per share from the file, when it has one. */
  price: number | null;
  /** Dollar value from the file, when it has one. */
  value: number | null;
  /** Cash, a money market or sweep fund, or pending activity. */
  cash: boolean;
}

export interface ImportedAccount {
  name: string;
  positions: ImportedPosition[];
  /** Sum of the values the file gives (cash included). */
  total: number;
}

export interface ImportResult {
  broker: Broker | null;
  accounts: ImportedAccount[];
  /** Whether any positions header was found (false: not a positions file at all). */
  recognized: boolean;
}

/* ---------- CSV ---------- */

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLines = src.split(/\r?\n/).slice(0, 15).join('\n');
  const delimiter = !firstLines.includes(',') && firstLines.includes('\t') ? '\t' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

/** "$1,234.56" → 1234.56, "(12.50)" → −12.5, "--" / "n/a" / "" → null. */
export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s || /^(--|-|n\/?a|na|none)$/i.test(s)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '').replace(/^\+/, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/* ---------- Columns ---------- */

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, ' ').trim();

interface Columns {
  symbol: number;
  shares: number;
  price: number;
  value: number;
  description: number;
  accountName: number;
  accountNumber: number;
}

const findColumn = (cells: string[], test: (h: string) => boolean) => cells.findIndex(c => test(norm(c)));
const isChange = (h: string) => /change|chng|chg|gain|%|percent|cost/.test(h);

function readHeader(cells: string[]): Columns | null {
  const symbol = findColumn(cells, h => h === 'symbol' || h === 'ticker' || h === 'symbol/cusip' || h.startsWith('symbol ('));
  if (symbol === -1) return null;
  const shares = findColumn(cells, h => /^(quantity|qty|shares|units|share quantity)\b/.test(h) && !isChange(h));
  const price = findColumn(cells, h => /^(last price|price|share price|current price|market price|most recent price|last)\b/.test(h) && !isChange(h));
  const value = findColumn(cells, h => /^(current value|market value|mkt val|total value|value|position value|most recent value|marketvalue)\b/.test(h) && !isChange(h));
  if (shares === -1 && value === -1) return null;
  return {
    symbol,
    shares,
    price,
    value,
    description: findColumn(cells, h => /^(description|investment name|name|security description|security name|fund name)\b/.test(h)),
    accountName: findColumn(cells, h => h === 'account name' || h === 'account' || h === 'account nickname'),
    accountNumber: findColumn(cells, h => h === 'account number' || h === 'account no' || h === 'account #'),
  };
}

/* ---------- Rows ---------- */

/** Money market, sweep and settlement funds that brokers use as the cash position. */
const CASH_FUNDS = new Set([
  'SPAXX', 'FDRXX', 'FZFXX', 'SPRXX', 'FZDXX', 'FCASH', 'CORE', 'FDLXX', 'FTEXX',
  'VMFXX', 'VMMXX', 'VUSXX', 'VMRXX', 'VYFXX',
  'SWVXX', 'SNVXX', 'SNSXX', 'SNOXX', 'SWTXX', 'SNAXX',
]);

const isCashRow = (rawSymbol: string, symbol: string, description: string) =>
  rawSymbol.includes('**') ||
  /^(cash|cash & cash investments|cash and cash investments|pending activity|core position|money market)\b/i.test(rawSymbol) ||
  CASH_FUNDS.has(symbol) ||
  isCashSymbol(symbol) ||
  /money market|settlement fund|deposit sweep|cash reserves|bank sweep/i.test(description);

/** Lines that aren't positions: totals, disclaimers, options. */
const isSkippable = (rawSymbol: string) =>
  !rawSymbol ||
  /total/i.test(rawSymbol) ||
  /^-/.test(rawSymbol) ||
  rawSymbol.length > 24;

const cleanSymbol = (raw: string) => raw.replace(/\*+$/, '').trim().toUpperCase().replace('/', '.');

/** "Positions for account Roth IRA ...123 as of 03:45 PM ET, 11/22/2026" → "Roth IRA ...123" */
function accountTitle(line: string): string | null {
  const t = line.trim();
  if (!t || /^positions for all/i.test(t) || /^(brokerage services|the data|date downloaded|this|disclosure)/i.test(t)) return null;
  const m = t.match(/^positions for account\s+(.*?)(\s+as of\b.*)?$/i);
  if (m) return m[1].trim() || null;
  if (t.length > 60) return null; // a sentence, not a title
  return t;
}

const nonEmpty = (row: string[]) => row.filter(c => c !== '');

/* ---------- Main ---------- */

export function parseBrokerCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const accounts = new Map<string, ImportedAccount>();
  const order: string[] = [];
  let broker: Broker | null = null;
  let title: string | null = null;
  let cols: Columns | null = null;
  let recognized = false;

  const accountFor = (name: string) => {
    let a = accounts.get(name);
    if (!a) { a = { name, positions: [], total: 0 }; accounts.set(name, a); order.push(name); }
    return a;
  };

  for (const row of rows) {
    const cells = nonEmpty(row);
    if (cells.length === 0) { cols = null; continue; }

    const header = readHeader(row);
    if (header) {
      const names = row.map(norm);
      // Transaction history (Vanguard puts it under the positions): not holdings
      if (names.some(h => /\b(date|transaction|action)\b/.test(h))) { cols = null; continue; }
      cols = header;
      recognized = true;
      if (!broker) {
        if (names.includes('account name') && names.some(h => h.startsWith('current value') || h.startsWith('last price'))) broker = 'Fidelity';
        else if (names.includes('investment name') && names.includes('share price')) broker = 'Vanguard';
        else if (names.some(h => h.startsWith('mkt val') || h.startsWith('qty (') || h === 'security type')) broker = 'Schwab';
      }
      continue;
    }

    if (cells.length === 1 && (!cols || row.indexOf(cells[0]) !== cols.symbol)) {
      if (/^positions for/i.test(cells[0])) broker ??= 'Schwab';
      const t = accountTitle(cells[0]);
      if (t) { title = t; cols = null; }
      continue;
    }
    if (!cols) continue;

    const rawSymbol = row[cols.symbol] ?? '';
    if (isSkippable(rawSymbol)) continue;
    const symbol = cleanSymbol(rawSymbol);
    const description = cols.description >= 0 ? row[cols.description] ?? '' : '';
    let shares = cols.shares >= 0 ? parseNumber(row[cols.shares]) : null;
    let price = cols.price >= 0 ? parseNumber(row[cols.price]) : null;
    let value = cols.value >= 0 ? parseNumber(row[cols.value]) : null;
    const cash = isCashRow(rawSymbol, symbol, description);

    if (!cash) {
      if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) continue;
      if ((shares ?? 0) < 0 || (value ?? 0) < 0) continue; // short positions
      if (value == null && shares != null && price != null) value = shares * price;
      // A share count or price that doesn't match the value means mislabelled columns
      // (it has happened): trust the value alone
      const consistent = shares != null && price != null && value != null && value > 0 && Math.abs(shares * price - value) / value <= 0.05;
      if (value != null && value > 0 && price != null && !consistent) { shares = null; price = null; }
      if (!(shares != null && shares > 0) && !(value != null && value > 0)) continue;
    } else {
      if (value == null && shares != null) value = shares * (price ?? 1);
      if (value == null) continue;
      shares = null;
    }

    let name = title ?? 'Your account';
    if (cols.accountName >= 0 && row[cols.accountName]) {
      name = row[cols.accountName];
      const number = cols.accountNumber >= 0 ? row[cols.accountNumber] : '';
      if (number) name = `${name} …${number.slice(-4)}`;
    } else if (cols.accountNumber >= 0 && row[cols.accountNumber]) {
      name = `Account …${row[cols.accountNumber].slice(-4)}`;
    }

    const account = accountFor(name);
    const position: ImportedPosition = {
      symbol: cash ? 'CASH' : symbol,
      ...(description && description !== '--' ? { description } : {}),
      shares: shares != null && shares > 0 ? shares : null,
      price: !cash && price != null && price > 0 ? price : null,
      value,
      cash,
    };
    const same = account.positions.find(p => p.symbol === position.symbol);
    if (same) {
      same.value = (same.value ?? 0) + (position.value ?? 0);
      same.shares = same.shares != null && position.shares != null ? same.shares + position.shares : null;
      same.price ??= position.price;
    } else {
      account.positions.push(position);
    }
    account.total += value ?? 0;
  }

  // Cash can net out negative with pending activity; never import less than nothing
  const list = order.map(n => accounts.get(n)!).map(a => ({
    ...a,
    positions: a.positions.filter(p => !p.cash || (p.value ?? 0) > 0.005),
    total: Math.round(a.total * 100) / 100,
  })).filter(a => a.positions.length > 0);

  return { broker, accounts: list, recognized };
}

/**
 * Turns one imported account into holdings, keyed by the portfolio's own symbols.
 * Funds go in as share counts when the file has them (so values follow the price),
 * otherwise as dollars. Cash goes in as dollars under the portfolio's cash fund
 * (CASH unless it uses USD). Also returns the file's prices, to fill in for any fund
 * the price lookup can't price.
 */
export function holdingsFromAccount(
  account: ImportedAccount,
  options: { include: (symbol: string) => boolean; cashSymbol: string },
): { holdings: Record<string, Holding>; prices: Record<string, number> } {
  const holdings: Record<string, Holding> = {};
  const prices: Record<string, number> = {};
  account.positions.forEach(p => {
    const key = p.cash ? options.cashSymbol : p.symbol;
    if (!options.include(key)) return;
    if (!p.cash && p.shares != null && p.shares > 0) {
      holdings[key] = { kind: 'shares', amount: Math.round(p.shares * 10000) / 10000 };
      const price = p.price ?? (p.value != null ? p.value / p.shares : null);
      if (price && price > 0) prices[key] = Math.round(price * 10000) / 10000;
    } else if (p.value != null && p.value > 0) {
      const existing = holdings[key];
      const amount = Math.round(((existing?.kind === 'dollars' ? existing.amount : 0) + p.value) * 100) / 100;
      holdings[key] = { kind: 'dollars', amount };
    }
  });
  return { holdings, prices };
}
