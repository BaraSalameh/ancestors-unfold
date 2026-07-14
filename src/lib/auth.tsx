import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiAuthService } from "./api-auth-service";
import type { AuthSession, RegistrationInput } from "./auth-service";
import { importLegacyLocalStorage } from "./legacy-import";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthSession["user"] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegistrationInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiAuthService.getSession().then(async (value) => { setSession(value); if (value) await importLegacyLocalStorage(); }).catch(() => setSession(null)).finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session,
    login: async (email, password) => { const next=await apiAuthService.login(email,password); setSession(next); await importLegacyLocalStorage(); },
    register: async (input) => { const next=await apiAuthService.register(input); setSession(next); await importLegacyLocalStorage(); },
    logout: async () => { await apiAuthService.logout(); setSession(null); },
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
