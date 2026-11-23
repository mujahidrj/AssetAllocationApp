import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { type FirebaseError } from 'firebase/app';
import { auth } from './firebase';
import { AuthContext, type AuthProblem } from './authContext';
import { authProblemFor } from './authProblem';
import { reportTiming, startSignInTiming } from './timing';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<AuthProblem | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
    });
    setProblem(null);
    const timing = startSignInTiming();
    try {
      await signInWithPopup(auth, provider);
      reportTiming(timing.finish('signed-in'));
    } catch (error) {
      const code = (error as FirebaseError)?.code;
      reportTiming(timing.finish(typeof code === 'string' ? code.replace(/^auth\//, '') : 'error'));
      const next = authProblemFor(code);
      if (next) console.error('Error signing in with Google:', error);
      setProblem(next);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      setProblem('sign-out-failed');
    }
  };

  const clearProblem = useCallback(() => setProblem(null), []);

  const value = {
    user,
    loading,
    signInWithGoogle,
    signOut,
    problem,
    clearProblem,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
