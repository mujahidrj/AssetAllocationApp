import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RebalanceResultsSection } from '../RebalanceResultsSection';
import type { RebalanceResult } from '../../types';

const createResult = (overrides: Partial<RebalanceResult>): RebalanceResult => ({
  name: 'TEST',
  percentage: 50,
  amount: '1000',
  shares: 10,
  companyName: 'Test Company',
  currentValue: 0,
  currentPercentage: 0,
  targetValue: 1000,
  difference: 1000,
  action: 'buy',
  sharesToTrade: 10,
  currentPrice: 100,
  ...overrides,
});

describe('RebalanceResultsSection', () => {
  it('should return null when no results and no error', () => {
    const { container } = render(<RebalanceResultsSection results={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('should return null when results is empty array', () => {
    const { container } = render(<RebalanceResultsSection results={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should return null when only hold results', () => {
    const results: RebalanceResult[] = [
      createResult({ name: 'AAPL', action: 'hold', difference: 0 }),
    ];
    const { container } = render(<RebalanceResultsSection results={results} />);
    expect(container.firstChild).toBeNull();
  });

  it('should return null when results have negligible difference', () => {
    const results: RebalanceResult[] = [
      createResult({ name: 'AAPL', action: 'buy', difference: 0.001 }),
    ];
    const { container } = render(<RebalanceResultsSection results={results} />);
    expect(container.firstChild).toBeNull();
  });

  it('should display error when error prop is provided', () => {
    render(<RebalanceResultsSection results={[]} error="Percentages must add up to 100%" />);
    expect(screen.getByText('Percentages must add up to 100%')).toBeInTheDocument();
  });

  it('should display rebalancing recommendations with buy and sell results', () => {
    const results: RebalanceResult[] = [
      createResult({ name: 'AAPL', action: 'buy', difference: 500 }),
      createResult({ name: 'MSFT', action: 'sell', difference: -200 }),
    ];
    render(<RebalanceResultsSection results={results} />);

    expect(screen.getByText('Rebalancing Recommendations')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('should display sells before buys in the results', () => {
    const results: RebalanceResult[] = [
      createResult({ name: 'BUY_FIRST', action: 'buy', difference: 100 }),
      createResult({ name: 'SELL_FIRST', action: 'sell', difference: -50 }),
    ];
    render(<RebalanceResultsSection results={results} />);

    const rows = screen.getAllByRole('row');
    // First data row (after header) should be SELL
    const firstDataRow = rows[1];
    expect(firstDataRow).toHaveTextContent('SELL_FIRST');
    expect(firstDataRow).toHaveTextContent('SELL');

    // Second data row should be BUY
    const secondDataRow = rows[2];
    expect(secondDataRow).toHaveTextContent('BUY_FIRST');
    expect(secondDataRow).toHaveTextContent('BUY');
  });

  it('should display multiple sells before multiple buys', () => {
    const results: RebalanceResult[] = [
      createResult({ name: 'BUY_A', action: 'buy', difference: 100 }),
      createResult({ name: 'SELL_A', action: 'sell', difference: -50 }),
      createResult({ name: 'BUY_B', action: 'buy', difference: 200 }),
      createResult({ name: 'SELL_B', action: 'sell', difference: -25 }),
    ];
    render(<RebalanceResultsSection results={results} />);

    const sellElements = screen.getAllByText('SELL');
    const buyElements = screen.getAllByText('BUY');
    expect(sellElements).toHaveLength(2);
    expect(buyElements).toHaveLength(2);

    // Get all symbols in order
    const symbols = ['SELL_A', 'SELL_B', 'BUY_A', 'BUY_B'];
    symbols.forEach((symbol) => {
      expect(screen.getByText(symbol)).toBeInTheDocument();
    });

    // Verify order: first two rows should be sells
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('SELL');
    expect(rows[2]).toHaveTextContent('SELL');
    expect(rows[3]).toHaveTextContent('BUY');
    expect(rows[4]).toHaveTextContent('BUY');
  });

  it('should display formatted amounts and shares', () => {
    const results: RebalanceResult[] = [
      createResult({
        name: 'AAPL',
        action: 'buy',
        difference: 1234.56,
        sharesToTrade: 8.1234,
        currentPrice: 150,
      }),
    ];
    render(<RebalanceResultsSection results={results} />);

    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    expect(screen.getByText('8.1234')).toBeInTheDocument();
    expect(screen.getByText('+$1,234.56')).toBeInTheDocument();
  });

  it('should display company name when available', () => {
    const results: RebalanceResult[] = [
      createResult({
        name: 'AAPL',
        companyName: 'Apple Inc.',
        action: 'buy',
        difference: 100,
      }),
    ];
    render(<RebalanceResultsSection results={results} />);

    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });
});
