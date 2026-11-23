import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calculator } from '../Calculator';
import { saveDeviceWorkspace, loadDeviceWorkspace } from '../storage';
import { emptyPortfolio, type Portfolio } from '../model';

const seed = (p: Partial<Portfolio>) => saveDeviceWorkspace({ portfolios: [{ ...emptyPortfolio('p1'), ...p }], activeId: 'p1' });

const renderApp = () => render(<Calculator />);

describe('Calculator', () => {
  it('starts by asking for a mix, then splits new money by target', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('heading', { name: /pick a mix to start/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /vanguard 3-fund/i }));

    expect(screen.getByRole('button', { name: 'my portfolio' })).toBeInTheDocument();
    expect(screen.getByText('Vanguard 3-Fund mix')).toBeInTheDocument();
    expect(screen.getByText(/type an amount above/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '10,000');

    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText('$6,000.00')).toBeInTheDocument();
    expect(within(trades).getByText('$3,000.00')).toBeInTheDocument();
    expect(within(trades).getByText('$1,000.00')).toBeInTheDocument();
    expect(within(trades).getByRole('heading', { name: 'Buy these 3' })).toBeInTheDocument();
    // Prices come from the mocked API ($100 for these funds)
    expect(await within(trades).findByText('60.0000 sh')).toBeInTheDocument();
    // The phone's pinned bar (hidden at desktop width)
    expect(screen.getByRole('button', { name: /copy 3 buys · \$10,000\.00/i, hidden: true })).toBeInTheDocument();
  });

  it('flags an amount it cannot read', async () => {
    const user = userEvent.setup();
    seed({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '10,00');
    expect(screen.getByText(/type an amount like 2,500/i)).toBeInTheDocument();
  });

  it('buys only what is behind target once holdings are entered', async () => {
    seed({
      funds: [{ symbol: 'SPUS', target: 50 }, { symbol: 'SPTE', target: 40 }, { symbol: 'SPWO', target: 10 }],
      holdings: {
        SPUS: { kind: 'dollars', amount: 12400 },
        SPTE: { kind: 'dollars', amount: 6900 },
        SPWO: { kind: 'dollars', amount: 2100 },
      },
      tracksHoldings: true,
    });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByLabelText('Selling')).toHaveValue('no');
    await user.type(screen.getByLabelText('Amount'), '2500');

    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText('$2,254.24')).toBeInTheDocument();
    expect(within(trades).getByText('$245.76')).toBeInTheDocument();
    expect(within(trades).getByText(/SPUS · already 57\.9%, target 50%/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Selling'), 'yes');
    expect(await within(trades).findByText('−$450.00')).toBeInTheDocument();
    expect(within(trades).getByRole('heading', { name: 'Your trades' })).toBeInTheDocument();
    expect(within(trades).getByText('Net in $2,500.00')).toBeInTheDocument();
  });

  it('offers quick fixes when targets do not add up', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }], holdings: {}, tracksHoldings: false });
    const user = userEvent.setup();
    renderApp();

    const vti = screen.getByLabelText('VTI target percent');
    await user.clear(vti);
    await user.type(vti, '50');
    expect(screen.getByRole('heading', { name: /targets need to add up to 100%/i })).toBeInTheDocument();
    expect(screen.getByText('Total 90% · 10% left')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Put 10% in VTI' }));
    expect(screen.getByText('Total 100%')).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0].funds.map(f => f.target)).toEqual([60, 40]);
  });

  it('adds and removes funds', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: '+ Add fund' }));
    await user.type(screen.getByLabelText(/add a fund/i), 'AAPL');
    await user.click(await screen.findByRole('button', { name: /AAPL Apple Inc\./ }));
    expect(screen.getByLabelText('AAPL target percent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove VTI' }));
    expect(screen.queryByLabelText('VTI target percent')).not.toBeInTheDocument();
  });

  it('switches between light and dark', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('assetAllocation.theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('offers a mix from a share link', async () => {
    window.history.replaceState(null, '', '/?mix=SPUS:60,SPTE:40');
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByText(/someone shared a mix/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use this mix/i }));
    expect(screen.getByLabelText('SPUS target percent')).toHaveValue('60');
    expect(window.location.search).toBe('');
  });

  it('copies the trades and the share link', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderApp();

    await user.type(screen.getByLabelText('Amount'), '500');
    await screen.findByText('5.0000 sh');
    await user.click(screen.getByRole('button', { name: 'Copy trades' }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('Buy VTI  $500.00  (5.0000 sh @ $100.00)'));
    expect((await screen.findAllByRole('button', { name: 'Copied' })).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Share link' })[0]);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?mix=VTI:100`));
  });

  it('keeps several named portfolios, with undo on delete', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();

    expect(screen.queryByRole('option', { name: 'just rebalancing' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'my portfolio' }));
    const menu = screen.getByRole('dialog', { name: 'Portfolios' });
    await user.click(within(menu).getByRole('button', { name: '+ New portfolio' }));

    expect(screen.getByRole('heading', { name: /pick a mix to start/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Roth IRA' }));
    expect(screen.getByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /schwab 3-fund/i }));
    expect(screen.getByLabelText('SCHB target percent')).toHaveValue('60');

    await user.click(screen.getByRole('button', { name: 'my Roth IRA' }));
    const list = screen.getByRole('dialog', { name: 'Portfolios' });
    expect(within(list).getByRole('button', { name: /My portfolio\s*VTI 100/ })).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Delete Roth IRA' }));

    expect(screen.getByRole('button', { name: 'my portfolio' })).toBeInTheDocument();
    expect(screen.getByText(/Deleted Roth IRA\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios.map(p => p.name)).toEqual(['', 'Roth IRA']);
  });

  it('renames the open portfolio from the menu', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'my portfolio' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Portfolio name');
    await user.clear(field);
    await user.type(field, "Sam's IRA{Enter}");
    expect(screen.getByRole('button', { name: "Sam's IRA" })).toBeInTheDocument();
  });
});
