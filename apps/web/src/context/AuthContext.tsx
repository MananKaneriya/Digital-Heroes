import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUserDTO } from "@digital-heroes/shared";
import { api, ApiClientError, getSession, setSession } from "../api/client";

interface AuthContextValue {
  user: AuthUserDTO | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDTO;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!getSession()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await api.get<AuthUserDTO>("/api/auth/me");
        if (!cancelled) setUser(me);
      } catch {
        setSession(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const data = await api.post<SessionResponse>("/api/auth/login", { email, password }, { auth: false });
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setUser(data.user);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to log in right now.");
      throw err;
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName: string) => {
    setError(null);
    try {
      const data = await api.post<SessionResponse>("/api/auth/signup", { email, password, fullName }, { auth: false });
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      setUser(data.user);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to create your account right now.");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Best-effort: proceed to clear local session regardless of server response.
    }
    setSession(null);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () => ({ user, isLoading, error, login, signup, logout, clearError }),
    [user, isLoading, error, login, signup, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
