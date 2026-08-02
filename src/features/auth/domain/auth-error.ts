import { AuthError } from "./auth-service";

const AUTH_ERROR_KEYS: Record<string, string> = {
  EMAIL_EXISTS: "email_exists",
  INVALID_CREDENTIALS: "invalid_credentials",
  INVALID_INPUT: "invalid_auth_input",
  RATE_LIMITED: "auth_rate_limited",
  EMAIL_NOT_VERIFIED: "email_not_verified",
  INVALID_OR_EXPIRED_CODE: "invalid_or_expired_code",
  RESEND_TOO_SOON: "resend_too_soon",
  DELIVERY_FAILED: "delivery_failed",
  INVALID_INVITATION: "invalid_invitation",
  INVITEE_ALREADY_REGISTERED: "existing_user_invitation_error",
  SERVICE_UNAVAILABLE: "auth_service_unavailable",
};

export function authErrorKey(error: unknown): string {
  return error instanceof AuthError ? (AUTH_ERROR_KEYS[error.code] ?? "auth_error") : "auth_error";
}
