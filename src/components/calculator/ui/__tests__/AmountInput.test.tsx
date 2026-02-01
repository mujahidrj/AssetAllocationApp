import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../../../test/utils';
import userEvent from '@testing-library/user-event';
import { AmountInput } from '../AmountInput';

describe('AmountInput', () => {
  it('should render the input field', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    
    const input = screen.getByPlaceholderText(/enter amount/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('should display the value', () => {
    render(<AmountInput value="1000" onChange={() => {}} />);
    
    const input = screen.getByPlaceholderText(/enter amount/i);
    expect(input).toHaveValue('1000');
  });

  it('should call onChange when value changes', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(<AmountInput value="" onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText(/enter amount/i);
    await user.type(input, '500');
    
    expect(handleChange).toHaveBeenCalled();
  });

  it('should display error message when error prop is provided', () => {
    const errorMessage = 'Please enter a valid positive number';
    render(<AmountInput value="" onChange={() => {}} error={errorMessage} />);
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should not display error message when error prop is not provided', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    
    const errorElements = screen.queryAllByRole('alert');
    expect(errorElements).toHaveLength(0);
  });

  it('should have correct input type', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    
    const input = screen.getByPlaceholderText(/enter amount/i);
    expect(input).toHaveAttribute('type', 'text');
  });

  it('should display dollar sign', () => {
    render(<AmountInput value="" onChange={() => {}} />);
    
    expect(screen.getByText('$')).toBeInTheDocument();
  });
});
