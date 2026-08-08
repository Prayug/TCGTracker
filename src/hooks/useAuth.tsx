import { useState, useEffect, createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { authService, User, AuthResponse } from '../services/authService';
import {
  saveGuestSnapshot,
  syncUserDataOnLogin,
  handleLogoutLocalData,
  type UserDataSyncResult,
} from '../services/userDataSyncService';
import type { AuthModalMode } from '../components/auth/SignInModal';

export type RegisterResult =
  | (UserDataSyncResult & { requiresVerification?: false })
  | {
      requiresVerification: true;
      emailSent: boolean;
      verifyUrl?: string;
      message: string;
      email: string;
    };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  setAuthModalMode: (mode: AuthModalMode) => void;
  login: (email: string, password: string) => Promise<UserDataSyncResult>;
  register: (username: string, email: string, password: string) => Promise<RegisterResult>;
  verifyEmail: (token: string) => Promise<UserDataSyncResult>;
  resendVerification: (email: string) => Promise<{
    emailSent?: boolean;
    verifyUrl?: string;
    message?: string;
  }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');

  const openAuthModal = useCallback((mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (cancelled) return;
        setUser(currentUser);
        if (currentUser) {
          try {
            await syncUserDataOnLogin();
          } catch (err) {
            console.error('User data sync failed on boot:', err);
          }
        }
      } catch (error) {
        console.error('Failed to get current user:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      void (async () => {
        try {
          await authService.logout();
        } catch {
          /* ignore */
        }
        handleLogoutLocalData();
        setUser(null);
      })();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  const finishSignedIn = useCallback(async (signedInUser: User): Promise<UserDataSyncResult> => {
    setUser(signedInUser);
    try {
      return await syncUserDataOnLogin();
    } catch (err) {
      console.error('Post-login sync failed:', err);
      return {
        vault: 'error',
        watchlists: 'error',
        alerts: 'error',
        message: 'Signed in, but cloud sync failed — retry from Settings',
      };
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      saveGuestSnapshot();
      const response = await authService.login(email, password);
      return finishSignedIn(response.user);
    },
    [finishSignedIn]
  );

  const register = useCallback(
    async (username: string, email: string, password: string): Promise<RegisterResult> => {
      saveGuestSnapshot();
      const response: AuthResponse = await authService.register(username, email, password);

      // Registration never signs you in — always wait for email verification.
      setUser(null);
      return {
        requiresVerification: true,
        emailSent: Boolean(response.emailSent),
        verifyUrl: response.verifyUrl,
        email,
        message:
          response.message ||
          (response.emailSent
            ? 'Check your email for a verification link.'
            : 'Account created. Configure SMTP to receive the verification email.'),
      };
    },
    []
  );

  const verifyEmail = useCallback(
    async (token: string) => {
      saveGuestSnapshot();
      const response = await authService.verifyEmail(token);
      return finishSignedIn(response.user);
    },
    [finishSignedIn]
  );

  const resendVerification = useCallback(async (email: string) => {
    return authService.resendVerification(email);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    handleLogoutLocalData();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      setAuthModalMode,
      login,
      register,
      verifyEmail,
      resendVerification,
      logout,
      refreshUser,
    }),
    [
      user,
      isLoading,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      login,
      register,
      verifyEmail,
      resendVerification,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
