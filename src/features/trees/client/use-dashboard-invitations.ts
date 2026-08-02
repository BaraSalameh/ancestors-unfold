import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";

export function useDashboardInvitations(reload: () => Promise<void>) {
  const { t } = useI18n();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationAction, setInvitationAction] = useState<string>();
  const act = async (id: string, action: "cancel" | "resend") => {
    if (invitationAction) return;
    setInvitationAction(`${id}:${action}`);
    try {
      const response = await fetch(`/api/invitations/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        toast.error(body.code === "RESEND_TOO_SOON" ? t("resend_too_soon") : t("auth_error"));
        return;
      }
      toast.success(t(action === "cancel" ? "invitation_cancelled" : "invitation_resent"));
      await reload();
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
