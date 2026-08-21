import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { validatedApiRequest } from "@/shared/api/client";
import { invitationRegistrationValues, type AuthFormValues } from "../domain/auth-form";

const invitationPrefillSchema = z
  .object({
    valid: z.literal(true),
    invited_email: z.string().email(),
    invited_name_en: z.string(),
    invited_name_ar: z.string(),
    member_gender: z.enum(["male", "female"]),
  })
  .passthrough();

export function useAuthInvitation(
  invitationToken: string | undefined,
  form: UseFormReturn<AuthFormValues>,
  onInvalid: () => void,
  onLoaded: () => void,
) {
  useEffect(() => {
    if (!invitationToken) return;
    let active = true;
    void validatedApiRequest(
      invitationPrefillSchema,
      `/api/invitations/${encodeURIComponent(invitationToken)}`,
    )
      .then((invitation) => {
        if (!active) return;
        form.reset(invitationRegistrationValues(invitation));
      })
      .catch(() => active && onInvalid())
      .finally(() => active && onLoaded());
    return () => {
      active = false;
    };
  }, [form, invitationToken, onInvalid, onLoaded]);
}
