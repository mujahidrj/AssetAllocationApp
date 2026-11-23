import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSignInWithPopup = vi.hoisted(() => vi.fn());
const mockOnAuthStateChanged = vi.hoisted(() =>
  vi.fn((callback: (user: null) => void) => {
    callback(null);
    return () => {};
  })
);

vi.mock('../firebase', () => ({
  auth: {
    onAuthStateChanged: mockOnAuthStateChanged,
  },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(() => ({
    setCustomParameters: vi.fn(),
  })),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  signOut: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  FirebaseError: class FirebaseError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
      this.name = 'FirebaseError';
    }
  },
}));

// Use real useAuth so we get context from AuthProvider (global mocks replace it)
vi.mock('../useAuth', async (importOriginal) => ({
  useAuth: (await importOriginal<typeof import('../useAuth')>()).useAuth,
}));

import { AuthProvider } from '../auth';
import { useAuth } from '../useAuth';

function TestComponent() {
  const { signInWithGoogle, problem } = useAuth();
  return (
    <>
      <button onClick={() => signInWithGoogle()}>Sign In</button>
      <output>{problem ?? 'none'}</output>
    </>
  );
}

async function signInFailingWith(code: string) {
  mockSignInWithPopup.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
  render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
  await userEvent.setup().click(screen.getByRole('button', { name: /sign in/i }));
  expect(mockSignInWithPopup).toHaveBeenCalled();
  return screen.getByRole('status');
}

describe('AuthProvider', () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says nothing when the person closes the sign-in window', async () => {
    expect(await signInFailingWith('auth/popup-closed-by-user')).toHaveTextContent('none');
  });

  it.each([
    ['auth/popup-blocked', 'popup-blocked'],
    ['auth/unauthorized-domain', 'unauthorized-domain'],
    ['auth/network-request-failed', 'network'],
    ['auth/configuration-not-found', 'not-configured'],
    ['auth/internal-error', 'sign-in-failed'],
  ])('reports %s as %s for the screen to explain, never with alert()', async (code, problem) => {
    expect(await signInFailingWith(code)).toHaveTextContent(problem);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
