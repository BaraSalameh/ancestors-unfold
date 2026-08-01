import { createContext, useContext } from "react";
import type { AuthSession, RegistrationInput, RegistrationResult } from "../domain/auth-service";

export type AuthContextValue = {
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
  updateProfile: (
    fullNameEn: string,
    fullNameAr: string,
    gender: AuthSession["user"]["gender"],
  ) => Promise<void>;
  requestContributorAccountDeletionCode: (confirmation: "DELETE") => Promise<{ expiresAt: string }>;
  deleteContributorAccount: (confirmation: "DELETE", code: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
