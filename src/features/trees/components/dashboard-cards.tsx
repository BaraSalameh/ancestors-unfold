import { AlertTriangle, RotateCw, ShieldCheck, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n";
import type { DashboardData, DashboardInsights } from "../pages/dashboard-types";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import { AuthenticityRoadmap } from "./authenticity-roadmap";
import { DashboardFact } from "./dashboard-components";
import { canEditDashboardTree, dashboardBranches } from "../pages/dashboard-projections";

type InvitationController = DashboardInvitationsController;
type Local = (en?: string | null, ar?: string | null) => string;

export function BranchesCard({
  data,
  insights,
  local,
}: {
  data: DashboardData;
  insights: DashboardInsights;
  local: Local;
}) {
  const { t } = useI18n();
  const branches = dashboardBranches(data.tree, data.branches, insights.branches);
  const healthById = new Map(insights.branches.map((branch) => [branch.id, branch]));
  return (
    <Card id="branches" className="scroll-mt-20">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{data.tree.role === "owner" ? t("branches") : t("assigned_branch")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {branches.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            {t("no_assigned_branches")}
          </p>
        ) : null}
        {branches.map((branch) => {
          const health = healthById.get(branch.id);
          return (
            <div
              key={branch.id}
              className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{local(branch.name_en, branch.name_ar)}</p>
                <p className="text-sm text-muted-foreground">
                  {t("branch_responsible", {
                    name: branch.contributor_name_en
                      ? local(branch.contributor_name_en, branch.contributor_name_ar)
                      : local(data.stats.owner_name_en, data.stats.owner_name_ar),
                  })}
                </p>
                {health ? (
                  <div className="mt-3 max-w-md space-y-1.5">
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t("branch_people_recorded", { count: health.total })}</span>
                      <span>
                        {t("recorded_data_completeness", {
                          count: health.completeness_percent,
                        })}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={t("recorded_data_completeness_label")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={health.completeness_percent}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${health.completeness_percent}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                  {t(branch.status === "active" ? "branch_active" : "branch_inactive")}
                </Badge>
                {data.tree.analysis_enabled !== false ? (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/analysis"
                      search={{ tab: "quality", branchId: branch.id, missingField: undefined }}
                    >
                      {t("review_data")}
                    </Link>
                  </Button>
                ) : null}
                {data.tree.role === "contributor" && canEditDashboardTree(data.tree) ? (
                  <Button asChild size="sm">
                    <Link to="/tree/$id" params={{ id: data.tree.id }} search={{ mode: "edit" }}>
                      {t("continue_branch")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
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
    <Card id="pending-invitations" className="scroll-mt-20">
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

export function AuthenticityCard({ data, local }: { data: DashboardData; local: Local }) {
  const { t } = useI18n();
  const stats = data.stats;
  const levelLabel = {
    new: t("new_family_tree"),
    growing: t("growing_family_tree"),
    family_backed: t("family_backed_tree"),
    established: t("established_family_tree"),
  }[stats.earned_authenticity_level];
  return (
    <Card id="authenticity" className="scroll-mt-20">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">{t("authenticity")}</p>
              <p className="text-sm text-muted-foreground">{levelLabel}</p>
            </div>
          </div>
          <Badge
            variant={stats.authenticity_level === "under_review" ? "destructive" : "secondary"}
          >
            {t(
              stats.authenticity_level === "under_review" ? "under_review" : "authenticity_current",
            )}
          </Badge>
        </div>
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
        <p className="text-sm text-muted-foreground">{t("family_backed_explanation")}</p>
        <AuthenticityRoadmap stats={stats} />
        <dl className="space-y-3 border-t pt-4 text-sm">
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
