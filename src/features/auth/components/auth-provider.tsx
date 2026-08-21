import { useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiAuthService } from "../api/auth-api-client";
import type { AuthSession } from "../domain/auth-service";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { authSessionQueryOptions, type HydratedAuthSession } from "../api/auth-session-query";

function browserLocale(): HydratedAuthSession["locale"] {
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: HydratedAuthSession | null;
}) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    ...authSessionQueryOptions(),
    initialData: initialSession,
  });
  const session = sessionQuery.data ?? null;
  const setSession = useCallback(
    (next: AuthSession | null) => {
      queryClient.setQueryData<HydratedAuthSession | null>(
        authSessionQueryOptions().queryKey,
        (current) => (next ? { ...next, locale: current?.locale ?? browserLocale() } : null),
      );
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading: sessionQuery.isPending,
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
    [session, sessionQuery.isPending, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
