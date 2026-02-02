import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '../../../../test/utils';
import userEvent from '@testing-library/user-event';
import { StockSearch } from '../StockSearch';
import { server } from '../../../../test/server';
import { http, HttpResponse } from 'msw';

// Mock window methods
const mockGetBoundingClientRect = vi.fn(() => ({
  left: 100,
  top: 200,
  bottom: 230,
  width: 300,
  height: 30,
}));

describe('StockSearch', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSelect: vi.fn(),
    error: undefined,
    loading: false,
    disabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = mockGetBoundingClientRect;
    // Mock window.innerWidth and innerHeight
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render search input', () => {
    render(<StockSearch {...defaultProps} />);
    
    expect(screen.getByPlaceholderText('Search stock symbol or company...')).toBeInTheDocument();
  });

  it('should call onChange when user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    
    render(<StockSearch {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'AAPL');
    
    expect(onChange).toHaveBeenCalled();
  });

  it.skip('should show loading spinner when searching', async () => {
    const user = userEvent.setup();
    
    // Override MSW handler for this test with delay
    server.use(
      http.get('*/api/search', async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return HttpResponse.json({ result: [] });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'AAPL');
    
    // Wait for debounce (300ms) + API call delay
    await waitFor(() => {
      const spinner = document.querySelector('[class*="spinnerIcon"]');
      expect(spinner).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it.skip('should filter out non-US stocks', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'AAPL', description: 'Apple Inc.' },
            { symbol: '301510.SZ', description: 'Googol' }, // Chinese stock
            { symbol: 'MSFT', description: 'Microsoft Corporation' },
            { symbol: 'GOOGL.TO', description: 'Alphabet Inc.' }, // Canadian listing
            { symbol: 'TSLA', description: 'Tesla Inc.' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    // Wait for debounce (300ms) + API call + rendering
    await waitFor(async () => {
      // Should show US stocks only - look for symbol text in buttons
      await screen.findByText('AAPL', {}, { timeout: 2000 });
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Should not show non-US stocks
    expect(screen.queryByText('301510.SZ')).not.toBeInTheDocument();
    expect(screen.queryByText('GOOGL.TO')).not.toBeInTheDocument();
  });

  it.skip('should show US stocks with share class suffixes', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'GOOGL', description: 'Alphabet Inc. Class A' },
            { symbol: 'GOOGL.A', description: 'Alphabet Inc. Class A' },
            { symbol: 'BRK.A', description: 'Berkshire Hathaway Inc. Class A' },
            { symbol: 'BRK.B', description: 'Berkshire Hathaway Inc. Class B' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'googl');
    
    await waitFor(async () => {
      // Should show US stocks with share classes
      await screen.findByText('GOOGL', {}, { timeout: 2000 });
      expect(screen.getByText('BRK.A')).toBeInTheDocument();
      expect(screen.getByText('BRK.B')).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  it.skip('should deduplicate results by base ticker', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'AAPL', description: 'Apple Inc.' },
            { symbol: 'AAPL.N', description: 'Apple Inc.' }, // NYSE variant
            { symbol: 'MSFT', description: 'Microsoft Corporation' },
            { symbol: 'MSFT.O', description: 'Microsoft Corporation' }, // NASDAQ variant
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    await waitFor(async () => {
      // Wait for results to appear
      await screen.findByText('AAPL', {}, { timeout: 2000 });
      // Should show only primary tickers (no duplicates)
      const aaplElements = screen.queryAllByText(/AAPL/);
      const msftElements = screen.queryAllByText(/MSFT/);
      // Should have at most one result per base ticker
      expect(aaplElements.length).toBeLessThanOrEqual(1);
      expect(msftElements.length).toBeLessThanOrEqual(1);
    }, { timeout: 4000 });
  });

  it.skip('should call onSelect when a result is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'AAPL', description: 'Apple Inc.' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} onSelect={onSelect} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'AAPL');
    
    await waitFor(async () => {
      const resultButton = await screen.findByText('AAPL', {}, { timeout: 2000 });
      await user.click(resultButton.closest('button')!);
      
      expect(onSelect).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
    }, { timeout: 4000 });
  });

  it.skip('should handle keyboard navigation', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'AAPL', description: 'Apple Inc.' },
            { symbol: 'MSFT', description: 'Microsoft Corporation' },
            { symbol: 'GOOGL', description: 'Alphabet Inc.' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} onSelect={onSelect} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    await waitFor(async () => {
      // Wait for results to appear
      await screen.findByText('AAPL', {}, { timeout: 2000 });
      // Press Enter to select first result
      input.focus();
      await user.keyboard('{Enter}');
      
      expect(onSelect).toHaveBeenCalled();
    }, { timeout: 4000 });
  });

  it.skip('should show "no results" message when no US stocks found', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: '301510.SZ', description: 'Googol' }, // Chinese stock
            { symbol: 'GOOGL.TO', description: 'Alphabet Inc.' }, // Canadian listing
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    await waitFor(() => {
      expect(screen.getByText(/No results found/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should display error message when provided', () => {
    render(<StockSearch {...defaultProps} error="Invalid stock symbol" />);
    
    expect(screen.getByText('Invalid stock symbol')).toBeInTheDocument();
  });

  it('should disable input when disabled prop is true', () => {
    render(<StockSearch {...defaultProps} disabled={true} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    expect(input).toBeDisabled();
  });

  it('should disable input when loading prop is true', () => {
    render(<StockSearch {...defaultProps} loading={true} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    expect(input).toBeDisabled();
  });

  it('should show hint when input is less than 2 characters', () => {
    render(<StockSearch {...defaultProps} value="A" />);

    expect(screen.getByText(/Type at least 2 characters to search/i)).toBeInTheDocument();
  });

  it.skip('should filter out Frankfurt exchange (.F suffix)', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'MSF.F', description: 'Some Company Frankfurt' },
            { symbol: 'AAPL', description: 'Apple Inc.' },
            { symbol: 'MSFT', description: 'Microsoft Corporation' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'msf');
    
    await waitFor(async () => {
      // Should show US stocks
      await screen.findByText('AAPL', {}, { timeout: 2000 });
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Should NOT show Frankfurt exchange stock
    expect(screen.queryByText('MSF.F')).not.toBeInTheDocument();
  });

  it.skip('should allow US share class suffixes (.A, .B) but filter non-US single-letter suffixes', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'BRK.A', description: 'Berkshire Hathaway Class A' },
            { symbol: 'BRK.B', description: 'Berkshire Hathaway Class B' },
            { symbol: 'GOOGL.A', description: 'Alphabet Class A' },
            { symbol: 'MSF.F', description: 'Some Company Frankfurt' }, // Should be filtered
            { symbol: 'TEST.F', description: 'Test Frankfurt' }, // Should be filtered
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    await waitFor(async () => {
      // Should show US share classes
      await screen.findByText('BRK.A', {}, { timeout: 2000 });
      expect(screen.getByText('BRK.B')).toBeInTheDocument();
      expect(screen.getByText('GOOGL.A')).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Should NOT show Frankfurt exchange stocks
    expect(screen.queryByText('MSF.F')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.F')).not.toBeInTheDocument();
  });

  it.skip('should filter out various non-US exchange suffixes', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [
            { symbol: 'AAPL', description: 'Apple Inc.' },
            { symbol: 'TEST.SZ', description: 'Test China' },
            { symbol: 'TEST.SS', description: 'Test Shanghai' },
            { symbol: 'TEST.TO', description: 'Test Toronto' },
            { symbol: 'TEST.L', description: 'Test London' },
            { symbol: 'TEST.HK', description: 'Test Hong Kong' },
            { symbol: 'TEST.MX', description: 'Test Mexico' },
            { symbol: 'MSFT', description: 'Microsoft Corporation' },
          ],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'test');
    
    await waitFor(async () => {
      // Should only show US stocks
      await screen.findByText('AAPL', {}, { timeout: 2000 });
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Should not show any non-US stocks
    expect(screen.queryByText('TEST.SZ')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.SS')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.TO')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.L')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.HK')).not.toBeInTheDocument();
    expect(screen.queryByText('TEST.MX')).not.toBeInTheDocument();
  });

  it.skip('should not show manual entry fallback when API returns no results', async () => {
    const user = userEvent.setup();
    
    server.use(
      http.get('*/api/search', () => {
        return HttpResponse.json({
          result: [],
        });
      })
    );
    
    render(<StockSearch {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Search stock symbol or company...');
    await user.type(input, 'AMAPX');
    
    // Wait for debounce (300ms) and API call to complete
    await waitFor(() => {
      // Should show "no results" message
      expect(screen.getByText(/No results found/i)).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Should NOT show manual entry option (this was removed)
    expect(screen.queryByText(/AMAPX.*Manual Entry/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Manual Entry/i)).not.toBeInTheDocument();
  });

  describe('isUSTicker filtering logic', () => {
    // Test the filtering logic by rendering with mock API responses
    it.skip('should filter out Frankfurt exchange (.F) suffix', async () => {
      const user = userEvent.setup();
      
      server.use(
        http.get('*/api/search', () => {
          return HttpResponse.json({
            result: [
              { symbol: 'MSF.F', description: 'Some Company Frankfurt' },
              { symbol: 'AAPL', description: 'Apple Inc.' },
            ],
          });
        })
      );
      
      render(<StockSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search stock symbol or company...');
      await user.type(input, 'msf');
      
      await waitFor(async () => {
        // Should show US stock
        await screen.findByText('AAPL', {}, { timeout: 2000 });
      }, { timeout: 4000 });
      
      // Should NOT show Frankfurt exchange stock
      expect(screen.queryByText('MSF.F')).not.toBeInTheDocument();
    });

    it.skip('should allow US share class suffixes (.A, .B)', async () => {
      const user = userEvent.setup();
      
      server.use(
        http.get('*/api/search', () => {
          return HttpResponse.json({
            result: [
              { symbol: 'BRK.A', description: 'Berkshire Hathaway Class A' },
              { symbol: 'BRK.B', description: 'Berkshire Hathaway Class B' },
              { symbol: 'GOOGL.A', description: 'Alphabet Class A' },
            ],
          });
        })
      );
      
      render(<StockSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search stock symbol or company...');
      await user.type(input, 'brk');
      
      await waitFor(async () => {
        // Should show US share classes
        await screen.findByText('BRK.A', {}, { timeout: 2000 });
        expect(screen.getByText('BRK.B')).toBeInTheDocument();
        expect(screen.getByText('GOOGL.A')).toBeInTheDocument();
      }, { timeout: 4000 });
    });

    it.skip('should filter out other non-US single-letter suffixes', async () => {
      const user = userEvent.setup();
      
      server.use(
        http.get('*/api/search', () => {
          return HttpResponse.json({
            result: [
              { symbol: 'TEST.F', description: 'Test Frankfurt' },
              { symbol: 'TEST.T', description: 'Test Tokyo' },
              { symbol: 'AAPL', description: 'Apple Inc.' },
            ],
          });
        })
      );
      
      render(<StockSearch {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search stock symbol or company...');
      await user.type(input, 'test');
      
      await waitFor(async () => {
        // Should show US stock
        await screen.findByText('AAPL', {}, { timeout: 2000 });
      }, { timeout: 4000 });
      
      // Should NOT show non-US exchange stocks
      expect(screen.queryByText('TEST.F')).not.toBeInTheDocument();
      expect(screen.queryByText('TEST.T')).not.toBeInTheDocument();
    });
  });
});
