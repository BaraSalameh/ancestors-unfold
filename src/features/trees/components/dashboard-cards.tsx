import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, MailPlus, RotateCw, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n";
import { activityDescription, type ActivityItem } from "../domain/activity-label";
import type { DashboardData, OwnershipTransfer } from "../pages/dashboard-types";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { ContributorRemovalController } from "../client/use-contributor-removal";
import { AuthenticityRoadmap } from "./authenticity-roadmap";
import { DashboardFact } from "./dashboard-components";

type InvitationController = DashboardInvitationsController;
type TransferController = OwnershipTransferController;
type RemovalController = ContributorRemovalController;
type Local = (en?: string | null, ar?: string | null) => string;

export function BranchesCard({ data, local }: { data: DashboardData; local: Local }) {
  const { t } = useI18n();
  const assigned = data.branches.find((branch) => branch.id === data.tree.assigned_branch_id);
  const branches = data.tree.role === "owner" ? data.branches : assigned ? [assigned] : [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{data.tree.role === "owner" ? t("branches") : t("assigned_branch")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {branches.map((branch) => (
          <div key={branch.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{local(branch.name_en, branch.name_ar)}</p>
              <p className="text-sm text-muted-foreground">
                {t("branch_responsible", {
                  name: branch.contributor_name_en
                    ? local(branch.contributor_name_en, branch.contributor_name_ar)
                    : local(data.stats.owner_name_en, data.stats.owner_name_ar),
                })}
              </p>
            </div>
            <Badge variant={branch.status === "active" ? "default" : "secondary"}>
              {branch.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function InvitationsCard({
  data,
  controller,
  local,
}: {
  data: DashboardData;
  controller: InvitationController;
  local: Local;
}) {
  const { t } = useI18n();
  const pending = data.invitations.filter((item) => item.status === "pending");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pending_invitations")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("no_pending_invitations")}</p>
        )}
        {pending.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-medium">{local(item.invited_name_en, item.invited_name_ar)}</p>
                <p className="text-sm text-muted-foreground" dir="ltr">
                  {item.invited_email}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="outline">{item.status}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  loading={controller.invitationAction === `${item.id}:resend`}
                  disabled={Boolean(controller.invitationAction)}
                  onClick={() => void controller.act(item.id, "resend")}
                >
                  <RotateCw className="me-1 h-3.5 w-3.5" />
                  {t("resend_invitation")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={controller.invitationAction === `${item.id}:cancel`}
                  disabled={Boolean(controller.invitationAction)}
                  onClick={() => void controller.act(item.id, "cancel")}
                >
                  <X className="me-1 h-3.5 w-3.5" />
                  {t("cancel_invitation")}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ActivityCard({ activity }: { activity: ActivityItem[] }) {
  const { t, lang } = useI18n();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("latest_activity")}</CardTitle>
        <Button asChild size="icon" variant="ghost" aria-label={t("view_activity_history")}>
          <Link to="/activity">
            <Activity className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {activity.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("no_activity")}</p>
        )}
        {activity.slice(0, 5).map((row) => (
          <div key={row.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
            <Activity className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{activityDescription(row, lang, t)}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(row.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AuthenticityCard({ data, local }: { data: DashboardData; local: Local }) {
  const { t } = useI18n();
  const stats = data.stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("authenticity")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {stats.authenticity_level === "under_review" && (
          <div
            className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            role="status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">{t("under_review")}</p>
              <p className="mt-1 text-muted-foreground">
                {t(
                  stats.serious_complaints === 1
                    ? "authenticity_under_review_description_one"
                    : "authenticity_under_review_description_many",
                  { count: stats.serious_complaints },
                )}
              </p>
            </div>
          </div>
        )}
        <AuthenticityRoadmap stats={stats} />
        <p className="text-sm text-muted-foreground">{t("family_backed_explanation")}</p>
        <dl className="space-y-3 text-sm">
          <DashboardFact
            label={t("tree_owner")}
            value={local(stats.owner_name_en, stats.owner_name_ar)}
          />
          <DashboardFact label={t("serious_complaints")} value={String(stats.serious_complaints)} />
          <DashboardFact
            label={t("tree_active_since")}
            value={new Date(stats.tree_created_at).toLocaleDateString()}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

export function OwnerControlsCard({
  transfer,
  transferController,
  invitation,
  removal,
  local,
}: {
  transfer: OwnershipTransfer | null;
  transferController: TransferController;
  invitation: InvitationController;
  removal: RemovalController;
  local: Local;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("owner_controls")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full justify-start"
          variant="outline"
          onClick={() => invitation.setInviteOpen(true)}
        >
          <MailPlus className="me-2 h-4 w-4" />
          {t("invite_contributor")}
        </Button>
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={removal.removableBranches.length === 0}
          onClick={() => removal.setOpen(true)}
        >
          <Trash2 className="me-2 h-4 w-4" />
          {t("cancel_contributor_contribution")}
        </Button>
        {removal.removableBranches.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("no_active_contributors_to_remove")}</p>
        )}
        <Button
          className="w-full justify-start"
          variant="outline"
          disabled={Boolean(transfer?.verified)}
          onClick={() => transferController.setOpen(true)}
        >
          <ShieldCheck className="me-2 h-4 w-4" />
          {t(transfer && !transfer.verified ? "continue_ownership_transfer" : "transfer_ownership")}
        </Button>
        {transfer && (
          <div className="mt-4 space-y-3 rounded-lg border p-4 text-foreground">
            <p className="font-medium">{t("ownership_transfer_pending")}</p>
            <p className="text-sm text-muted-foreground">
              {t("ownership_transfer_to", {
                name: local(transfer.proposed_owner_name_en, transfer.proposed_owner_name_ar),
                branch: local(transfer.branch_name_en, transfer.branch_name_ar),
              })}
            </p>
            {transfer.verified ? (
              <Badge>{t("awaiting_contributor_acceptance")}</Badge>
            ) : (
              <Badge variant="outline">{t("verification_code_required")}</Badge>
            )}
            <Button
              variant="outline"
              loading={transferController.action === "cancel"}
              disabled={Boolean(transferController.action)}
              onClick={() => void transferController.act("cancel")}
            >
              {t("cancel_transfer")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
