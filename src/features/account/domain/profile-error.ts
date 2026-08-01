import { AuthError } from "@/features/auth";
import type { TranslationKey } from "@/locales";

type Translate = (key: TranslationKey) => string;

const messages: Record<string, TranslationKey> = {
  EMAIL_EXISTS: "email_exists",
  INCORRECT_PASSWORD: "incorrect_password",
  CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN: "contributor_email_change_forbidden",
  INVALID_OR_EXPIRED_CODE: "invalid_or_expired_code",
  DELIVERY_FAILED: "delivery_failed",
};

export function profileErrorMessage(error: unknown, t: Translate) {
  return t(error instanceof AuthError ? (messages[error.code] ?? "auth_error") : "auth_error");
}
