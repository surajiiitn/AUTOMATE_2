import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  beginBiometricLoginRequest,
  beginBiometricRegistrationRequest,
  loginRequest,
  meRequest,
  verifyBiometricLoginRequest,
  verifyBiometricRegistrationRequest,
} from "@/services/authService";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import { createBiometricCredential, getBiometricAssertion } from "@/lib/webauthn";
import type { User, UserRole } from "@/types/domain";

export type { User, UserRole };

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  loginWithBiometric: (email: string) => Promise<void>;
  registerBiometric: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isInitializing: boolean;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = "automate_user";
const TOKEN_KEY = "automate_token";
const BIOMETRIC_EMAIL_KEY = "automate_biometric_email";

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

  const persistSession = useCallback((authToken: string, authUser: User) => {
    setUser(authUser);
    setToken(authToken);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    localStorage.setItem(TOKEN_KEY, authToken);
    getSocket();
  }, []);

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

      persistSession(authToken, authUser);
    } catch (loginError) {
      const message = extractErrorMessage(loginError, "Unable to login");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [persistSession]);

  const loginWithBiometric = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { publicKey } = await beginBiometricLoginRequest({
        email: normalizedEmail,
      });

      const credential = await getBiometricAssertion(publicKey);
      const { token: authToken, user: authUser } = await verifyBiometricLoginRequest({
        email: normalizedEmail,
        credential,
      });

      persistSession(authToken, authUser);
      localStorage.setItem(BIOMETRIC_EMAIL_KEY, normalizedEmail);
    } catch (biometricError) {
      const message = extractErrorMessage(biometricError, "Unable to login with fingerprint");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [persistSession]);

  const registerBiometric = useCallback(async () => {
    if (!user) {
      throw new Error("Sign in before enabling fingerprint login");
    }

    setIsLoading(true);
    setError(null);

    try {
      const { publicKey } = await beginBiometricRegistrationRequest();
      const credential = await createBiometricCredential(publicKey);
      await verifyBiometricRegistrationRequest({ credential });
      localStorage.setItem(BIOMETRIC_EMAIL_KEY, user.email.toLowerCase());
    } catch (biometricError) {
      const message = extractErrorMessage(biometricError, "Unable to enable fingerprint login");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

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
      loginWithBiometric,
      registerBiometric,
      logout,
      isLoading,
      isInitializing,
      error,
      clearError,
    }),
    [
      user,
      token,
      login,
      loginWithBiometric,
      registerBiometric,
      logout,
      isLoading,
      isInitializing,
      error,
      clearError,
    ],
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
