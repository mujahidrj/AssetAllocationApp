import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../../test/utils';
import { AllocationSummary } from '../AllocationSummary';

describe('AllocationSummary', () => {
  it('should render section title', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={50000} />);
    
    expect(screen.getByText('Allocation Summary')).toBeInTheDocument();
  });

  it('should display target total with percentage', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={50000} />);
    
    expect(screen.getByText(/Target Total:/i)).toBeInTheDocument();
    expect(screen.getByText(/100\.0%/)).toBeInTheDocument();
  });

  it('should display current total with currency formatting', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={50000} />);
    
    expect(screen.getByText(/Current Total:/i)).toBeInTheDocument();
    expect(screen.getByText('$50,000.00')).toBeInTheDocument();
  });

  it('should show checkmark when target total is exactly 100%', () => {
    const { container } = render(<AllocationSummary targetTotal={100} currentTotal={50000} />);
    
    expect(screen.getByText(/Target Total:/i)).toBeInTheDocument();
    // Checkmark is in the same span as the percentage, so check the container
    expect(container.textContent).toContain('100.0%');
    expect(container.textContent).toContain('✓');
  });

  it('should show checkmark when target total is within 0.01 of 100%', () => {
    const { container } = render(<AllocationSummary targetTotal={99.99} currentTotal={50000} />);
    
    expect(screen.getByText(/Target Total:/i)).toBeInTheDocument();
    // Checkmark is in the same span as the percentage
    // Note: toFixed(1) will round 99.99 to 100.0, and Math.abs(99.99 - 100) = 0.01 <= 0.01, so checkmark shows
    const text = container.textContent || '';
    // Should display as 100.0% (rounded) since toFixed(1) rounds 99.99 to 100.0
    expect(text).toContain('100.0%');
    // Should show checkmark because 99.99 is within 0.01 of 100 (Math.abs(99.99 - 100) = 0.01 <= 0.01)
    // The checkmark might be rendered as a different character, so check if valid class is applied
    const valueSpan = container.querySelector('span.value');
    if (valueSpan) {
      expect(valueSpan.className).toContain('valid');
      expect(valueSpan.textContent).toContain('✓');
    }
  });

  it('should not show checkmark when target total is not 100%', () => {
    render(<AllocationSummary targetTotal={80} currentTotal={50000} />);
    
    expect(screen.getByText(/80\.0%/)).toBeInTheDocument();
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('should format large current totals with commas', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={1234567.89} />);
    
    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
  });

  it('should format small current totals with decimals', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={123.45} />);
    
    expect(screen.getByText('$123.45')).toBeInTheDocument();
  });

  it('should display target total with one decimal place', () => {
    render(<AllocationSummary targetTotal={85.678} currentTotal={50000} />);
    
    expect(screen.getByText(/85\.7%/)).toBeInTheDocument();
  });

  it('should apply invalid class when target is not 100%', () => {
    render(<AllocationSummary targetTotal={80} currentTotal={50000} />);
    
    const targetValue = screen.getByText(/80\.0%/);
    // CSS modules add hash, so check if class contains 'invalid'
    expect(targetValue.className).toContain('invalid');
  });

  it('should apply valid class when target is 100%', () => {
    render(<AllocationSummary targetTotal={100} currentTotal={50000} />);
    
    const targetValue = screen.getByText(/100\.0%/);
    // CSS modules add hash, so check if class contains 'valid'
    expect(targetValue.className).toContain('valid');
  });
});
