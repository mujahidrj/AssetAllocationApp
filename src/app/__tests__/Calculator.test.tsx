import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

    // The amount is all that's left, so the cursor is already there
    expect(screen.getByLabelText('Amount')).toHaveFocus();
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

  it('only buys when adding, and offers to sell when buying alone would leave a fund well off target', async () => {
    seed({
      name: 'Brokerage',
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
    expect(screen.queryByLabelText('Selling')).not.toBeInTheDocument();

    // $2,500 brings SPUS close enough: just buys, nothing to ask
    const amount = screen.getByLabelText('Amount');
    await user.type(amount, '2500');
    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText('$2,254.24')).toBeInTheDocument();
    expect(within(trades).getByText('$245.76')).toBeInTheDocument();
    expect(within(trades).getByText(/SPUS · already 57\.9%, target 50%/)).toBeInTheDocument();
    expect(within(trades).queryByText(/would still be/)).not.toBeInTheDocument();

    // $500 leaves SPUS well over (and SPTE well under) target: offered, not done
    await user.clear(amount);
    await user.type(amount, '500');
    expect(await within(trades).findByText(/SPUS and SPTE would still be off target after this\./)).toBeInTheDocument();
    expect(within(trades).queryByText('−$1,450.00')).not.toBeInTheDocument();

    await user.click(within(trades).getByRole('button', { name: 'Sell some to fix it' }));
    expect(within(trades).getByText('−$1,450.00')).toBeInTheDocument();
    expect(within(trades).getByText('Net in $500.00')).toBeInTheDocument();
    expect(within(trades).getByText(/Selling \$1,450\.00 of SPUS so everything lands on target\./)).toBeInTheDocument();
    expect(within(trades).getByText(/Selling in a taxable account may mean paying tax\./)).toBeInTheDocument();

    await user.click(within(trades).getByRole('button', { name: "It's a retirement account" }));
    expect(within(trades).queryByText(/taxable account/)).not.toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0]).toMatchObject({ sell: true, retirement: true });

    // Remembered, but only used when it's needed
    await user.clear(amount);
    await user.type(amount, '2500');
    expect(await within(trades).findByText('$2,254.24')).toBeInTheDocument();
    expect(within(trades).queryByText(/^−\$/)).not.toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '500');
    expect(await within(trades).findByText('−$1,450.00')).toBeInTheDocument();

    await user.click(within(trades).getByRole('button', { name: 'Only buy' }));
    expect(within(trades).queryByText('−$1,450.00')).not.toBeInTheDocument();
    expect(within(trades).getByRole('button', { name: 'Sell some to fix it' })).toBeInTheDocument();
  });

  it('skips the tax note for retirement accounts, and names a single fund that would stay off', async () => {
    seed({
      name: 'Roth IRA',
      funds: [{ symbol: 'SPUS', target: 40 }, { symbol: 'SPTE', target: 20 }, { symbol: 'SPWO', target: 20 }, { symbol: 'SPSK', target: 20 }],
      holdings: {
        SPUS: { kind: 'dollars', amount: 5000 },
        SPTE: { kind: 'dollars', amount: 1667 },
        SPWO: { kind: 'dollars', amount: 1667 },
        SPSK: { kind: 'dollars', amount: 1666 },
      },
      tracksHoldings: true,
      sell: true,
    });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '100');
    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByText(/Selling \$960\.00 of SPUS so everything lands on target\./)).toBeInTheDocument();
    expect(within(trades).queryByText(/taxable account/)).not.toBeInTheDocument();

    await user.click(within(trades).getByRole('button', { name: 'Only buy' }));
    expect(within(trades).getByText(/SPUS would still be at 49\.5% after this\. Target is 40%\./)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Give VTI the 10%' }));
    expect(screen.getByText('Total 100%')).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0].funds.map(f => f.target)).toEqual([60, 40]);
  });

  it('offers the room left over to the fund just added', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'VXUS', target: 40 }] });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: '+ Add fund' }));
    await user.type(screen.getByLabelText(/add a fund/i), 'AAPL');
    await user.click(await screen.findByRole('button', { name: /AAPL Apple Inc\./ }));
    const vti = screen.getByLabelText('VTI target percent');
    await user.clear(vti);
    await user.type(vti, '50');

    // Not the biggest fund: the new one, which is at 0%
    expect(screen.queryByRole('button', { name: 'Give VTI the 10%' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Give AAPL the 10%' }));
    expect(screen.getByText('Total 100%')).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0].funds.map(f => [f.symbol, f.target])).toEqual([['VTI', 50], ['VXUS', 40], ['AAPL', 10]]);

    // Once it has its share, the quick fix goes back to the biggest fund
    await user.clear(vti);
    await user.type(vti, '45');
    expect(screen.queryByRole('button', { name: 'Give AAPL the 5%' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Give VTI the 5%' })).toBeInTheDocument();
  });

  it("makes the phone's copy bar lead to whatever is stopping the trades", async () => {
    seed({ funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }] });
    const user = userEvent.setup();
    renderApp();
    // The bar is only shown on phones, so it's hidden at this width
    const bar = () => document.querySelector<HTMLButtonElement>('[class*="copyBar"] button')!;

    expect(bar()).toHaveTextContent('Type an amount');
    expect(bar()).toBeEnabled();
    fireEvent.click(bar());
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    await user.type(screen.getByLabelText('Amount'), '1000');

    const vti = screen.getByLabelText('VTI target percent');
    await user.clear(vti);
    await user.type(vti, '50');
    expect(bar()).toHaveTextContent('Targets add up to 90%');
    fireEvent.click(bar());
    // Takes you to the total, ready for its quick fix
    expect(screen.getByRole('button', { name: 'Give VTI the 10%' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Give VTI the 10%' }));
    expect(bar()).toHaveTextContent('Copy 2 buys · $1,000.00');
  });

  it('closes the portfolio sheet with Back, a step at a time, and takes its history entries off when closed otherwise', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'my portfolio' }));
    expect(window.history.state).toMatchObject({ aaSheet: 'portfolios', level: 1 });
    await user.click(screen.getByRole('button', { name: 'Use a template…' }));
    expect(screen.getByRole('dialog', { name: 'Templates' })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ aaSheet: 'portfolios', level: 2 });

    // Back steps out of the templates, then closes the sheet
    act(() => { window.history.back(); });
    expect(await screen.findByRole('dialog', { name: 'Portfolios' })).toBeInTheDocument();
    // Forward onto the step it left goes back to where it is, so one Back still closes it
    act(() => { window.history.forward(); });
    await waitFor(() => expect(window.history.state).toMatchObject({ aaSheet: 'portfolios', level: 1 }));
    expect(screen.getByRole('dialog', { name: 'Portfolios' })).toBeInTheDocument();
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.history.state).toBeNull();

    // Closed some other way: both its entries come off, and nothing more
    await user.click(screen.getByRole('button', { name: 'my portfolio' }));
    await user.click(screen.getByRole('button', { name: 'Use a template…' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toBeNull());
    expect(window.location.pathname).toBe('/');
  });

  it('explains where to get the file before opening the file picker, and stays until a file is picked', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'SPUS', target: 60 }, { symbol: 'SPWO', target: 40 }] });
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByTestId('import-file');
    const pick = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button', { name: 'Import from broker' }));
    const guide = screen.getByRole('dialog', { name: 'Import holdings into Roth IRA' });
    expect(within(guide).getByText('From Fidelity, Schwab or Vanguard')).toBeInTheDocument();
    expect(within(guide).getByText('Fidelity:')).toBeInTheDocument();
    expect(within(guide).getByText('Schwab:')).toBeInTheDocument();
    expect(within(guide).getByText('Vanguard:')).toBeInTheDocument();
    expect(pick).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ aaSheet: 'import-guide', level: 1 });
    const entries = window.history.length;

    // Closing the picker without a file comes back to the guide
    await user.click(within(guide).getByRole('button', { name: 'Choose file' }));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(guide).toBeInTheDocument();

    // A file: the import takes over the guide's place, and its history entry
    fireEvent.change(input, {
      target: { files: [new File([fidelityCsv], 'Portfolio_Positions_Nov-22-2026.csv', { type: 'text/csv' })] },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Import holdings into Roth IRA' });
    expect(within(dialog).getByText('Fidelity · Portfolio_Positions_Nov-22-2026.csv')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(window.history.state).toMatchObject({ aaSheet: 'import', level: 1 });
    expect(window.history.length).toBe(entries);

    // So one Back closes it and leaves the page as it was
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.history.state).toBeNull();
  });

  it('keeps Back on the page when one tap closes a sheet and opens another', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    const start = window.history.length;

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(window.history.state).toMatchObject({ aaSheet: 'account', level: 1 });
    // The press outside closes the panel; the same tap opens the guide
    await user.click(screen.getByRole('button', { name: 'Import from broker' }));
    expect(screen.getByRole('dialog', { name: 'Import holdings into Roth IRA' })).toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toMatchObject({ aaSheet: 'import-guide', level: 1 }));
    expect(window.history.length).toBe(start + 1);

    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.history.state).toBeNull();
  });

  it('closes the portfolio sheet when another sheet is opened from the keyboard', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    const start = window.history.length;

    await user.click(screen.getByRole('button', { name: 'my Roth IRA' }));
    screen.getByRole('button', { name: 'Import from broker' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Import holdings into Roth IRA' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Portfolios' })).not.toBeInTheDocument();
    await waitFor(() => expect(window.history.state).toMatchObject({ aaSheet: 'import-guide', level: 1 }));
    expect(window.history.length).toBe(start + 1);
  });

  it('lets you type what you own instead of importing', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Import from broker' }));
    await user.click(screen.getByRole('button', { name: 'Enter by hand' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /i already own some of these/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/VTI you own, in/)).toHaveFocus();
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

  it('follows the device, or stays light or dark when picked, and remembers it', async () => {
    window.localStorage.setItem('assetAllocation.theme', 'light');
    const user = userEvent.setup();
    renderApp();
    expect(document.documentElement.dataset.theme).toBe('light');

    const appearance = screen.getByRole('group', { name: 'Appearance' });
    expect(within(appearance).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(appearance).getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('assetAllocation.theme')).toBe('dark');

    // Back to the device's setting (light here): nothing is remembered
    await user.click(within(appearance).getByRole('button', { name: 'Device' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('assetAllocation.theme')).toBeNull();
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

    // Share sits on the portfolio card, since it shares that portfolio's targets
    const card = screen.getByRole('region', { name: 'Your portfolio' });
    await user.click(within(card).getByRole('button', { name: 'Share targets' }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/?mix=VTI:100`));
    expect(await within(card).findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it("can't share targets that don't add up to 100%", () => {
    seed({ funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 30 }] });
    renderApp();
    expect(screen.getByRole('button', { name: 'Share targets' })).toBeDisabled();
  });

  it('repeats the sentence and the copy button in a bar after the trades scroll away, when scrolling back up', async () => {
    let report: (entry: object) => void = () => {};
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        report = entry => cb([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      fireEvent.scroll(window);
    };
    const setPageHeight = (h: number) => Object.defineProperty(document.documentElement, 'scrollHeight', { value: h, configurable: true });
    try {
      seed({ name: 'Roth IRA', funds: [{ symbol: 'VTI', target: 100 }], holdings: {}, tracksHoldings: false });
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      renderApp();
      await user.type(screen.getByLabelText('Amount'), '500');
      await screen.findByText('5.0000 shares');
      const copyButtons = () => screen.queryAllByRole('button', { name: /copy 1 buy · \$500\.00/i });
      expect(copyButtons()).toHaveLength(0); // the phone's pinned bar is hidden at this width
      expect(screen.queryByTestId('recap')).not.toBeInTheDocument();

      // The Copy button scrolls up out of view; scrolling further down keeps the bar tucked away
      setPageHeight(3000);
      act(() => report({ isIntersecting: false, boundingClientRect: { bottom: -40 } }));
      scrollTo(900);
      expect(screen.getByTestId('recap')).toHaveAttribute('aria-hidden', 'true');

      // The page getting shorter moves the scroll up by itself: that isn't scrolling up
      setPageHeight(2600);
      scrollTo(700);
      expect(screen.getByTestId('recap')).toHaveAttribute('aria-hidden', 'true');

      // Scrolling back up brings it in; scrolling down tucks it away again
      scrollTo(620);
      expect(screen.getByTestId('recap')).toHaveAttribute('aria-hidden', 'false');
      scrollTo(800);
      expect(screen.getByTestId('recap')).toHaveAttribute('aria-hidden', 'true');
      scrollTo(700);
      expect(screen.getByTestId('recap')).toHaveAttribute('aria-hidden', 'false');

      expect(copyButtons()).toHaveLength(1);
      await user.click(copyButtons()[0]);
      expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('Buy VTI  $500.00'));

      await user.click(screen.getByRole('button', { name: 'Change the amount, $500' }));
      expect(screen.getByLabelText('Amount')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Change the portfolio, Roth IRA' }));
      expect(screen.getByRole('dialog', { name: 'Portfolios' })).toBeInTheDocument();

      // Once the Copy button is back in view, the bar goes
      act(() => report({ isIntersecting: true, boundingClientRect: { bottom: 300 } }));
      expect(screen.queryByTestId('recap')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      Reflect.deleteProperty(document.documentElement, 'scrollHeight');
    }
  });

  it('keeps several named portfolios, with undo on delete', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('option', { name: 'rebalance · uses what you own' })).toBeInTheDocument();

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

  it('keeps an Undo for each of two portfolios deleted in a row', async () => {
    saveDeviceWorkspace({
      portfolios: [
        { ...emptyPortfolio('a', 'Roth IRA'), funds: [{ symbol: 'VTI', target: 100 }] },
        { ...emptyPortfolio('b', 'HSA'), funds: [{ symbol: 'VTI', target: 100 }] },
        { ...emptyPortfolio('c', 'Kids'), funds: [{ symbol: 'VTI', target: 100 }] },
      ],
      activeId: 'b',
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'my HSA' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Portfolios' })).getByRole('button', { name: 'Delete HSA' }));
    // Deleting the open portfolio opens the next one; switch back to delete Roth IRA too
    await user.click(screen.getByRole('button', { name: 'my Kids' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Portfolios' })).getByRole('button', { name: /^Roth IRA/ }));
    await user.click(screen.getByRole('button', { name: 'my Roth IRA' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Portfolios' })).getByRole('button', { name: 'Delete Roth IRA' }));

    expect(screen.getByText('Deleted HSA.')).toBeInTheDocument();
    expect(screen.getByText('Deleted Roth IRA.')).toBeInTheDocument();
    const [undoHsa] = screen.getAllByRole('button', { name: 'Undo' });
    await user.click(undoHsa);
    expect(loadDeviceWorkspace()?.portfolios.map(p => p.name)).toEqual(['HSA', 'Kids']);
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
    await user.click(within(dialog).getByLabelText(/use as the amount i want to add/i));
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

  it('holds the trades until every fund held in shares has a price', async () => {
    server.use(http.get('*/api/stock/BND', () => HttpResponse.json({ price: null })));
    seed({
      funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }],
      holdings: { VTI: { kind: 'shares', amount: 10 }, BND: { kind: 'shares', amount: 20 } },
      tracksHoldings: true,
    });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '1000');

    // BND's lookup fails: no trades worked out as if it were worth $0, and nothing to copy
    const trades = screen.getByRole('region', { name: /your trades/i });
    expect(await within(trades).findByRole('heading', { name: 'A price is missing' })).toBeInTheDocument();
    expect(within(trades).getByText(/Couldn't get a price for BND\. You entered it in shares/)).toBeInTheDocument();
    expect(within(trades).getByRole('button', { name: 'Copy trades' })).toBeDisabled();
    expect(within(trades).queryByText(/^\$/)).not.toBeInTheDocument();

    await user.click(within(trades).getByRole('button', { name: 'Add a price for BND' }));
    await user.type(screen.getByLabelText('Price per share for BND'), '50');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // VTI 10 × $100 and BND 20 × $50: $1,000 more lands both on 60/40 of $3,000
    expect(await within(trades).findByText('$800.00')).toBeInTheDocument();
    expect(within(trades).getByText('$200.00')).toBeInTheDocument();
    expect(within(trades).getByRole('button', { name: 'Copy trades' })).toBeEnabled();
  });

  it('asks for the price of a fund you hold but have no target for', async () => {
    server.use(http.get('*/api/stock/XYZ', () => HttpResponse.json({ price: null })));
    seed({
      funds: [{ symbol: 'VTI', target: 100 }],
      holdings: { VTI: { kind: 'dollars', amount: 1000 }, XYZ: { kind: 'shares', amount: 10 } },
      tracksHoldings: true,
    });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '500');

    const trades = screen.getByRole('region', { name: /your trades/i });
    await user.click(await within(trades).findByRole('button', { name: 'Add a price for XYZ' }));
    await user.type(screen.getByLabelText('Price per share for XYZ'), '10');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // XYZ is now worth $100, so the trades can be worked out: adding only buys VTI
    expect((await within(trades).findAllByText('$500.00')).length).toBeGreaterThan(0);
    expect(within(trades).getByRole('button', { name: 'Copy trades' })).toBeEnabled();
  });

  it("won't switch shares with no price to dollars, which would count them as $0", async () => {
    server.use(http.get('*/api/stock/VXUS', () => HttpResponse.json({ price: null })));
    seed({ funds: [{ symbol: 'VXUS', target: 100 }], holdings: { VXUS: { kind: 'shares', amount: 100 } }, tracksHoldings: true });
    renderApp();
    const toggle = screen.getByRole('group', { name: 'VXUS enter as' });
    await waitFor(() => expect(within(toggle).getByRole('button', { name: '$' })).toBeDisabled());
    expect(loadDeviceWorkspace()?.portfolios[0].holdings).toEqual({ VXUS: { kind: 'shares', amount: 100 } });
  });

  it('says it is waiting for prices while they load', async () => {
    server.use(http.get('*/api/stock/VXUS', () => new Promise<Response>(() => {})));
    seed({ funds: [{ symbol: 'VXUS', target: 100 }], holdings: { VXUS: { kind: 'shares', amount: 3 } }, tracksHoldings: true });
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText('Amount'), '500');
    expect(screen.getByRole('heading', { name: 'Getting prices…' })).toBeInTheDocument();
    expect(screen.getByText(/You entered VXUS in shares, so your trades show up once it has a price\./)).toBeInTheDocument();
  });

  it('says when removing more than you own sells everything', async () => {
    seed({
      funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }],
      holdings: { VTI: { kind: 'dollars', amount: 14000 }, BND: { kind: 'dollars', amount: 7000 } },
      tracksHoldings: true,
    });
    const user = userEvent.setup();
    renderApp();
    await user.selectOptions(screen.getByLabelText('What you want to do'), 'out');
    const amount = screen.getByLabelText('Amount');
    await user.type(amount, '30000');
    expect(screen.getByText('You own $21,000, so this sells everything.')).toBeInTheDocument();
    expect(await screen.findByText('−$14,000.00')).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, '5000');
    expect(screen.queryByText(/so this sells everything/)).not.toBeInTheDocument();
    expect(screen.getByText(/Selling from whatever's furthest over target first\./)).toBeInTheDocument();
  });

  it('brings back a removed fund and what you owned of it, and keeps the Undo when another message comes', async () => {
    seed({
      name: 'Roth IRA',
      funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'VXUS', target: 40 }, { symbol: 'BND', target: 0 }],
      holdings: { BND: { kind: 'dollars', amount: 2000 } },
      tracksHoldings: true,
    });
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'));
    renderApp();

    // Two in a row share one Undo, which brings both back where they were
    await user.click(screen.getByRole('button', { name: 'Remove BND' }));
    expect(screen.getByText('Removed BND.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove VXUS' }));
    expect(screen.getByText('Removed BND and VXUS.')).toBeInTheDocument();
    expect(loadDeviceWorkspace()?.portfolios[0].holdings).toEqual({});
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(loadDeviceWorkspace()?.portfolios[0].funds.map(f => f.symbol)).toEqual(['VTI', 'VXUS', 'BND']);
    expect(loadDeviceWorkspace()?.portfolios[0].holdings).toEqual({ BND: { kind: 'dollars', amount: 2000 } });
    expect(screen.getByLabelText('BND you own, in dollars')).toHaveValue('2,000');

    // A new message stacks with an Undo instead of replacing it
    await user.click(screen.getByRole('button', { name: 'Remove BND' }));
    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(within(screen.getByRole('region', { name: /your trades/i })).getByRole('button', { name: 'Copy trades' }));
    expect(await screen.findByText("Couldn't copy.")).toBeInTheDocument();
    expect(screen.getByText('Removed BND.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('BND you own, in dollars')).toHaveValue('2,000');
  });

  it('ends a fund’s Undo when its portfolio is deleted or left, rather than undo out of sight', async () => {
    saveDeviceWorkspace({
      portfolios: [
        { ...emptyPortfolio('a', 'Roth IRA'), funds: [{ symbol: 'VTI', target: 60 }, { symbol: 'BND', target: 40 }] },
        { ...emptyPortfolio('b', 'HSA'), funds: [{ symbol: 'VTI', target: 100 }] },
      ],
      activeId: 'a',
    });
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Remove BND' }));
    expect(screen.getByText('Removed BND.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'my Roth IRA' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Portfolios' })).getByRole('button', { name: /HSA/ }));
    expect(screen.queryByText('Removed BND.')).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("What you want to do")).toHaveValue('add');
    expect(screen.getByText(/Furthest off: SPUS \+7\.9/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Rebalance' }));

    expect(screen.getByLabelText("What you want to do")).toHaveValue('rebal');
    expect(await within(trades).findByText('−$1,700.00')).toBeInTheDocument();
    expect(screen.queryByText(/Furthest off/)).not.toBeInTheDocument();

    // Back to adding: the amount typed before is still there
    await user.selectOptions(screen.getByLabelText("What you want to do"), 'add');
    expect(screen.getByLabelText('Amount')).toHaveValue('500');
  });

  it('turns holdings on when rebalancing is picked without them', async () => {
    seed({ funds: [{ symbol: 'VTI', target: 100 }] });
    const user = userEvent.setup();
    renderApp();
    await user.selectOptions(screen.getByLabelText("What you want to do"), 'rebal');
    expect(screen.getByRole('switch', { name: /i already own some of these/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Rebalancing works from what you own\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter it below' }));
    expect(screen.getByLabelText('VTI you own, in dollars')).toHaveFocus();
  });

  it('imports a money-market fund the portfolio targets as that fund', async () => {
    seed({ name: 'Roth IRA', funds: [{ symbol: 'SPUS', target: 90 }, { symbol: 'SPAXX', target: 10 }] });
    const user = userEvent.setup();
    renderApp();
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File([fidelityCsv], 'positions.csv', { type: 'text/csv' })] },
    });
    const dialog = await screen.findByRole('dialog', { name: 'Import holdings into Roth IRA' });
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText('SPAXX')).toBeInTheDocument();
    expect(within(dialog).getByText('$412.55')).toBeInTheDocument();
    expect(within(dialog).queryByText(/use as the amount/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Replace holdings' }));
    expect(loadDeviceWorkspace()?.portfolios[0].holdings.SPAXX).toEqual({ kind: 'dollars', amount: 412.55 });
  });
});
