import { vi } from 'vitest'

// Mock Firebase to prevent initialization in CI (no valid API key in test env)
vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {},
}));

const authMock = vi.hoisted(() => ({
  user: null,
  loading: false,
  signInWithGoogle: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  problem: null,
  clearProblem: () => {},
}));

vi.mock('../lib/useAuth', () => ({
  useAuth: () => authMock,
}));
