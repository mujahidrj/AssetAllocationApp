import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import fidelityCsv from './fixtures/fidelity.csv?raw';
import userEvent from '@testing-library/user-event';
import { Calculator } from '../Calculator';
import { saveDeviceWorkspace, loadDeviceWorkspace } from '../storage';
import { emptyPortfolio, type Portfolio } from '../model';

const seed = (p: Partial<Portfolio>) => saveDeviceWorkspace({ portfolios: [{ ...emptyPortfolio('p1'), ...p }], activeId: 'p1' });

const renderApp = () => render(<Calculator />);

describe('Calculator', () => {
  it('starts by asking for a starting point, then splits new money by target', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('heading', { name: /pick a starting point/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /vanguard 3-fund/i }));

    expect(screen.getByRole('button', { name: 'my portfolio' })).toBeInTheDocument();
    expect(screen.getByText('From the Vanguard 3-Fund template')).toBeInTheDocument();
    expect(screen.getByText(/type an amount above/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '10,000');

    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText('$6,000.00')).toBeInTheDocument();
    expect(within(trades).getByText('$3,000.00')).toBeInTheDocument();
    expect(within(trades).getByText('$1,000.00')).toBeInTheDocument();
    expect(within(trades).getByRole('heading', { name: 'Buy these 3' })).toBeInTheDocument();
    // Prices come from the mocked API ($100 for these funds)
    expect(await within(trades).findByText('60.0000 shares')).toBeInTheDocument();
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

    expect(screen.getByText(/someone shared a portfolio/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use these funds/i }));
    expect(screen.getByLabelText('SPUS target percent')).toHaveValue('60');
    expect(window.location.search).toBe('');
  });

  it('copies the trades and the share link', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderApp();

    await user.type(screen.getByLabelText('Amount'), '500');
    await screen.findByText('5.0000 shares');
    await user.click(screen.getByRole('button', { name: 'Copy trades' }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('Buy VTI  $500.00  (5.0000 shares at $100.00)'));
    expect((await screen.findAllByRole('button', { name: 'Copied' })).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Share link' })[0]);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?mix=VTI:100`));
  });

  it('keeps several named portfolios, with undo on delete', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('option', { name: 'just rebalancing · uses what you own' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'my portfolio' }));
    const menu = screen.getByRole('dialog', { name: 'Portfolios' });
    await user.click(within(menu).getByRole('button', { name: '+ New portfolio' }));

    expect(screen.getByRole('heading', { name: /pick a starting point/i })).toBeInTheDocument();
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

  it('shows the portfolio name on the card, with a way to switch or add portfolios', async () => {
    saveDeviceWorkspace({
      portfolios: [{ ...emptyPortfolio('a', 'Roth IRA'), funds: [{ symbol: 'VTI', target: 100 }] }, { ...emptyPortfolio('b', 'HSA'), funds: [{ symbol: 'BND', target: 100 }] }],
      activeId: 'a',
    });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('heading', { name: 'Roth IRA' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch or add portfolio' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Portfolios' })).getByRole('button', { name: /HSA/ }));
    expect(screen.getByRole('heading', { name: 'HSA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'my HSA' })).toBeInTheDocument();
  });

  it('trades whole shares when chosen, showing the cash left over', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }] });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '1050');
    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText('6.3000 shares')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Shares'), 'whole');
    expect(within(trades).getByText('6 shares')).toBeInTheDocument();
    expect(within(trades).getByText('4 shares')).toBeInTheDocument();
    expect(within(trades).getByText('$1,000.00 of $1,050.00')).toBeInTheDocument();
    expect(within(trades).getByText('Cash left over')).toBeInTheDocument();
    expect(within(trades).getByText('$50.00')).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0].wholeShares).toBe(true);
  });

  it('says when the amount won’t buy one whole share, with a way back to fractions', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }], wholeShares: true });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '50');
    expect(await screen.findByRole('heading', { name: 'Not enough for one share' })).toBeInTheDocument();
    expect(screen.getByText(/Cheapest is VTI at \$100\.00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use fractional shares' }));
    expect(await screen.findByText('0.5000 shares')).toBeInTheDocument();
  });

  it('imports holdings from a broker file after a review step, with undo', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'SPUS', target: 60 }, { symbol: 'SPWO', target: 40 }] });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('button', { name: 'Import from broker' })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File([fidelityCsv], 'Portfolio_Positions_Nov-22-2026.csv', { type: 'text/csv' })] },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Import holdings into Roth IRA' });
    expect(within(dialog).getByText('Fidelity · Portfolio_Positions_Nov-22-2026.csv')).toBeInTheDocument();
    // Two accounts in the file: the one named like the portfolio is picked
    expect(within(dialog).getByRole('radio', { name: /ROTH IRA …3456/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(within(dialog).getByText('210 shares · $10,840.20')).toBeInTheDocument();
    expect(within(dialog).getByText('40.5 shares · $1,061.91')).toBeInTheDocument();
    expect(within(dialog).getAllByText('was nothing')).toHaveLength(2);
    expect(within(dialog).getByText('Replaces what you own in Roth IRA: 2 funds, $11,902.11.')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/use as the amount i'm adding/i));
    await user.click(within(dialog).getByRole('button', { name: 'Replace holdings' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Holdings imported from Fidelity.')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('400.55');
    expect(screen.getByRole('switch', { name: /i already own some of these/i })).toHaveAttribute('aria-checked', 'true');
    expect(loadDeviceWorkspace()?.portfolios[0].holdings).toEqual({
      SPUS: { kind: 'shares', amount: 210 },
      SPWO: { kind: 'shares', amount: 40.5 },
    });

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(loadDeviceWorkspace()?.portfolios[0].tracksHoldings).toBe(false);
    expect(loadDeviceWorkspace()?.portfolios[0].holdings).toEqual({});
  });

  it('explains files it can’t import', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByTestId('import-file');

    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/that isn’t a csv file/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.change(input, { target: { files: [new File(['hello,world\nfoo,bar'], 'notes.csv', { type: 'text/csv' })] } });
    const dialog = await screen.findByRole('dialog', { name: "We couldn't read this file" });
    expect(within(dialog).getByText(/use the positions export from fidelity, schwab or vanguard/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'How to export' }));
    expect(within(dialog).getByText('Fidelity:')).toBeInTheDocument();
  });

  it('lets you type a price for a fund the lookup can’t price', async () => {
    server.use(http.get('*/api/stock/TRUST2050', () => HttpResponse.json({ price: null })));
    seed({ funds: [{ symbol: 'TRUST2050', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '500');

    await user.click(await screen.findByRole('button', { name: 'Add a price to see shares' }));
    const field = screen.getByLabelText('Price per share for TRUST2050');
    await user.type(field, '25');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('20.0000 shares')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit your price for TRUST2050' })).toHaveTextContent('$25.00');
    expect(screen.getByText(/Your price for TRUST2050/)).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.manualPrices?.TRUST2050.price).toBe(25);

    await user.click(screen.getByRole('button', { name: 'Edit your price for TRUST2050' }));
    await user.click(screen.getByRole('button', { name: 'Remove my price' }));
    expect(screen.getByRole('button', { name: 'Add price' })).toBeInTheDocument();
  });

  it('shows all portfolios together, with where new money helps most', async () => {
    saveDeviceWorkspace({
      portfolios: [
        { ...emptyPortfolio('a', 'Roth IRA'), funds: [{ symbol: 'SPUS', target: 60 }, { symbol: 'SPWO', target: 40 }], tracksHoldings: true, holdings: { SPUS: { kind: 'dollars', amount: 9000 }, SPWO: { kind: 'dollars', amount: 1000 } } },
        { ...emptyPortfolio('b', 'HSA'), funds: [{ symbol: 'SPUS', target: 100 }], tracksHoldings: true, holdings: { SPUS: { kind: 'dollars', amount: 1000 } } },
      ],
      activeId: 'a',
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'my Roth IRA' }));
    const menu = screen.getByRole('dialog', { name: 'Portfolios' });
    await user.click(within(menu).getByRole('button', { name: /All portfolios\s*2 with holdings · \$11,000\.00/ }));

    expect(screen.getByText(/Here are/).closest('p')).toHaveTextContent('Here are all my portfolios together.');
    expect(screen.getByRole('heading', { name: 'All portfolios' })).toBeInTheDocument();
    const helps = screen.getByRole('region', { name: 'Where new money helps most' });
    expect(within(helps).getByText(/27\.3% behind · \$3,000\.00 short/)).toBeInTheDocument();

    await user.click(within(helps).getByRole('button', { name: 'Roth IRA' }));
    expect(screen.getByRole('button', { name: 'my Roth IRA' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /your trades/i })).toBeInTheDocument();
  });

  it('shows the trades as text when copying is blocked', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'));
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '500');
    await screen.findByText('5.0000 shares');
    await user.click(screen.getByRole('button', { name: 'Copy trades' }));

    expect(await screen.findByText("Couldn't copy.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show as text' }));
    expect(screen.getByLabelText(/select the trades and copy them/i)).toHaveValue('Buy VTI  $500.00  (5.0000 shares at $100.00)');
  });

  it('says when fund search is down', async () => {
    server.use(http.get('*/api/search', () => new HttpResponse(null, { status: 500 })));
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: '+ Add fund' }));
    await user.type(screen.getByLabelText(/add a fund/i), 'SPUS');
    expect(await screen.findByText(/fund search isn’t working right now/i)).toBeInTheDocument();
  });

  it('points out rebalancing when holdings drift, without switching to it', async () => {
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

    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText(/SPUS is at 57\.9%, target 50%\./)).toBeInTheDocument();
    expect(screen.getByLabelText("What you're doing")).toHaveValue('add');
    expect(screen.getByText(/Furthest off: SPUS \+7\.9/)).toBeInTheDocument();

    // A small deposit leaves it still off: offered as an alternative, not forced
    await user.type(screen.getByLabelText('Amount'), '500');
    expect(await within(trades).findByText('SPUS still +6.6 after this')).toBeInTheDocument();
    await user.click(within(trades).getByRole('button', { name: 'Rebalance instead' }));

    expect(screen.getByLabelText("What you're doing")).toHaveValue('rebal');
    expect(await within(trades).findByText('−$1,700.00')).toBeInTheDocument();
    expect(screen.queryByText(/Furthest off/)).not.toBeInTheDocument();

    // Back to adding: the amount typed before is still there
    await user.selectOptions(screen.getByLabelText("What you're doing"), 'add');
    expect(screen.getByLabelText('Amount')).toHaveValue('500');
  });

  it('turns holdings on when rebalancing is picked without them', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    await user.selectOptions(screen.getByLabelText("What you're doing"), 'rebal');
    expect(screen.getByRole('switch', { name: /i already own some of these/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Rebalancing works from what you own\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter it below' }));
    expect(screen.getByLabelText('VTI you own, in dollars')).toHaveFocus();
  });
});
