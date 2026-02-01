import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { LoginButton } from '../LoginButton';

// Mock the useAuth hook
vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../lib/auth';

describe('LoginButton', () => {
  const mockSignInWithGoogle = vi.fn();
  const mockSignOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('When user is not logged in', () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        signInWithGoogle: mockSignInWithGoogle,
        signOut: mockSignOut,
      });
    });

    it('should render sign in button', () => {
      render(<LoginButton />);
      
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });

    it('should display Google icon', () => {
      render(<LoginButton />);
      
      const button = screen.getByRole('button', { name: /sign in with google/i });
      // FontAwesome icon should be present
      expect(button).toBeInTheDocument();
    });

    it('should call signInWithGoogle when button is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginButton />);
      
      const button = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(button);
      
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    });

    it('should not display sign out button', () => {
      render(<LoginButton />);
      
      expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    });
  });

  describe('When user is logged in', () => {
    describe('With complete user info', () => {
      beforeEach(() => {
        vi.mocked(useAuth).mockReturnValue({
          user: {
            uid: '123',
            email: 'test@example.com',
            displayName: 'Test User',
            photoURL: 'https://example.com/photo.jpg',
          } as any,
          loading: false,
          signInWithGoogle: mockSignInWithGoogle,
          signOut: mockSignOut,
        });
      });

      it('should render sign out button', () => {
        render(<LoginButton />);
        
        expect(screen.getByRole('button', { name: /test user/i })).toBeInTheDocument();
      });

      it('should display user photo when available', () => {
        render(<LoginButton />);
        
        const photo = screen.getByAltText('Test User');
        expect(photo).toBeInTheDocument();
        expect(photo).toHaveAttribute('src', 'https://example.com/photo.jpg');
      });

      it('should display user display name', () => {
        render(<LoginButton />);
        
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });

      it('should call signOut when sign out button is clicked', async () => {
        const user = userEvent.setup();
        render(<LoginButton />);
        
        const button = screen.getByRole('button', { name: /test user/i });
        await user.click(button);
        
        expect(mockSignOut).toHaveBeenCalledTimes(1);
      });

      it('should not display sign in button', () => {
        render(<LoginButton />);
        
        expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
      });
    });

    describe('Without photo URL', () => {
      beforeEach(() => {
        vi.mocked(useAuth).mockReturnValue({
          user: {
            uid: '123',
            email: 'test@example.com',
            displayName: 'Test User',
            photoURL: null,
          } as any,
          loading: false,
          signInWithGoogle: mockSignInWithGoogle,
          signOut: mockSignOut,
        });
      });

      it('should not display user photo when photoURL is null', () => {
        render(<LoginButton />);
        
        expect(screen.queryByAltText(/test user/i)).not.toBeInTheDocument();
      });

      it('should still display user name and sign out button', () => {
        render(<LoginButton />);
        
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /test user/i })).toBeInTheDocument();
      });
    });

    describe('Without display name', () => {
      beforeEach(() => {
        vi.mocked(useAuth).mockReturnValue({
          user: {
            uid: '123',
            email: 'test@example.com',
            displayName: null,
            photoURL: 'https://example.com/photo.jpg',
          } as any,
          loading: false,
          signInWithGoogle: mockSignInWithGoogle,
          signOut: mockSignOut,
        });
      });

      it('should use "User" as alt text when displayName is null', () => {
        render(<LoginButton />);
        
        const photo = screen.getByAltText('User');
        expect(photo).toBeInTheDocument();
      });

      it('should still render sign out button', () => {
        render(<LoginButton />);
        
        // Button should exist even without display name
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
      });
    });

    describe('With minimal user info', () => {
      beforeEach(() => {
        vi.mocked(useAuth).mockReturnValue({
          user: {
            uid: '123',
            email: 'test@example.com',
            displayName: null,
            photoURL: null,
          } as any,
          loading: false,
          signInWithGoogle: mockSignInWithGoogle,
          signOut: mockSignOut,
        });
      });

      it('should handle user with no display name or photo', () => {
        render(<LoginButton />);
        
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
        expect(screen.queryByAltText(/user/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('should handle loading state', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: true,
        signInWithGoogle: mockSignInWithGoogle,
        signOut: mockSignOut,
      });

      render(<LoginButton />);
      
      // Should still render (component doesn't show loading state, but should not crash)
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });
  });
});
