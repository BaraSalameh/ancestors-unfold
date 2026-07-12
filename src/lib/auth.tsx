import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserAuthService } from "./browser-auth-service";
import type { AuthSession, RegistrationInput } from "./auth-service";

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
    browserAuthService.getSession().then(setSession).finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session,
    login: async (email, password) => setSession(await browserAuthService.login(email, password)),
    register: async (input) => setSession(await browserAuthService.register(input)),
    logout: async () => { await browserAuthService.logout(); setSession(null); },
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
