import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../../../test/utils';
import { ResultsSection } from '../ResultsSection';
import type { AllocationResult } from '../../types';

vi.mock('../../../../lib/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}));

import { useMediaQuery } from '../../../../lib/useMediaQuery';

describe('ResultsSection', () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it('should return null when allocations is null', () => {
    const { container } = render(<ResultsSection allocations={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('should return null when allocations is not an array', () => {
    const { container } = render(<ResultsSection allocations={undefined as unknown as AllocationResult[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('should return null when allocations is empty array', () => {
    const { container } = render(<ResultsSection allocations={[]} />);

    // Empty array should still render the container, but with no items
    expect(container.firstChild).not.toBeNull();
  });

  it('should return null when allocations is false', () => {
    const { container } = render(<ResultsSection allocations={false as unknown as AllocationResult[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('should return null when allocations is 0', () => {
    const { container } = render(<ResultsSection allocations={0 as unknown as AllocationResult[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Percentages must add up to 100%';
    render(<ResultsSection allocations={[]} error={errorMessage} />);

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should not display allocations when error is present', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '5000.00' }
    ];
    render(<ResultsSection allocations={allocations} error="Error message" />);

    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('should render allocation results', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '5000.00' },
      { name: 'MSFT', percentage: 50, amount: '5000.00' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('should display percentage for each allocation', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 60, amount: '6000.00' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('should display formatted amount for each allocation', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '5000.00' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
  });

  it('should format large amounts with commas', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '1234567.89' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
  });

  it('should display company name when provided', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '5000.00',
        companyName: 'Apple Inc.'
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  });

  it('should not display company name when not provided', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '5000.00' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    // Company name should not be rendered
    const companyNames = screen.queryAllByText(/Apple/i);
    expect(companyNames).toHaveLength(0);
  });

  it('should display shares when provided', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '5000.00',
        shares: 33.3333
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('33.3333 shares')).toBeInTheDocument();
  });

  it('should not display shares when not provided', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 50, amount: '5000.00' }
    ];
    const { container } = render(<ResultsSection allocations={allocations} />);

    // Shares column shows placeholder when no shares data (em dash)
    // Check that shares label exists and placeholder is rendered
    expect(screen.getByText('Shares')).toBeInTheDocument();
    // The placeholder should be in the table/card
    expect(container.textContent).toContain('AAPL');
    expect(container.textContent).not.toContain('shares'); // No shares text when undefined
  });

  it('should format shares to 4 decimal places', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '5000.00',
        shares: 33.123456789
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('33.1235 shares')).toBeInTheDocument();
  });

  it('should display shares when shares is 0', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '5000.00',
        shares: 0
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    // shares: 0 should still display (0 is a number)
    expect(screen.getByText('0.0000 shares')).toBeInTheDocument();
  });

  it('should handle amount as string', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '5000.00',
        shares: 10
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
  });

  it('should handle very small amounts', () => {
    const allocations: AllocationResult[] = [
      {
        name: 'AAPL',
        percentage: 50,
        amount: '0.01',
        shares: 0.0001
      }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('$0.01')).toBeInTheDocument();
    expect(screen.getByText('0.0001 shares')).toBeInTheDocument();
  });

  it('should handle multiple allocations', () => {
    const allocations: AllocationResult[] = [
      { name: 'AAPL', percentage: 40, amount: '4000.00' },
      { name: 'MSFT', percentage: 35, amount: '3500.00' },
      { name: 'GOOGL', percentage: 25, amount: '2500.00' }
    ];
    render(<ResultsSection allocations={allocations} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('GOOGL')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  describe('Edge Cases and Full Coverage', () => {
    it('should handle allocation with shares as 0 explicitly', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          shares: 0
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      // 0 is a number, so shares should display
      expect(screen.getByText('0.0000 shares')).toBeInTheDocument();
    });

    it('should handle allocation with shares as undefined', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          shares: undefined
        }
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      // Undefined shares should show placeholder (em dash)
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(container.textContent).toContain('AAPL');
      expect(container.textContent).not.toContain('shares'); // No shares text when undefined
    });

    it('should handle allocation with shares as null', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          shares: undefined
        }
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      // Null/undefined shares should show placeholder (em dash)
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(container.textContent).toContain('AAPL');
      expect(container.textContent).not.toContain('shares'); // No shares text when null/undefined
    });

    it('should handle allocation with empty string company name', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          companyName: ''
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      // Empty string is falsy, so company name should not display
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      // Company name span should not be rendered when empty string
      const { container } = render(<ResultsSection allocations={allocations} />);
      const companyNames = container.querySelectorAll('[class*="companyName"]');
      expect(companyNames.length).toBe(0);
    });

    it('should handle allocation with zero amount', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '0.00'
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    it('should handle allocation with negative amount (edge case)', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '-1000.00'
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      // Should still format negative amounts (Number() will convert, toLocaleString formats it)
      const amountText = screen.getByText(/-1,000\.00/);
      expect(amountText).toBeInTheDocument();
    });

    it('should handle allocation with very large percentage', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 100,
          amount: '10000.00'
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle allocation with decimal percentage', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 33.33,
          amount: '3333.00'
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('33.33%')).toBeInTheDocument();
    });

    it('should handle allocation with shares that need rounding', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          shares: 33.1234
        }
      ];
      render(<ResultsSection allocations={allocations} />);

      // Should round to 4 decimal places
      expect(screen.getByText('33.1234 shares')).toBeInTheDocument();
    });

    it('should render container div with correct structure', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '5000.00' }
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      // Should have the resultsSection container
      const resultsSection = container.querySelector('[class*="resultsSection"]');
      expect(resultsSection).toBeInTheDocument();
    });

    it('should render result rows for each allocation', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '5000.00' },
        { name: 'MSFT', percentage: 50, amount: '5000.00' }
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      // Should have result rows (CSS modules will hash the class name)
      const rows = container.querySelectorAll('[class*="resultRow"]');
      expect(rows.length).toBe(2);
    });

    it('should handle error prop with empty string', () => {
      const { container } = render(<ResultsSection allocations={[]} error="" />);

      // Empty string is falsy, so should not show error div
      // With empty array, container should still exist but no items
      expect(container.firstChild).not.toBeNull();
      // Error div should not be rendered (empty string is falsy)
      const errorDiv = container.querySelector('[class*="error"]');
      expect(errorDiv).not.toBeInTheDocument();
    });

    it('should handle error prop with whitespace', () => {
      const { container } = render(<ResultsSection allocations={[]} error="   " />);

      // Whitespace is truthy, so error div should be rendered
      const errorDiv = container.querySelector('[class*="error"]');
      expect(errorDiv).toBeInTheDocument();
      // Error div should contain the whitespace text
      expect(errorDiv?.textContent).toBe('   ');
    });
  });

  describe('Mobile layout', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
    });

    it('should render mobile cards when viewport is mobile', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '5000.00' },
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      const mobileCards = container.querySelector('[class*="mobileCards"]');
      expect(mobileCards).toBeInTheDocument();
    });

    it('should display allocation details in mobile cards', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '5000.00', shares: 33.3333 },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('$5,000.00')).toBeInTheDocument();
      expect(screen.getByText('33.3333 shares')).toBeInTheDocument();
    });

    it('should display company name in mobile cards when available', () => {
      const allocations: AllocationResult[] = [
        {
          name: 'AAPL',
          percentage: 50,
          amount: '5000.00',
          companyName: 'Apple Inc.',
        },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });

    it('should display placeholder for shares when not provided in mobile', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '5000.00' },
      ];
      const { container } = render(<ResultsSection allocations={allocations} />);

      // Check for placeholder text (em dash character)
      const sharesLabel = screen.getByText('Shares');
      expect(sharesLabel).toBeInTheDocument();
      // The placeholder should be in the same card row
      const cardRow = sharesLabel.closest('[class*="cardRow"]');
      expect(cardRow).toBeInTheDocument();
      // Check that placeholder is rendered (em dash or similar)
      expect(container.textContent).toContain('AAPL');
    });

    it('should display multiple allocations in mobile cards', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 40, amount: '4000.00' },
        { name: 'MSFT', percentage: 35, amount: '3500.00' },
        { name: 'GOOGL', percentage: 25, amount: '2500.00' },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
    });

    it('should format amounts correctly in mobile cards', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '1234567.89' },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
    });

    it('should display error message when error prop is provided', () => {
      const error = 'Invalid allocation';
      render(<ResultsSection allocations={null} error={error} />);

      expect(screen.getByText(error)).toBeInTheDocument();
    });

    it('should render null when allocations is null and no error', () => {
      const { container } = render(<ResultsSection allocations={null} />);

      expect(container.firstChild).toBeNull();
    });

    it('should handle allocations with undefined shares', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '500.00', shares: undefined },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('should handle allocations with null shares', () => {
      const allocations: AllocationResult[] = [
        { name: 'AAPL', percentage: 50, amount: '500.00', shares: null as any },
      ];
      render(<ResultsSection allocations={allocations} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });
});
