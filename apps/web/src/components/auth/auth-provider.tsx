"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

type MeResponse = {
  user: AuthUser;
  organizations: AuthOrganization[];
  sessionId: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  organizations: AuthOrganization[];
  sessionId: string | null;
  loading: boolean;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<AuthOrganization[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const me = await apiFetch<MeResponse>("/api/v1/auth/me");
      setUser(me.user);
      setOrganizations(me.organizations);
      setSessionId(me.sessionId);
      return true;
    } catch {
      setUser(null);
      setOrganizations([]);
      setSessionId(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Clear local state even if the server call fails.
    }
    setUser(null);
    setOrganizations([]);
    setSessionId(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, organizations, sessionId, loading, refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
