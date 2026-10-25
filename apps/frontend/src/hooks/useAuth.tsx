import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '../services/api';
import {
  getCurrentUser,
  loginRequest,
  registerRequest,
  startGoogleSignIn,
  type AuthUser,
} from '../services/auth';
import { clearToken, getStoredToken, storeToken } from '../services/tokenStorage';

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(() => Boolean(getStoredToken()));

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      navigate('/login', { replace: true });
    });

    return () => setUnauthorizedHandler(null);
  }, [logout, navigate]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsInitializing(false);
      return;
    }

    let cancelled = false;

    void getCurrentUser()
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    storeToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const result = await registerRequest(email, password);
    storeToken(result.token);
    setUser(result.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const url = await startGoogleSignIn();
    window.location.assign(url);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      register,
      logout,
      loginWithGoogle,
    }),
    [user, isInitializing, login, register, logout, loginWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
