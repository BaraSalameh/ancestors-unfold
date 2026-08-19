import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import { useI18n } from "@/shared/i18n";
import { successResponseSchema } from "./response-schemas";

export function useDashboardInvitations(reload: () => Promise<void>) {
  const { t } = useI18n();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationAction, setInvitationAction] = useState<string>();
  const act = async (id: string, action: "cancel" | "resend") => {
    if (invitationAction) return;
    setInvitationAction(`${id}:${action}`);
    try {
      await validatedApiRequest(successResponseSchema, `/api/invitations/${id}/${action}`, {
        method: "POST",
      });
      toast.success(t(action === "cancel" ? "invitation_cancelled" : "invitation_resent"));
      await reload();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === "RESEND_TOO_SOON"
          ? t("resend_too_soon")
          : t("auth_error"),
      );
    } finally {
      setInvitationAction(undefined);
    }
  };
  const sent = async () => {
    toast.success(t("invitation_sent"));
    setInviteOpen(false);
    await reload();
  };
  return { inviteOpen, setInviteOpen, invitationAction, act, sent };
}

export type DashboardInvitationsController = ReturnType<typeof useDashboardInvitations>;
