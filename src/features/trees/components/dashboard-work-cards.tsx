import { Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { activityDescription } from "../domain/activity-label";
import {
  dashboardAttentionItems,
  dashboardRelativeTime,
  canEditDashboardTree,
  type AttentionItem,
} from "../pages/dashboard-projections";
import type { ActivityItem } from "../domain/activity-label";
import type {
  Branch,
  CurrentTree,
  DashboardInsights,
  DashboardResource,
  Invitation,
  OwnershipTransfer,
  Statistics,
} from "../pages/dashboard-types";
import { DashboardResourceState } from "./dashboard-resource-state";

function attentionLabel(item: AttentionItem, t: ReturnType<typeof useI18n>["t"]) {
  const labels = {
    access: "dashboard_attention_access",
    ownership_transfer: "dashboard_attention_transfer",
    authenticity_review: "dashboard_attention_authenticity",
    graph_cycles: "analysis_graph_cycles",
    contradictory_dates: "analysis_contradictory_dates",
    pending_invitations: "pending_invitations",
    inactive_branches: "dashboard_attention_inactive_branches",
    possible_duplicates: "analysis_possible_duplicates",
    missing_name_en: "analysis_missing_name_en",
    missing_name_ar: "analysis_missing_name_ar",
    missing_birth_date: "analysis_missing_birth",
    missing_branch: "analysis_missing_branch",
    missing_image: "analysis_missing_image",
  } as const;
  return t(labels[item.id], { count: item.count });
}

function AttentionIcon({ severity }: Pick<AttentionItem, "severity">) {
  if (severity === "critical")
    return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  if (severity === "warning")
    return (
      <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
    );
  return <Info className="h-4 w-4 text-primary" aria-hidden="true" />;
}

function AttentionAction({ item, tree }: { item: AttentionItem; tree: CurrentTree }) {
  const { t } = useI18n();
  if (item.id === "pending_invitations" || item.id === "inactive_branches") {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/branches" search={{ treeId: tree.id }}>
          {t("review")}
        </Link>
      </Button>
    );
  }
  if (item.analysis) {
    const branchId = tree.role === "contributor" ? tree.assigned_branch_id : undefined;
    return (
      <Button asChild variant="ghost" size="sm">
        <Link
          to="/analysis"
          search={{
            tab: item.analysis.tab,
            branchId: branchId ?? undefined,
            missingField: item.analysis.missingField,
          }}
        >
          {t("review")}
        </Link>
      </Button>
    );
  }
  if (item.anchor) {
    return (
      <Button asChild variant="ghost" size="sm">
        <a href={`#${item.anchor}`}>{t("review")}</a>
      </Button>
    );
  }
  return null;
}

export function NeedsAttentionCard({
  tree,
  statistics,
  branches,
  invitations,
  ownershipTransfer,
  insights,
}: {
  tree: CurrentTree;
  statistics: DashboardResource<Statistics>;
  branches: DashboardResource<Branch[]>;
  invitations: DashboardResource<Invitation[]>;
  ownershipTransfer: DashboardResource<OwnershipTransfer | null>;
  insights: DashboardInsights;
}) {
  const { t } = useI18n();
  const items = dashboardAttentionItems(
    {
      tree,
      stats: statistics.data,
      branches: branches.data,
      invitations: invitations.data,
      ownershipTransfer: ownershipTransfer.data,
    },
    insights.quality,
  );
  const pending =
    statistics.pending ||
    branches.pending ||
    invitations.pending ||
    ownershipTransfer.pending ||
    insights.qualityPending;
  const failures = [statistics, branches, invitations, ownershipTransfer].filter(
    (resource) => resource.error,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("needs_attention")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
            <AttentionIcon severity={item.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{attentionLabel(item, t)}</p>
              <p className="text-xs text-muted-foreground">
                {t("dashboard_attention_count", { count: item.count })}
              </p>
            </div>
            <AttentionAction item={item} tree={tree} />
          </div>
        ))}
        {pending ? (
          <DashboardResourceState pending error={false} retry={() => {}} rows={2} />
        ) : null}
        {!pending && items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-primary" aria-hidden="true" />
            <p className="mt-2 font-medium">{t("all_caught_up")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("all_caught_up_description")}</p>
          </div>
        ) : null}
        {failures.map((resource, index) => (
          <DashboardResourceState key={index} pending={false} error retry={resource.retry} />
        ))}
        {insights.qualityError ? (
          <DashboardResourceState pending={false} error retry={insights.retryQuality} />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RecentActivityCard({
  tree,
  activity,
}: {
  tree: CurrentTree;
  activity: DashboardResource<ActivityItem[]>;
}) {
  const { t, lang } = useI18n();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("recent_activity")}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity">{t("view_all")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!activity.data ? (
          <DashboardResourceState
            pending={activity.pending}
            error={activity.error}
            retry={activity.retry}
            rows={3}
          />
        ) : null}
        {activity.data?.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <Activity className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">{t("no_activity")}</p>
            {canEditDashboardTree(tree) ? (
              <Button asChild variant="link" size="sm" className="mt-1">
                <Link to="/tree/$id" params={{ id: tree.id }} search={{ mode: "edit" }}>
                  {t("start_editing")}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {activity.data?.map((item) => {
          return (
            <div key={item.id} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0">
              <span className="mt-0.5 shrink-0 self-start rounded-full bg-primary/10 p-1.5 text-primary">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{activityDescription(item, lang, t)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {item.branch ? (
                    <Badge variant="outline" className="max-w-full truncate text-[10px]">
                      {lang === "ar"
                        ? item.branch.nameAr || item.branch.nameEn
                        : item.branch.nameEn || item.branch.nameAr}
                    </Badge>
                  ) : null}
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={item.createdAt}
                    title={new Date(item.createdAt).toLocaleString(lang)}
                  >
                    {dashboardRelativeTime(item.createdAt, lang)}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
        {activity.data && activity.error ? (
          <DashboardResourceState pending={false} error retry={activity.retry} />
        ) : null}
      </CardContent>
    </Card>
  );
}
