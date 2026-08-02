import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiAuthService } from "../api/auth-api-client";
import type { AuthSession } from "../domain/auth-service";
import { AuthContext, type AuthContextValue } from "./auth-context";

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
      updateProfile: async (fullNameEn, fullNameAr, gender) => {
        const next = await apiAuthService.updateProfile(fullNameEn, fullNameAr, gender);
        setSession(next);
      },
      requestContributorAccountDeletionCode: (confirmation) =>
        apiAuthService.requestContributorAccountDeletionCode(confirmation),
      deleteContributorAccount: async (confirmation, code) => {
        await apiAuthService.deleteContributorAccount(confirmation, code);
        setSession(null);
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
