import { useState, useEffect, createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { authService, User } from '../services/authService';
import { syncVaultOnLogin } from '../services/vaultSyncService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (cancelled) return;
        setUser(currentUser);
        if (currentUser) {
          try {
            await syncVaultOnLogin();
          } catch (err) {
            console.error('Vault sync failed on login:', err);
          }
        }
      } catch (error) {
        console.error('Failed to get current user:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initAuth();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login(email, password);
    try {
      await syncVaultOnLogin();
    } catch (err) {
      // Rollback user state on vault sync failure
      setUser(null);
      throw err;
    }
    setUser(response.user);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const response = await authService.register(username, email, password);
    try {
      await syncVaultOnLogin();
    } catch (err) {
      setUser(null);
      throw err;
    }
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
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
      isAdmin: !!user?.isAdmin,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
