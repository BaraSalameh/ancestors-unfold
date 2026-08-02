import { GitBranch, UserRoundCog, Users } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { CurrentTree, Statistics } from "../pages/dashboard-types";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import type { DashboardInvitationsController } from "../client/use-dashboard-invitations";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { ContributorRemovalController } from "../client/use-contributor-removal";
import type { OwnershipTransfer } from "../pages/dashboard-types";
import { DashboardStat } from "./dashboard-components";
import { DashboardHeaderActions } from "./dashboard-header-actions";

export function DashboardHeader({
  tree,
  stats,
  treeControls,
  accountDeletion,
  invitation,
  transfer,
  removal,
  ownershipTransfer,
}: {
  tree: CurrentTree;
  stats: Statistics;
  treeControls: DashboardTreeControls;
  accountDeletion: ContributorAccountDeletionController;
  invitation: DashboardInvitationsController;
  transfer: OwnershipTransferController;
  removal: ContributorRemovalController;
  ownershipTransfer: OwnershipTransfer | null;
}) {
  const { t, lang } = useI18n();
  const name =
    lang === "ar" ? tree.name_ar || tree.name_en || "" : tree.name_en || tree.name_ar || "";
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-primary">{t("family_dashboard")}</p>
            <h1 className="mt-2 text-3xl font-bold">{name}</h1>
            {tree.role === "contributor" && (
              <p className="mt-2 text-muted-foreground">{t("contributor_dashboard_intro")}</p>
            )}
          </div>
          <DashboardHeaderActions
            tree={tree}
            treeControls={treeControls}
            accountDeletion={accountDeletion}
            invitation={invitation}
            transfer={transfer}
            removal={removal}
            ownershipTransfer={ownershipTransfer}
          />
        </div>
        <div className="mt-7 grid overflow-hidden rounded-xl border bg-background sm:grid-cols-2 lg:grid-cols-4">
          <DashboardStat
            icon={<Users />}
            label={t("people_recorded")}
            value={stats.total_members}
          />
          <DashboardStat
            icon={<UserRoundCog />}
            label={t("active_contributors")}
            value={stats.active_contributors}
          />
          <DashboardStat
            icon={<GitBranch />}
            label={t("managed_branches")}
            value={stats.managed_branches}
          />
          <DashboardStat
            icon={<GitBranch />}
            label={t("total_branches")}
            value={stats.total_branches}
          />
        </div>
      </div>
    </section>
  );
}
