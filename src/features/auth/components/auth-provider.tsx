import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiAuthService } from "../api/auth-api-client";
import type { AuthSession, RegistrationInput, RegistrationResult } from "../domain/auth-service";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthSession["user"] | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegistrationInput) => Promise<RegistrationResult>;
  confirmEmail: (email: string, code: string) => Promise<void>;
  resendEmailCode: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, password: string) => Promise<void>;
  requestEmailChange: (email: string, currentPassword: string) => Promise<void>;
  confirmEmailChange: (code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiAuthService
      .getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isAuthenticated: !!session,
      login: async (email, password) => {
        const next = await apiAuthService.login(email, password);
        setSession(next);
      },
      register: (input) => apiAuthService.register(input),
      confirmEmail: async (email, code) => {
        const next = await apiAuthService.confirmEmail(email, code);
        setSession(next);
      },
      resendEmailCode: (email) => apiAuthService.resendEmailCode(email),
      requestPasswordReset: (email) => apiAuthService.requestPasswordReset(email),
      confirmPasswordReset: (token, password) =>
        apiAuthService.confirmPasswordReset(token, password),
      requestEmailChange: (email, currentPassword) =>
        apiAuthService.requestEmailChange(email, currentPassword),
      confirmEmailChange: async (code) => {
        const next = await apiAuthService.confirmEmailChange(code);
        setSession(next);
      },
      logout: async () => {
        await apiAuthService.logout();
        setSession(null);
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
