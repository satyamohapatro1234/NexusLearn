"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const API = "http://localhost:8001";

export interface NexusUser {
  id: string;
  name: string;
  email: string;
  language: string;
  setup_done: boolean;
  llm_provider?: string;
  llm_model?: string;
}

interface AuthCtx {
  user: NexusUser | null;
  token: string | null;
  isLoading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  updateProfile: (updates: Partial<NexusUser & { llm_base_url?: string; llm_api_key?: string; setup_done?: boolean }>) => Promise<void>;
  markSetupDone: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<NexusUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bootstrap from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("nexus_token");
    if (!storedToken) { setIsLoading(false); return; }
    // Validate token with backend
    fetch(`${API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) { setUser(data); setToken(storedToken); }
        else localStorage.removeItem("nexus_token");
      })
      .catch(() => localStorage.removeItem("nexus_token"))
      .finally(() => setIsLoading(false));
  }, []);

  const _persist = (tk: string, u: NexusUser) => {
    localStorage.setItem("nexus_token", tk);
    document.cookie = `nexus_token=${tk}; path=/; max-age=2592000; SameSite=Lax`;
    setToken(tk);
    setUser(u);
    if (u.setup_done) {
      document.cookie = `nexus_setup_done=true; path=/; max-age=2592000; SameSite=Lax`;
    }
  };

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const r = await fetch(`${API}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Registration failed");
    _persist(data.token, data.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "Login failed");
    _persist(data.token, data.user);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("nexus_token");
    localStorage.removeItem("nexus_setup_done");
    document.cookie = "nexus_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "nexus_setup_done=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
    setToken(null);
  }, []);

  const updateProfile = useCallback(async (updates: object) => {
    const tk = localStorage.getItem("nexus_token");
    if (!tk) return;
    await fetch(`${API}/api/v1/auth/update-profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
      body: JSON.stringify(updates),
    });
    setUser((prev) => prev ? { ...prev, ...updates } as NexusUser : prev);
  }, []);

  const markSetupDone = useCallback(async () => {
    await updateProfile({ setup_done: true });
    localStorage.setItem("nexus_setup_done", "true");
    document.cookie = `nexus_setup_done=true; path=/; max-age=2592000; SameSite=Lax`;
    setUser((prev) => prev ? { ...prev, setup_done: true } : prev);
  }, [updateProfile]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signUp, signIn, signOut, updateProfile, markSetupDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
