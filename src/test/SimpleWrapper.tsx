import { ReactNode } from 'react';
import { AuthContext } from '../lib/authContext';
import type { AuthContextType } from '../lib/authContext';

// Simple wrapper that provides a mock auth context
// This avoids needing the real AuthProvider which tries to connect to Firebase
const mockAuthContext: AuthContextType = {
  user: null,
  loading: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
};

export function SimpleWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={mockAuthContext}>
      {children}
    </AuthContext.Provider>
  );
}
