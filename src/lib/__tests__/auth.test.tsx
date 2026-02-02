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
  const { signInWithGoogle } = useAuth();
  return (
    <button onClick={() => signInWithGoogle()}>Sign In</button>
  );
}

describe('AuthProvider', () => {
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not show alert when user closes popup (auth/popup-closed-by-user)', async () => {
    mockSignInWithPopup.mockRejectedValueOnce(
      Object.assign(new Error('Popup closed'), { code: 'auth/popup-closed-by-user' })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockSignInWithPopup).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('should show alert when auth/configuration-not-found error occurs', async () => {
    mockSignInWithPopup.mockRejectedValueOnce(
      Object.assign(new Error('Config not found'), { code: 'auth/configuration-not-found' })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(alertSpy).toHaveBeenCalledWith(
      'Authentication is not properly configured. Please contact the administrator.'
    );
  });

  it('should show generic alert for other auth errors', async () => {
    mockSignInWithPopup.mockRejectedValueOnce(
      Object.assign(new Error('Network error'), { code: 'auth/network-request-failed' })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(alertSpy).toHaveBeenCalledWith(
      'An error occurred while signing in. Please try again later.'
    );
  });
});
