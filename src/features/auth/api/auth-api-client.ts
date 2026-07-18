import {
  AuthError,
  type AuthService,
  type AuthSession,
  type RegistrationInput,
  type RegistrationResult,
} from "../domain/auth-service";
import { ApiClientError, apiRequest } from "@/shared/api/client";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const known = [
    "EMAIL_EXISTS",
    "INVALID_CREDENTIALS",
    "INVALID_INPUT",
    "RATE_LIMITED",
    "EMAIL_NOT_VERIFIED",
    "INVALID_OR_EXPIRED_CODE",
    "INVALID_OR_EXPIRED_TOKEN",
    "RESEND_TOO_SOON",
    "DELIVERY_FAILED",
  ] as const;
  try {
    return await apiRequest<T>(path, { method, body });
  } catch (error) {
    if (!(error instanceof ApiClientError)) throw new AuthError("STORAGE_ERROR");
    if (known.includes(error.code as (typeof known)[number])) {
      throw new AuthError(error.code as (typeof known)[number]);
    }
    if (error.code === "DATABASE_NOT_CONFIGURED" || error.status === 503) {
      throw new AuthError("SERVICE_UNAVAILABLE");
    }
    throw new AuthError("STORAGE_ERROR");
  }
}

export const apiAuthService: AuthService = {
  register(input: RegistrationInput) {
    return call<RegistrationResult>("/api/auth/register", "POST", input);
  },
  confirmEmail(email, code) {
    return call<AuthSession>("/api/auth/email-verification/confirm", "POST", { email, code });
  },
  resendEmailCode(email) {
    return call<void>("/api/auth/email-verification/resend", "POST", { email });
  },
  requestPasswordReset(email) {
    return call<void>("/api/auth/password-reset/request", "POST", { email });
  },
  confirmPasswordReset(token, password) {
    return call<void>("/api/auth/password-reset/confirm", "POST", { token, password });
  },
  requestEmailChange(email, currentPassword) {
    return call<void>("/api/profile/email-change/request", "POST", { email, currentPassword });
  },
  confirmEmailChange(code) {
    return call<AuthSession>("/api/profile/email-change/confirm", "POST", { code });
  },
  login(email: string, password: string) {
    return call<AuthSession>("/api/auth/login", "POST", { email, password });
  },
  logout() {
    return call<void>("/api/auth/logout", "POST");
  },
  getSession() {
    return call<AuthSession | null>("/api/auth/session");
  },
};
