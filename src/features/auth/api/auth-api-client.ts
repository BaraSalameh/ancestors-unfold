import {
  AuthError,
  type AuthService,
  type AuthSession,
  type RegistrationInput,
  type RegistrationResult,
} from "../domain/auth-service";
import { z } from "zod";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";

const authSessionSchema = z
  .object({
    user: z
      .object({
        id: z.string().min(1),
        email: z.string().email(),
        fullNameEn: z.string(),
        fullNameAr: z.string(),
        gender: z.enum(["male", "female"]).nullable(),
      })
      .strict(),
    createdAt: z.string().datetime(),
    currentTree: z
      .object({
        id: z.string().min(1),
        nameEn: z.string().nullable(),
        nameAr: z.string().nullable(),
        role: z.enum(["owner", "contributor"]),
      })
      .strict()
      .nullable(),
  })
  .strict();
const registrationResultSchema = z
  .object({ verificationRequired: z.literal(true), email: z.string().email() })
  .strict();
const successSchema = z.object({ ok: z.literal(true) }).passthrough();
const deletionCodeSchema = z.object({ expiresAt: z.string().datetime() }).strict();

async function call<T>(
  schema: z.ZodType<T>,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const known = [
    "EMAIL_EXISTS",
    "INVALID_CREDENTIALS",
    "INCORRECT_PASSWORD",
    "CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN",
    "INVALID_INPUT",
    "RATE_LIMITED",
    "EMAIL_NOT_VERIFIED",
    "INVALID_OR_EXPIRED_CODE",
    "INVALID_OR_EXPIRED_TOKEN",
    "RESEND_TOO_SOON",
    "DELIVERY_FAILED",
    "INVALID_INVITATION",
  ] as const;
  try {
    return await validatedApiRequest(schema, path, { method, body });
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

async function callForSuccess(path: string, method: string, body?: unknown): Promise<void> {
  await call(successSchema, path, method, body);
}

export const apiAuthService: AuthService = {
  register(input: RegistrationInput) {
    return call<RegistrationResult>(registrationResultSchema, "/api/auth/register", "POST", input);
  },
  confirmEmail(email, code) {
    return call<AuthSession>(authSessionSchema, "/api/auth/email-verification/confirm", "POST", {
      email,
      code,
    });
  },
  resendEmailCode(email) {
    return callForSuccess("/api/auth/email-verification/resend", "POST", { email });
  },
  requestPasswordReset(email) {
    return callForSuccess("/api/auth/password-reset/request", "POST", { email });
  },
  confirmPasswordReset(token, password) {
    return callForSuccess("/api/auth/password-reset/confirm", "POST", { token, password });
  },
  requestEmailChange(email, currentPassword) {
    return callForSuccess("/api/profile/email-change/request", "POST", {
      email,
      currentPassword,
    });
  },
  confirmEmailChange(code) {
    return call<AuthSession>(authSessionSchema, "/api/profile/email-change/confirm", "POST", {
      code,
    });
  },
  updateProfile(fullNameEn, fullNameAr, gender) {
    return call<AuthSession>(authSessionSchema, "/api/profile", "PATCH", {
      fullNameEn,
      fullNameAr,
      gender,
    });
  },
  requestContributorAccountDeletionCode(confirmation) {
    return call(deletionCodeSchema, "/api/profile/deletion-code/request", "POST", { confirmation });
  },
  deleteContributorAccount(confirmation, code) {
    return callForSuccess("/api/profile", "DELETE", { confirmation, code });
  },
  login(email: string, password: string) {
    return call<AuthSession>(authSessionSchema, "/api/auth/login", "POST", { email, password });
  },
  logout() {
    return callForSuccess("/api/auth/logout", "POST");
  },
  getSession() {
    return call<AuthSession | null>(authSessionSchema.nullable(), "/api/auth/session");
  },
};
