import type { AuthProblem } from './authContext';
/** Firebase error codes → what the screen should say. Null: say nothing (they closed it). */
export function authProblemFor(code: string | undefined): AuthProblem | null {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/popup-blocked':
      return 'popup-blocked';
    case 'auth/unauthorized-domain':
      return 'unauthorized-domain';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'not-configured';
    default:
      return 'sign-in-failed';
  }
}
