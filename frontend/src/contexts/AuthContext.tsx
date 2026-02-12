import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { loginRequest, meRequest } from "@/services/authService";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import type { User, UserRole } from "@/types/domain";

export type { User, UserRole };

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = "automate_user";
const TOKEN_KEY = "automate_token";

const getStoredUser = (): User | null => {
  const rawUser = localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as User;
  } catch (_error) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        setIsInitializing(false);
        return;
      }

      try {
        const currentUser = await meRequest();
        setUser(currentUser);
        setToken(storedToken);
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
        getSocket();
      } catch (_error) {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken(null);
        disconnectSocket();
      } finally {
        setIsInitializing(false);
      }
    };

    bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string, role: UserRole) => {
    setIsLoading(true);
    setError(null);

    try {
      const { token: authToken, user: authUser } = await loginRequest({
        email,
        password,
        role,
      });

      setUser(authUser);
      setToken(authToken);
      localStorage.setItem(USER_KEY, JSON.stringify(authUser));
      localStorage.setItem(TOKEN_KEY, authToken);
      getSocket();
    } catch (loginError) {
      const message = extractErrorMessage(loginError, "Unable to login");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setError(null);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    disconnectSocket();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
      isLoading,
      isInitializing,
      error,
      clearError,
    }),
    [user, token, login, logout, isLoading, isInitializing, error, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
};
