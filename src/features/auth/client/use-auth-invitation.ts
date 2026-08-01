import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AuthFormValues, InvitationPrefill } from "../domain/auth-form";

export function useAuthInvitation(
  invitationToken: string | undefined,
  form: UseFormReturn<AuthFormValues>,
  onInvalid: () => void,
  onLoaded: () => void,
) {
  useEffect(() => {
    if (!invitationToken) return;
    let active = true;
    void fetch(`/api/invitations/${encodeURIComponent(invitationToken)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("INVALID_INVITATION");
        return response.json() as Promise<InvitationPrefill>;
      })
      .then((invitation) => {
        if (!active) return;
        form.reset({
          email: invitation.invited_email,
          fullNameEn: invitation.invited_name_en,
          fullNameAr: invitation.invited_name_ar,
          gender: invitation.member_gender === "unspecified" ? undefined : invitation.member_gender,
          password: "",
          confirmPassword: "",
        });
      })
      .catch(() => active && onInvalid())
      .finally(() => active && onLoaded());
    return () => {
      active = false;
    };
  }, [form, invitationToken, onInvalid, onLoaded]);
}
