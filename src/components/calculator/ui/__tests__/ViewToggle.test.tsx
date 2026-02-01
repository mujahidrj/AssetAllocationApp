import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../../../test/utils';
import userEvent from '@testing-library/user-event';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('should render both toggle buttons', () => {
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="deposit" onModeChange={handleModeChange} />);

    expect(screen.getByText('Deposit/Withdrawal')).toBeInTheDocument();
    expect(screen.getByText('Rebalance Portfolio')).toBeInTheDocument();
  });

  it('should highlight deposit button when deposit mode is active', () => {
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="deposit" onModeChange={handleModeChange} />);

    const depositButton = screen.getByText('Deposit/Withdrawal');
    const rebalanceButton = screen.getByText('Rebalance Portfolio');

    // CSS modules add hash, so check if class contains 'active'
    expect(depositButton.className).toContain('active');
    expect(rebalanceButton.className).not.toContain('active');
  });

  it('should highlight rebalance button when rebalance mode is active', () => {
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="rebalance" onModeChange={handleModeChange} />);

    const depositButton = screen.getByText('Deposit/Withdrawal');
    const rebalanceButton = screen.getByText('Rebalance Portfolio');

    // CSS modules add hash, so check if class contains 'active'
    expect(rebalanceButton.className).toContain('active');
    expect(depositButton.className).not.toContain('active');
  });

  it('should call onModeChange with deposit when deposit button is clicked', async () => {
    const user = userEvent.setup();
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="rebalance" onModeChange={handleModeChange} />);

    const depositButton = screen.getByText('Deposit/Withdrawal');
    await user.click(depositButton);

    expect(handleModeChange).toHaveBeenCalledWith('deposit');
    expect(handleModeChange).toHaveBeenCalledTimes(1);
  });

  it('should call onModeChange with rebalance when rebalance button is clicked', async () => {
    const user = userEvent.setup();
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="deposit" onModeChange={handleModeChange} />);

    const rebalanceButton = screen.getByText('Rebalance Portfolio');
    await user.click(rebalanceButton);

    expect(handleModeChange).toHaveBeenCalledWith('rebalance');
    expect(handleModeChange).toHaveBeenCalledTimes(1);
  });

  it('should call onModeChange even when clicking the already active button', async () => {
    const user = userEvent.setup();
    const handleModeChange = vi.fn();
    render(<ViewToggle mode="deposit" onModeChange={handleModeChange} />);

    const depositButton = screen.getByText('Deposit/Withdrawal');
    await user.click(depositButton);

    expect(handleModeChange).toHaveBeenCalledWith('deposit');
  });
});
