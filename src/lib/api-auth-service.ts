import {
  AuthError,
  type AuthService,
  type AuthSession,
  type RegistrationInput,
  type RegistrationResult,
} from "./auth-service";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (response.ok) return response.json() as Promise<T>;
  const value = (await response.json().catch(() => ({}))) as { code?: string };
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
  if (known.includes(value.code as (typeof known)[number]))
    throw new AuthError(value.code as (typeof known)[number]);
  if (value.code === "DATABASE_NOT_CONFIGURED" || response.status === 503)
    throw new AuthError("SERVICE_UNAVAILABLE");
  throw new AuthError("STORAGE_ERROR");
}

export const apiAuthService: AuthService = {
  register(input: RegistrationInput) {
    return call<RegistrationResult>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  confirmEmail(email, code) {
    return call<AuthSession>("/api/auth/email-verification/confirm", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },
  resendEmailCode(email) {
    return call<void>("/api/auth/email-verification/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  requestPasswordReset(email) {
    return call<void>("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  confirmPasswordReset(token, password) {
    return call<void>("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },
  requestEmailChange(email, currentPassword) {
    return call<void>("/api/profile/email-change/request", {
      method: "POST",
      body: JSON.stringify({ email, currentPassword }),
    });
  },
  confirmEmailChange(code) {
    return call<AuthSession>("/api/profile/email-change/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },
  login(email: string, password: string) {
    return call<AuthSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  logout() {
    return call<void>("/api/auth/logout", { method: "POST" });
  },
  getSession() {
    return call<AuthSession | null>("/api/auth/session");
  },
};
