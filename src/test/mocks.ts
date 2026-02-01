import { vi } from 'vitest'

// Mock Firebase to prevent initialization in CI (no valid API key in test env)
vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('../lib/useAuth', () => ({
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
