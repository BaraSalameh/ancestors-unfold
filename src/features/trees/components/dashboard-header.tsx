import { CircleGauge, Clock3, GitBranch, UserRoundCog, Users } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import type { Branch, CurrentTree, DashboardInsights, Statistics } from "../pages/dashboard-types";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { OwnershipTransfer } from "../pages/dashboard-types";
import { DashboardStat } from "./dashboard-components";
import { DashboardHeaderActions } from "./dashboard-header-actions";
import { dashboardKpis, dashboardRelativeTime } from "../pages/dashboard-projections";

export function DashboardHeader({
  tree,
  stats,
  branches,
  insights,
  treeControls,
  accountDeletion,
  transfer,
  ownershipTransfer,
}: {
  tree: CurrentTree;
  stats: Statistics;
  branches: Branch[];
  insights: DashboardInsights;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
  transfer: OwnershipTransferController;
  ownershipTransfer: OwnershipTransfer | null;
}) {
  const { t, lang } = useI18n();
  const name =
    lang === "ar" ? tree.name_ar || tree.name_en || "" : tree.name_en || tree.name_ar || "";
  const assigned = branches.find((branch) => branch.id === tree.assigned_branch_id);
  const assignedHealth = insights.branches.find((branch) => branch.id === tree.assigned_branch_id);
  const kpis = dashboardKpis(tree, stats, assignedHealth);
  const kpiPresentation = {
    members: { icon: <Users />, label: t("people_recorded") },
    contributors: { icon: <UserRoundCog />, label: t("active_contributors") },
    branches: { icon: <GitBranch />, label: t("managed_branch_ratio") },
    branch_members: { icon: <Users />, label: t("people_in_assigned_branch") },
    completeness: { icon: <CircleGauge />, label: t("recorded_data_completeness_label") },
    last_activity: { icon: <Clock3 />, label: t("last_activity") },
  };
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-primary">{t("family_dashboard")}</p>
              <Badge variant="secondary">
                {tree.role === "owner"
                  ? t("owner_role")
                  : t("contributor_role", {
                      branch: assigned
                        ? lang === "ar"
                          ? assigned.name_ar || assigned.name_en
                          : assigned.name_en
                        : t("assigned_branch"),
                    })}
              </Badge>
              {tree.affiliation_status !== "active" ? (
                <Badge variant="outline">{t("read_only")}</Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-3xl font-bold">{name}</h1>
            <p className="mt-2 text-muted-foreground">
              {t(tree.role === "owner" ? "owner_dashboard_intro" : "contributor_dashboard_intro")}
            </p>
          </div>
          <DashboardHeaderActions
            tree={tree}
            treeControls={treeControls}
            accountDeletion={accountDeletion}
            transfer={transfer}
            ownershipTransfer={ownershipTransfer}
          />
        </div>
        <div className="mt-7 grid overflow-hidden rounded-xl border bg-background sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const presentation = kpiPresentation[kpi.kind];
            const value =
              kpi.kind === "last_activity"
                ? (dashboardRelativeTime(kpi.value as string | null, lang) ?? t("no_activity_yet"))
                : (kpi.value ?? "—");
            return (
              <DashboardStat
                key={kpi.kind}
                icon={presentation.icon}
                label={presentation.label}
                value={value}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
