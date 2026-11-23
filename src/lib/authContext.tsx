import { createContext } from 'react';
import type { User } from 'firebase/auth';

/** Why the last sign-in or sign-out didn't work, in terms the screen can explain. */
export type AuthProblem = 'popup-blocked' | 'unauthorized-domain' | 'network' | 'not-configured' | 'sign-in-failed' | 'sign-out-failed';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The last problem, until it's cleared or the next attempt. */
  problem: AuthProblem | null;
  clearProblem: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
