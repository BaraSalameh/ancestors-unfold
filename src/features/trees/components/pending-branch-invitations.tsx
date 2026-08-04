import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { Invitation } from "../pages/dashboard-types";

export function PendingBranchInvitations({
  invitations,
  controller,
  local,
}: {
  invitations: Invitation[];
  controller: DashboardInvitationsController;
  local: (en?: string | null, ar?: string | null) => string;
}) {
  const { t } = useI18n();
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>{t("pending_invitations")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations
          .filter(({ status }) => status === "pending")
          .map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">
                  {local(invitation.invited_name_en, invitation.invited_name_ar)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {local(invitation.branch_name_en, invitation.branch_name_ar)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={controller.invitationAction === `${invitation.id}:resend`}
                  disabled={Boolean(controller.invitationAction)}
                  onClick={() => void controller.act(invitation.id, "resend")}
                >
                  {t("resend_invitation")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={controller.invitationAction === `${invitation.id}:cancel`}
                  disabled={Boolean(controller.invitationAction)}
                  onClick={() => void controller.act(invitation.id, "cancel")}
                >
                  {t("cancel_invitation")}
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
