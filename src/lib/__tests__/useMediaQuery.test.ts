import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      writable: true,
    });
  });

  it('should return false when matchMedia is not available', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      writable: true,
    });

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('should return matches value from matchMedia', () => {
    const mockMatchMedia = vi.fn((query: string) => ({
      matches: query.includes('max-width: 768px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
    });

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(mockMatchMedia).toHaveBeenCalledWith('(max-width: 768px)');
    expect(result.current).toBe(true);
  });

  it('should return false when query does not match', () => {
    const mockMatchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
  });

  it('should update when media query change event fires', async () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
    const mockMatchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === 'change') changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      value: mockMatchMedia,
      writable: true,
    });

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);

    await act(async () => {
      changeHandler?.({ matches: true, media: '(max-width: 768px)' } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
  });
});
