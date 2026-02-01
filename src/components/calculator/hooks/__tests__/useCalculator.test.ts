import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCalculator } from '../useCalculator';
import type { User } from 'firebase/auth';
import type { Stock } from '../../types';

// Mock Firebase
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

vi.mock('firebase/firestore', async () => {
  const actual = (await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore'));
  return {
    ...(actual as object),
    getFirestore: vi.fn(() => ({})),
    doc: vi.fn(),
    setDoc: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useCalculator - Deposit Mode', () => {
  const mockUser = null as User | null;
  const mockStocks: Stock[] = [];
  const mockSetStocks = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('Initial State', () => {
    it('should initialize with default local stocks for guest user', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      expect(result.current.state.currentStocks).toHaveLength(2);
      expect(result.current.state.currentStocks[0].name).toBe('FZROX');
      expect(result.current.state.currentStocks[1].name).toBe('FZILX');
    });

    it('should initialize with empty amount', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      expect(result.current.state.amount).toBe('');
    });

    it('should initialize in deposit mode', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      expect(result.current.state.mode).toBe('deposit');
    });

    it('should initialize with no validation errors', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      expect(Object.keys(result.current.state.validationErrors)).toHaveLength(0);
    });
  });

  describe('setAmount', () => {
    it('should update amount when setAmount is called', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setAmount('1000');
      });

      expect(result.current.state.amount).toBe('1000');
    });

    it('should clear amount validation error when amount is set', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      // First set an invalid amount to trigger error
      act(() => {
        result.current.actions.setAmount('-100');
      });

      // Wait for validation
      await waitFor(() => {
        expect(result.current.state.validationErrors.amount).toBeDefined();
      });

      // Then set a valid amount
      act(() => {
        result.current.actions.setAmount('1000');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.amount).toBeUndefined();
      });
    });
  });

  describe('addStock', () => {
    it('should add a new stock when valid symbol is provided', async () => {
      // Mock API responses - first for Finnhub (company name), then for stock price
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: [{ description: 'Apple Inc.' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 150.25 }),
        } as Response);

      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      const initialStockCount = result.current.state.currentStocks.length;

      await act(async () => {
        await result.current.actions.addStock('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentStocks.length).toBe(initialStockCount + 1);
      });

      const addedStock = result.current.state.currentStocks.find(s => s.name === 'AAPL');
      expect(addedStock).toBeDefined();
      expect(addedStock?.percentage).toBe(0);
    });

    it('should fetch company name from API when adding stock', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: [{ description: 'Apple Inc.' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 150.25 }),
        } as Response);

      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      await act(async () => {
        await result.current.actions.addStock('AAPL');
      });

      await waitFor(() => {
        const stock = result.current.state.currentStocks.find(s => s.name === 'AAPL');
        expect(stock?.companyName).toBe('Apple Inc.');
      });
    });

    it('should not add duplicate stock', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: [{ description: 'Test Company' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ price: 150.25 }),
        } as Response);

      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      // Add stock first time
      await act(async () => {
        await result.current.actions.addStock('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentStocks.some(s => s.name === 'AAPL')).toBe(true);
      });

      const firstCount = result.current.state.currentStocks.length;

      // Try to add same stock again
      await act(async () => {
        await result.current.actions.addStock('AAPL');
      });

      // Wait a bit to see if it was added
      await waitFor(() => {
        expect(result.current.state.currentStocks.length).toBe(firstCount);
        expect(result.current.state.validationErrors.newStock).toBeDefined();
      });
    });

    it('should validate empty stock symbol', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      await act(async () => {
        await result.current.actions.addStock('');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.newStock).toBeDefined();
      });
    });
  });

  describe('removeStock', () => {
    it('should remove a stock by index', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      const initialCount = result.current.state.currentStocks.length;
      const firstStockName = result.current.state.currentStocks[0].name;

      act(() => {
        result.current.actions.removeStock(0);
      });

      expect(result.current.state.currentStocks.length).toBe(initialCount - 1);
      expect(result.current.state.currentStocks.find(s => s.name === firstStockName)).toBeUndefined();
    });
  });

  describe('updateStockPercentage', () => {
    it('should update stock percentage by index', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.updateStockPercentage(0, '60');
      });

      expect(result.current.state.currentStocks[0].percentage).toBe(60);
    });

    it('should validate percentages add up to 100%', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setAmount('1000');
        result.current.actions.updateStockPercentage(0, '50');
        result.current.actions.updateStockPercentage(1, '30');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.percentages).toBeDefined();
      });
    });

    it('should clear percentage error when percentages add up to 100%', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      // Wait for initial state
      await waitFor(() => {
        expect(result.current.state.currentStocks.length).toBe(2);
      });

      // Initial stocks are FZROX (80%) and FZILX (20%) = 100%, so no error
      // First, set percentages that don't add up to 100%
      act(() => {
        result.current.actions.setAmount('1000');
      });

      await waitFor(() => {
        expect(result.current.state.amount).toBe('1000');
      });

      // Update both stocks to invalid percentages
      act(() => {
        result.current.actions.updateStockPercentage(0, '50');
      });

      await waitFor(() => {
        expect(result.current.state.currentStocks[0].percentage).toBe(50);
      });

      act(() => {
        result.current.actions.updateStockPercentage(1, '30'); // Total should be 80%
      });

      await waitFor(() => {
        const total = result.current.state.currentStocks.reduce((sum, stock) => sum + stock.percentage, 0);
        expect(Math.abs(total - 100)).toBeGreaterThan(0.01);
        expect(result.current.state.validationErrors.percentages).toBeDefined();
      });

      // Now update to make them add up to 100%
      act(() => {
        result.current.actions.updateStockPercentage(1, '50'); // Total should be 100%
      });

      await waitFor(() => {
        expect(result.current.state.currentStocks[1].percentage).toBe(50);
        const total = result.current.state.currentStocks.reduce((sum, stock) => sum + stock.percentage, 0);
        expect(Math.abs(total - 100)).toBeLessThan(0.01);
      }, { timeout: 2000 });

      // Now check that error is cleared
      await waitFor(() => {
        expect(result.current.state.validationErrors.percentages).toBeUndefined();
      }, { timeout: 2000 });
    });
  });

  describe('calculateAllocations', () => {
    it('should calculate allocations when amount and percentages are valid', async () => {
      // Mock stock price API calls for the default stocks
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/stock/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ price: 100 }),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      // Wait for initial state to settle (default stocks: FZROX 80%, FZILX 20% = 100%)
      await waitFor(() => {
        expect(result.current.state.currentStocks.length).toBe(2);
      });

      // Set amount - percentages already add up to 100% (80% + 20%)
      act(() => {
        result.current.actions.setAmount('1000');
      });

      // Wait for allocations to calculate
      await waitFor(() => {
        expect(result.current.state.validationErrors.percentages).toBeUndefined();
        expect(result.current.state.allocations).not.toBeNull();
      }, { timeout: 3000 });

      if (result.current.state.allocations) {
        expect(result.current.state.allocations).toHaveLength(2);
        // FZROX: 80% of 1000 = 800, FZILX: 20% of 1000 = 200
        // Note: amounts are returned as formatted strings
        const fzroxAllocation = result.current.state.allocations.find(a => a.name === 'FZROX');
        const fzilxAllocation = result.current.state.allocations.find(a => a.name === 'FZILX');
        expect(fzroxAllocation?.amount).toBe('800.00');
        expect(fzilxAllocation?.amount).toBe('200.00');
      }
    });

    it('should not calculate allocations when amount is invalid', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setAmount('-1000');
        result.current.actions.updateStockPercentage(0, '60');
        result.current.actions.updateStockPercentage(1, '40');
      });

      await waitFor(() => {
        expect(result.current.state.allocations).toBeNull();
      });
    });

    it('should not calculate allocations when percentages are invalid', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setAmount('1000');
        result.current.actions.updateStockPercentage(0, '50');
        result.current.actions.updateStockPercentage(1, '30');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.percentages).toBeDefined();
      });

      expect(result.current.state.allocations).toBeNull();
    });
  });

  describe('setMode', () => {
    it('should switch between deposit and rebalance modes', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      expect(result.current.state.mode).toBe('deposit');

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      expect(result.current.state.mode).toBe('rebalance');

      act(() => {
        result.current.actions.setMode('deposit');
      });

      expect(result.current.state.mode).toBe('deposit');
    });
  });
});

describe('useCalculator - Rebalance Mode', () => {
  const mockUser = null as User | null;
  const mockStocks: Stock[] = [];
  const mockSetStocks = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    // Mock stock price API
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/stock/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ price: 100 }),
        } as Response);
      }
      if (url.includes('finnhub.io')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: [{ description: 'Test Company' }] }),
        } as Response);
      }
      return Promise.reject(new Error('Unexpected URL'));
    });
  });

  describe('Initial State', () => {
    it('should initialize with default rebalance stocks', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      expect(result.current.state.rebalanceStocks).toHaveLength(2);
      expect(result.current.state.rebalanceStocks[0].name).toBe('FZROX');
      expect(result.current.state.rebalanceStocks[1].name).toBe('FZILX');
    });

    it('should initialize with empty current positions', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      expect(result.current.state.currentPositions).toHaveLength(0);
    });
  });

  describe('addCurrentPosition', () => {
    it('should add a new position when valid symbol is provided', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      const position = result.current.state.currentPositions[0];
      expect(position.symbol).toBe('AAPL');
      expect(position.inputType).toBe('value');
      expect(position.value).toBe(0);
    });

    it('should not add duplicate position', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      const firstCount = result.current.state.currentPositions.length;

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(firstCount);
        expect(result.current.state.validationErrors.newPosition).toBeDefined();
      });
    });
  });

  describe('removeCurrentPosition', () => {
    it('should remove a position by index', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      act(() => {
        result.current.actions.removeCurrentPosition(0);
      });

      expect(result.current.state.currentPositions.length).toBe(0);
    });
  });

  describe('updateCurrentPosition', () => {
    it('should update position value', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      act(() => {
        result.current.actions.updateCurrentPosition(0, { value: 1000 });
      });

      expect(result.current.state.currentPositions[0].value).toBe(1000);
    });

    it('should switch between shares and value input types', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      act(() => {
        result.current.actions.updateCurrentPosition(0, { inputType: 'shares', shares: 10 });
      });

      expect(result.current.state.currentPositions[0].inputType).toBe('shares');
      expect(result.current.state.currentPositions[0].shares).toBe(10);
      expect(result.current.state.currentPositions[0].value).toBeUndefined();
    });
  });

  describe('addRebalanceStock', () => {
    it('should add a new target stock', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      const initialCount = result.current.state.rebalanceStocks.length;

      await act(async () => {
        await result.current.actions.addRebalanceStock('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.length).toBe(initialCount + 1);
      });

      const addedStock = result.current.state.rebalanceStocks.find(s => s.name === 'AAPL');
      expect(addedStock).toBeDefined();
      expect(addedStock?.percentage).toBe(0);
    });

    it('should not add duplicate target stock', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addRebalanceStock('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.some(s => s.name === 'AAPL')).toBe(true);
      });

      const firstCount = result.current.state.rebalanceStocks.length;

      await act(async () => {
        await result.current.actions.addRebalanceStock('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.length).toBe(firstCount);
        expect(result.current.state.validationErrors.newRebalanceStock).toBeDefined();
      });
    });
  });

  describe('updateRebalancePercentage', () => {
    it('should update target stock percentage', () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      act(() => {
        result.current.actions.updateRebalancePercentage(0, '60');
      });

      expect(result.current.state.rebalanceStocks[0].percentage).toBe(60);
    });

    it('should validate rebalance percentages add up to 100%', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      act(() => {
        result.current.actions.updateRebalancePercentage(0, '50');
        result.current.actions.updateRebalancePercentage(1, '30');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.rebalancePercentages).toBeDefined();
      });
    });

    it('should clear rebalance percentage error when percentages add up to 100%', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.length).toBe(2);
      });

      // Set invalid percentages
      act(() => {
        result.current.actions.updateRebalancePercentage(0, '50');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks[0].percentage).toBe(50);
      });

      act(() => {
        result.current.actions.updateRebalancePercentage(1, '30');
      });

      await waitFor(() => {
        const total = result.current.state.rebalanceStocks.reduce((sum, stock) => sum + stock.percentage, 0);
        expect(Math.abs(total - 100)).toBeGreaterThan(0.01);
        expect(result.current.state.validationErrors.rebalancePercentages).toBeDefined();
      });

      // Fix percentages
      act(() => {
        result.current.actions.updateRebalancePercentage(1, '50');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks[1].percentage).toBe(50);
        const total = result.current.state.rebalanceStocks.reduce((sum, stock) => sum + stock.percentage, 0);
        expect(Math.abs(total - 100)).toBeLessThan(0.01);
      }, { timeout: 2000 });

      await waitFor(() => {
        expect(result.current.state.validationErrors.rebalancePercentages).toBeUndefined();
      }, { timeout: 2000 });
    });
  });

  describe('calculateRebalance', () => {
    it('should calculate rebalance results when positions and targets are valid', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.length).toBeGreaterThan(0);
      });

      // Add a position
      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
      });

      // Set position value
      act(() => {
        result.current.actions.updateCurrentPosition(0, { value: 1000 });
      });

      // Wait for stock price to be fetched
      await waitFor(() => {
        expect(result.current.state.stockPrices['AAPL']).toBeDefined();
      }, { timeout: 3000 });

      // Add AAPL to target stocks if not already there
      if (!result.current.state.rebalanceStocks.some(s => s.name === 'AAPL')) {
        await act(async () => {
          await result.current.actions.addRebalanceStock('AAPL');
        });
      }

      // Set all target percentages to 100% (AAPL = 100%, others = 0 or remove)
      const aaplIndex = result.current.state.rebalanceStocks.findIndex(s => s.name === 'AAPL');
      if (aaplIndex !== -1) {
        act(() => {
          result.current.actions.updateRebalancePercentage(aaplIndex, '100');
        });
      }

      // Set other stocks to 0% to make total 100%
      result.current.state.rebalanceStocks.forEach((stock, index) => {
        if (stock.name !== 'AAPL') {
          act(() => {
            result.current.actions.updateRebalancePercentage(index, '0');
          });
        }
      });

      // Wait for rebalance calculation
      await waitFor(() => {
        expect(result.current.state.rebalanceResults).not.toBeNull();
      }, { timeout: 5000 });
    });

    it('should not calculate rebalance when percentages are invalid', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addCurrentPosition('AAPL');
      });

      act(() => {
        result.current.actions.updateCurrentPosition(0, { value: 1000 });
        result.current.actions.updateRebalancePercentage(0, '50');
        result.current.actions.updateRebalancePercentage(1, '30');
      });

      await waitFor(() => {
        expect(result.current.state.validationErrors.rebalancePercentages).toBeDefined();
      });

      expect(result.current.state.rebalanceResults).toBeNull();
    });

    it('should calculate correct buy amount when rebalancing from current to target', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await waitFor(() => {
        expect(result.current.state.rebalanceStocks.length).toBeGreaterThan(0);
      });

      // Add FZROX position with $29 value
      await act(async () => {
        await result.current.actions.addCurrentPosition('FZROX');
      });

      act(() => {
        result.current.actions.updateCurrentPosition(0, { value: 29 });
      });

      // Add FZILX position with $71 value
      await act(async () => {
        await result.current.actions.addCurrentPosition('FZILX');
      });

      act(() => {
        const fzilxIndex = result.current.state.currentPositions.findIndex(p => p.symbol === 'FZILX');
        result.current.actions.updateCurrentPosition(fzilxIndex, { value: 71 });
      });

      // Wait for stock prices to be fetched
      await waitFor(() => {
        expect(result.current.state.stockPrices['FZROX']).toBeDefined();
        expect(result.current.state.stockPrices['FZILX']).toBeDefined();
      }, { timeout: 3000 });

      // Set target percentages: FZROX 80%, FZILX 20%
      const fzroxIndex = result.current.state.rebalanceStocks.findIndex(s => s.name === 'FZROX');
      const fzilxIndex = result.current.state.rebalanceStocks.findIndex(s => s.name === 'FZILX');

      if (fzroxIndex !== -1) {
        act(() => {
          result.current.actions.updateRebalancePercentage(fzroxIndex, '80');
        });
      }

      if (fzilxIndex !== -1) {
        act(() => {
          result.current.actions.updateRebalancePercentage(fzilxIndex, '20');
        });
      }

      // Wait for rebalance calculation
      await waitFor(() => {
        expect(result.current.state.rebalanceResults).not.toBeNull();
        expect(result.current.state.rebalanceResults?.length).toBeGreaterThan(0);
      }, { timeout: 5000 });

      const results = result.current.state.rebalanceResults;
      expect(results).not.toBeNull();

      if (results) {
        const fzroxResult = results.find(r => r.name === 'FZROX');
        const fzilxResult = results.find(r => r.name === 'FZILX');

        // Total portfolio value should be $100 ($29 + $71)
        expect(result.current.state.totalPortfolioValue).toBe(100);

        // FZROX: current $29 (29%), target 80% = $80, difference should be $51 (buy)
        if (fzroxResult) {
          expect(fzroxResult.currentValue).toBe(29);
          expect(fzroxResult.targetValue).toBe(80);
          expect(fzroxResult.difference).toBe(51); // Should buy $51, not $80
          expect(fzroxResult.action).toBe('buy');
          // Shares should be calculated if price is available
          if (fzroxResult.currentPrice && fzroxResult.currentPrice > 0) {
            expect(fzroxResult.sharesToTrade).toBeGreaterThan(0);
          }
        }

        // FZILX: current $71 (71%), target 20% = $20, difference should be -$51 (sell)
        if (fzilxResult) {
          expect(fzilxResult.currentValue).toBe(71);
          expect(fzilxResult.targetValue).toBe(20);
          expect(fzilxResult.difference).toBe(-51); // Should sell $51
          expect(fzilxResult.action).toBe('sell');
          // Shares should be calculated if price is available
          if (fzilxResult.currentPrice && fzilxResult.currentPrice > 0) {
            expect(fzilxResult.sharesToTrade).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('addAssetToBoth', () => {
    it('should add asset to both positions and target stocks', async () => {
      const { result } = renderHook(() => useCalculator({
        user: mockUser,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      await act(async () => {
        await result.current.actions.addAssetToBoth('AAPL');
      });

      await waitFor(() => {
        expect(result.current.state.currentPositions.length).toBe(1);
        expect(result.current.state.rebalanceStocks.some(s => s.name === 'AAPL')).toBe(true);
      });

      expect(result.current.state.currentPositions[0].symbol).toBe('AAPL');
    });
  });

  describe('Error Handling', () => {
    describe('API Error Handling', () => {
      it.skip('should handle API failure when fetching stock info', async () => {
        // Mock fetch to reject for Finnhub API call (stock info)
        // fetchStockInfo uses Finnhub API, so we need to mock that URL
        mockFetch.mockImplementation((url: string) => {
          if (url.includes('finnhub.io')) {
            return Promise.reject(new Error('Network error'));
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ price: 100 }),
          } as Response);
        });

        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        const initialStockCount = result.current.state.currentStocks.length;

        await act(async () => {
          await result.current.actions.addStock('INVALID');
        });

        // API failure should set an error in the catch block
        await waitFor(() => {
          const hasError = result.current.state.validationErrors.newStock !== undefined;
          const stockNotAdded = result.current.state.currentStocks.length === initialStockCount;
          return hasError || stockNotAdded;
        }, { timeout: 3000 });

        // Verify error handling occurred - either error is set or stock wasn't added
        const hasError = result.current.state.validationErrors.newStock !== undefined;
        const stockNotAdded = result.current.state.currentStocks.length === initialStockCount;
        expect(hasError || stockNotAdded).toBe(true);
      });

      it('should handle API failure when fetching stock price', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ result: [{ description: 'Test Company' }] }),
          } as Response)
          .mockRejectedValueOnce(new Error('Price fetch failed'));

        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        await act(async () => {
          await result.current.actions.addStock('AAPL');
        });

        // Stock should still be added even if price fetch fails
        await waitFor(() => {
          expect(result.current.state.currentStocks.some(s => s.name === 'AAPL')).toBe(true);
        });
      });

      it('should handle abort controller cancellation', async () => {
        const abortController = new AbortController();
        abortController.abort();

        mockFetch.mockImplementation(() => {
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        });

        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        // Should handle abort gracefully
        await act(async () => {
          await result.current.actions.addStock('AAPL');
        });

        // Should not crash, may show error or handle gracefully
        expect(result.current.state.currentStocks).toBeDefined();
      });
    });

    describe('Rebalance Calculation Error Handling', () => {
      it('should handle zero portfolio value in rebalance', async () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.setMode('rebalance');
        });

        await act(async () => {
          await result.current.actions.addCurrentPosition('AAPL');
        });

        act(() => {
          result.current.actions.updateCurrentPosition(0, { value: 0 });
          result.current.actions.updateRebalancePercentage(0, '100');
        });

        // With zero portfolio value, rebalance should return null
        await waitFor(() => {
          expect(result.current.state.rebalanceResults).toBeNull();
        });
      });

      it('should handle missing stock prices in rebalance calculation', async () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.setMode('rebalance');
        });

        await act(async () => {
          await result.current.actions.addCurrentPosition('AAPL');
        });

        act(() => {
          result.current.actions.updateCurrentPosition(0, { value: 1000 });
        });

        // Stock price might be null/undefined
        await waitFor(() => {
          // Rebalance should handle missing prices gracefully
          expect(result.current.state.currentPositions.length).toBe(1);
        });
      });

      it('should handle invalid percentage values', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.updateStockPercentage(0, 'invalid');
        });

        // Should handle invalid input gracefully (parseFloat returns NaN)
        expect(result.current.state.currentStocks[0].percentage).toBe(0);
      });

      it('should handle negative percentage values', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.updateStockPercentage(0, '-10');
        });

        // Should validate and show error
        expect(result.current.state.validationErrors['stock-0']).toBeDefined();
      });

      it('should handle percentage values over 100', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.updateStockPercentage(0, '150');
        });

        // Should validate and show error
        expect(result.current.state.validationErrors['stock-0']).toBeDefined();
      });
    });

    describe('Input Validation Error Handling', () => {
      it('should handle empty amount string', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.setAmount('');
        });

        expect(result.current.state.amount).toBe('');
        expect(result.current.state.allocations).toBeNull();
      });

      it('should handle invalid amount string', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.setAmount('not-a-number');
        });

        // Should set amount but validation will fail
        expect(result.current.state.amount).toBe('not-a-number');
      });

      it('should handle removing stock at invalid index', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        const initialCount = result.current.state.currentStocks.length;

        act(() => {
          result.current.actions.removeStock(999); // Invalid index
        });

        // Should handle gracefully, no crash
        expect(result.current.state.currentStocks.length).toBe(initialCount);
      });

      it('should handle updating stock at invalid index', () => {
        const { result } = renderHook(() => useCalculator({
          user: mockUser,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        act(() => {
          result.current.actions.updateStockPercentage(999, '50'); // Invalid index
        });

        // Should handle gracefully, no crash
        expect(result.current.state.currentStocks).toBeDefined();
      });
    });

    describe('Firebase Error Handling', () => {
      it('should handle Firebase errors gracefully when user is null', () => {
        const { result } = renderHook(() => useCalculator({
          user: null,
          stocks: mockStocks,
          setStocks: mockSetStocks
        }));

        // Should work with null user (guest mode)
        expect(result.current.state.currentStocks.length).toBeGreaterThan(0);
      });

      it('should handle stock removal when user is logged in', async () => {
        const mockUserWithAuth = { uid: '123' } as User;
        const mockSetStocksWithUser = vi.fn().mockResolvedValue(undefined);

        // Mock setDoc to return a promise
        const { setDoc } = await import('firebase/firestore');
        vi.mocked(setDoc).mockResolvedValue(undefined as void);

        const { result } = renderHook(() => useCalculator({
          user: mockUserWithAuth,
          stocks: [{ name: 'AAPL', percentage: 100 }],
          setStocks: mockSetStocksWithUser
        }));

        await waitFor(() => {
          expect(result.current.state.currentStocks.length).toBeGreaterThan(0);
        });

        act(() => {
          result.current.actions.removeStock(0);
        });

        // Should call setStocks for logged-in user
        await waitFor(() => {
          expect(mockSetStocksWithUser).toHaveBeenCalled();
        }, { timeout: 2000 });
      });
    });
  });

  describe('handleSamplePortfolioChange', () => {
    it('should update stocks when valid portfolio is selected', () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.handleSamplePortfolioChange('Vanguard 3-Fund Portfolio');
      });

      // Should update stocks to Vanguard portfolio
      expect(result.current.state.currentStocks.length).toBeGreaterThan(0);
      expect(result.current.state.currentStocks.some(s => s.name === 'VTI')).toBe(true);
    });

    it('should clear validation errors when portfolio is selected', () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      // Set a validation error first
      act(() => {
        result.current.actions.updateStockPercentage(0, '150'); // Invalid percentage
      });

      act(() => {
        result.current.actions.handleSamplePortfolioChange('Vanguard 3-Fund Portfolio');
      });

      // Validation errors should be cleared
      expect(Object.keys(result.current.state.validationErrors).length).toBe(0);
    });

    it('should not update stocks when portfolio is not found', () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      const initialStocks = [...result.current.state.currentStocks];

      act(() => {
        result.current.actions.handleSamplePortfolioChange('Non-existent Portfolio');
      });

      // Stocks should remain unchanged
      expect(result.current.state.currentStocks).toEqual(initialStocks);
    });
  });

  describe('Cash handling in totalPortfolioValue', () => {
    it('should calculate total portfolio value with cash position (value input)', async () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      // Use addCurrentPosition action to add cash properly
      await act(async () => {
        await result.current.actions.addCurrentPosition('CASH');
      });

      // Update the position to have a value
      act(() => {
        const cashIndex = result.current.state.currentPositions.findIndex(p => p.symbol === 'CASH');
        if (cashIndex !== -1) {
          result.current.actions.updateCurrentPosition(cashIndex, {
            inputType: 'value',
            value: 1000
          });
        }
      });

      // Wait for state to update
      await waitFor(() => {
        const totalValue = result.current.state.totalPortfolioValue;
        expect(totalValue).toBeGreaterThanOrEqual(1000);
      }, { timeout: 2000 });
    });

    it('should calculate total portfolio value with cash position (shares input)', async () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      // Use addCurrentPosition action to add cash properly
      await act(async () => {
        await result.current.actions.addCurrentPosition('CASH');
      });

      // Update the position to have shares
      act(() => {
        const cashIndex = result.current.state.currentPositions.findIndex(p => p.symbol === 'CASH');
        if (cashIndex !== -1) {
          result.current.actions.updateCurrentPosition(cashIndex, {
            inputType: 'shares',
            shares: 500
          });
        }
      });

      // Wait for state to update
      await waitFor(() => {
        const totalValue = result.current.state.totalPortfolioValue;
        expect(totalValue).toBeGreaterThanOrEqual(500);
      }, { timeout: 2000 });
    });

    it('should handle cash with zero value', async () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      // Use addCurrentPosition action to add cash properly
      await act(async () => {
        await result.current.actions.addCurrentPosition('CASH');
      });

      // Update the position to have zero value
      act(() => {
        const cashIndex = result.current.state.currentPositions.findIndex(p => p.symbol === 'CASH');
        if (cashIndex !== -1) {
          result.current.actions.updateCurrentPosition(cashIndex, {
            inputType: 'value',
            value: 0
          });
        }
      });

      await waitFor(() => {
        const totalValue = result.current.state.totalPortfolioValue;
        expect(totalValue).toBeGreaterThanOrEqual(0);
      }, { timeout: 2000 });
    });
  });

  describe('addCashToBoth', () => {
    it('should add cash to both positions and rebalance stocks', () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      act(() => {
        result.current.actions.addCashToBoth();
      });

      // Should add cash to positions
      const cashPosition = result.current.state.currentPositions.find(p => p.symbol === 'CASH');
      expect(cashPosition).toBeDefined();
      expect(cashPosition?.companyName).toBe('Cash USD');

      // Should add cash to rebalance stocks
      const cashStock = result.current.state.rebalanceStocks.find(s => s.name === 'CASH');
      expect(cashStock).toBeDefined();
      expect(cashStock?.companyName).toBe('Cash USD');

      // Price should be set to 1.00
      expect(result.current.state.stockPrices['CASH']).toBe(1.00);
    });

    it('should not add cash if already present in positions', () => {
      const { result } = renderHook(() => useCalculator({
        user: null,
        stocks: mockStocks,
        setStocks: mockSetStocks
      }));

      act(() => {
        result.current.actions.setMode('rebalance');
      });

      act(() => {
        result.current.actions.addCashToBoth();
      });

      const initialPositionCount = result.current.state.currentPositions.length;
      const initialStockCount = result.current.state.rebalanceStocks.length;

      act(() => {
        result.current.actions.addCashToBoth();
      });

      // Should not add duplicate cash
      expect(result.current.state.currentPositions.length).toBe(initialPositionCount);
      expect(result.current.state.rebalanceStocks.length).toBe(initialStockCount);
    });
  });
});
