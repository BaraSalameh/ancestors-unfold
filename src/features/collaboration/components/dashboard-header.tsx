import { CircleGauge, Clock3, GitBranch, UserRoundCog, Users } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import { dashboardKpis, dashboardRelativeTime } from "../pages/dashboard-projections";
import type {
  Branch,
  CurrentTree,
  DashboardInsights,
  DashboardResource,
  OwnershipTransfer,
  Statistics,
} from "../pages/dashboard-types";
import { DashboardStat } from "./dashboard-components";
import { DashboardHeaderActions } from "./dashboard-header-actions";
import { DashboardResourceState } from "./dashboard-resource-state";

interface DashboardHeaderProps {
  tree: CurrentTree;
  statistics: DashboardResource<Statistics>;
  branchResource: DashboardResource<Branch[]>;
  insights: DashboardInsights;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
  transfer: OwnershipTransferController;
  ownershipTransfer: OwnershipTransfer | null;
}

export function DashboardHeader(props: DashboardHeaderProps) {
  const { t, lang } = useI18n();
  const assigned = props.branchResource.data?.find(
    (branch) => branch.id === props.tree.assigned_branch_id,
  );
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-primary">{t("family_dashboard")}</p>
              <Badge variant="secondary">
                {props.tree.role === "owner"
                  ? t("owner_role")
                  : t("contributor_role", {
                      branch: assignedBranchLabel(assigned, lang, t("assigned_branch")),
                    })}
              </Badge>
              {props.tree.affiliation_status !== "active" ? (
                <Badge variant="outline">{t("read_only")}</Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-3xl font-bold">{localizedTreeName(props.tree, lang)}</h1>
            <p className="mt-2 text-muted-foreground">
              {t(
                props.tree.role === "owner"
                  ? "owner_dashboard_intro"
                  : "contributor_dashboard_intro",
              )}
            </p>
          </div>
          <DashboardHeaderActions
            tree={props.tree}
            treeControls={props.treeControls}
            accountDeletion={props.accountDeletion}
            transfer={props.transfer}
            ownershipTransfer={props.ownershipTransfer}
          />
        </div>
        <DashboardKpiSection
          tree={props.tree}
          statistics={props.statistics}
          insights={props.insights}
          lang={lang}
          t={t}
        />
      </div>
    </section>
  );
}

function localizedTreeName(tree: CurrentTree, lang: "en" | "ar") {
  return lang === "ar" ? tree.name_ar || tree.name_en || "" : tree.name_en || tree.name_ar || "";
}

function assignedBranchLabel(branch: Branch | undefined, lang: "en" | "ar", fallback: string) {
  if (!branch) return fallback;
  return lang === "ar" ? branch.name_ar || branch.name_en : branch.name_en;
}

function DashboardKpiSection({
  tree,
  statistics,
  insights,
  lang,
  t,
}: {
  tree: CurrentTree;
  statistics: DashboardResource<Statistics>;
  insights: DashboardInsights;
  lang: "en" | "ar";
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (!statistics.data) {
    return (
      <div className="mt-7">
        <DashboardResourceState
          pending={statistics.pending}
          error={statistics.error}
          retry={statistics.retry}
          rows={1}
        />
      </div>
    );
  }
  const assignedHealth = insights.branches.find((branch) => branch.id === tree.assigned_branch_id);
  const kpis = dashboardKpis(tree, statistics.data, assignedHealth);
  const presentation = {
    members: { icon: <Users />, label: t("people_recorded") },
    contributors: { icon: <UserRoundCog />, label: t("active_contributors") },
    branches: { icon: <GitBranch />, label: t("managed_branch_ratio") },
    branch_members: { icon: <Users />, label: t("people_in_assigned_branch") },
    completeness: { icon: <CircleGauge />, label: t("recorded_data_completeness_label") },
    last_activity: { icon: <Clock3 />, label: t("last_activity") },
  };
  return (
    <div className="mt-7 space-y-3">
      <div className="grid overflow-hidden rounded-xl border bg-background sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const display = presentation[kpi.kind];
          const value =
            kpi.kind === "last_activity"
              ? (dashboardRelativeTime(kpi.value as string | null, lang) ?? t("no_activity_yet"))
              : (kpi.value ?? "—");
          return (
            <DashboardStat key={kpi.kind} icon={display.icon} label={display.label} value={value} />
          );
        })}
      </div>
      {statistics.error ? (
        <DashboardResourceState pending={false} error retry={statistics.retry} />
      ) : null}
    </div>
  );
}
