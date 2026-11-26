import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';
import { Header } from '../Header';
import type { SaveState } from '../usePortfolios';

const mujahid = { displayName: 'Mujahid Rahman', email: 'mujahid@example.com', photoURL: null } as unknown as User;

function renderHeader(over: Partial<Parameters<typeof Header>[0]> = {}) {
  const props = {
    user: null as User | null,
    savedTo: 'device' as const,
    saveState: 'saved' as SaveState,
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onRetry: vi.fn(),
    themePref: 'device' as const,
    onThemePref: vi.fn(),
    ...over,
  };
  render(<Header {...props} />);
  return props;
}

describe('Header', () => {
  it('says work is saved on this device and explains signing in', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    expect(screen.getByRole('status')).toHaveTextContent('Saved on this device');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const panel = screen.getByRole('dialog', { name: 'Sign in' });
    expect(within(panel).getByText('Your portfolios are on this device')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Dark' }));
    expect(props.onThemePref).toHaveBeenCalledWith('dark');

    await user.click(within(panel).getByRole('button', { name: 'Sign in with Google' }));
    expect(props.onSignIn).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps sign-out in the account panel, with what it does to this device', async () => {
    const user = userEvent.setup();
    const props = renderHeader({ user: mujahid, savedTo: 'account', themePref: 'light' });
    expect(screen.getByRole('status')).toHaveTextContent('Synced');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const avatar = screen.getByRole('button', { name: 'Mujahid: account, appearance and sign out' });
    expect(avatar).toHaveTextContent('M');
    await user.click(avatar);
    const panel = screen.getByRole('dialog', { name: 'Account' });
    expect(within(panel).getByText('Mujahid Rahman')).toBeInTheDocument();
    expect(within(panel).getByText('mujahid@example.com')).toBeInTheDocument();
    expect(within(panel).getByText('Your portfolios sync across your devices')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(panel).getByRole('button', { name: /sign out.*before you signed in/i }));
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it('closes with Back on phones, where the panel is a sheet', async () => {
    const user = userEvent.setup();
    renderHeader({ user: mujahid, savedTo: 'account' });
    await user.click(screen.getByRole('button', { name: /^Mujahid:/ }));
    expect(window.history.state).toMatchObject({ aaSheet: 'account', level: 1 });
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.history.state).toBeNull();
  });

  it('closes with Escape and puts focus back on the avatar', async () => {
    const user = userEvent.setup();
    renderHeader({ user: mujahid, savedTo: 'account' });
    const avatar = screen.getByRole('button', { name: /^Mujahid:/ });
    await user.click(avatar);
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(avatar).toHaveFocus();
  });

  it('stays open for clicks inside, and closes for a click outside', async () => {
    const user = userEvent.setup();
    renderHeader({ user: mujahid, savedTo: 'account' });
    await user.click(screen.getByRole('button', { name: /^Mujahid:/ }));
    const panel = screen.getByRole('dialog', { name: 'Account' });
    await user.click(within(panel).getByText('Mujahid Rahman'));
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('flags a failed save, on the avatar too, with a way to try again', async () => {
    const user = userEvent.setup();
    const props = renderHeader({ user: mujahid, savedTo: 'account', saveState: 'error' });
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save");

    await user.click(screen.getByRole('button', { name: "Mujahid: account, appearance and sign out. Couldn't save" }));
    const panel = screen.getByRole('dialog', { name: 'Account' });
    expect(within(panel).getByText("Couldn't save your changes.")).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('shows saving while it saves', () => {
    renderHeader({ user: mujahid, savedTo: 'account', saveState: 'saving' });
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
  });
});
