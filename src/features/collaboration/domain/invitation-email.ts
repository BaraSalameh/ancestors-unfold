import { z } from "zod";
import type { TranslationKey } from "@/locales";

const invitationEmail = z.string().trim().email().max(320);

export function isValidInvitationEmail(value: string): boolean {
  return invitationEmail.safeParse(value).success;
}

export function invitationErrorKey(code: string | undefined): TranslationKey {
  if (code === "INVALID_INPUT") return "invalid_email_address";
  if (code === "INVITEE_ALREADY_REGISTERED") return "existing_user_invitation_error";
  if (code === "BRANCH_ALREADY_ASSIGNED") return "branch_already_has_contributor";
  return "auth_error";
}
