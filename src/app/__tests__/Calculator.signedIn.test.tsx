import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from 'firebase/auth';

vi.mock('../storage', async () => {
  const actual = await vi.importActual<typeof import('../storage')>('../storage');
  return { ...actual, loadCloudWorkspace: vi.fn(), saveCloudWorkspace: vi.fn(() => Promise.resolve()) };
});

// Signed in: the page works from the account's portfolios
vi.mock('../usePortfolios', async () => {
  const actual = await vi.importActual<typeof import('../usePortfolios')>('../usePortfolios');
  const user = { uid: 'u1' } as User;
  return { ...actual, usePortfolios: () => actual.usePortfolios(user) };
});

import { loadCloudWorkspace, saveCloudWorkspace } from '../storage';
import { emptyPortfolio, type Workspace } from '../model';
import { Calculator } from '../Calculator';

const cloud: Workspace = {
  portfolios: [{ ...emptyPortfolio('c1', 'Roth IRA'), funds: [{ symbol: 'VTI', target: 100 }] }],
  activeId: 'c1',
};

describe('Calculator, signed in', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {}); // load timings
    vi.mocked(loadCloudWorkspace).mockReset();
    vi.mocked(saveCloudWorkspace).mockClear();
  });

  it('shows a loading state, not the first-visit screen, until the portfolios arrive', async () => {
    let arrive: (ws: Workspace) => void = () => {};
    vi.mocked(loadCloudWorkspace).mockReturnValue(new Promise(resolve => { arrive = resolve; }));
    render(<Calculator />);

    expect(screen.getByRole('heading', { name: 'Loading your portfolios…' })).toBeInTheDocument();
    // Nothing to edit, so nothing typed now can be overwritten when they arrive
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /pick a starting point/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i, hidden: true })).not.toBeInTheDocument();

    await act(async () => { arrive(cloud); });
    expect(screen.queryByTestId('account-loading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
    expect(screen.getByLabelText('VTI target percent')).toHaveValue('100');
    expect(saveCloudWorkspace).not.toHaveBeenCalled();
  });

  it("says when they couldn't load, and tries again", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadCloudWorkspace).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(cloud);
    const user = userEvent.setup();
    render(<Calculator />);

    expect(await screen.findByRole('heading', { name: "Couldn't load your portfolios" })).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
    errors.mockRestore();
  });

  it("says when it's offline, and loads once the connection is back", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      vi.mocked(loadCloudWorkspace).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(cloud);
      render(<Calculator />);

      expect(screen.getByRole('heading', { name: "You're offline" })).toBeInTheDocument();
      // The header's status only reads "Couldn't load" once the attempt has failed
      expect(await screen.findByText("Couldn't load")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

      onLine.mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(await screen.findByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
      await waitFor(() => expect(loadCloudWorkspace).toHaveBeenCalledTimes(2));
    } finally {
      onLine.mockRestore();
      errors.mockRestore();
    }
  });
});
