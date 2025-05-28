import { vi } from 'vitest'

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/useStocks', () => ({
  useStocks: () => ({
    stocks: [
      { name: "VTSAX", percentage: 60 },
      { name: "VOO", percentage: 40 },
    ],
    setStocks: vi.fn(),
    loading: false,
  }),
}));
