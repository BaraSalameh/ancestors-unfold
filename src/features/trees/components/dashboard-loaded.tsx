import { useI18n } from "@/shared/i18n";
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
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";
import { OwnershipTransferDialog } from "./ownership-transfer-dialog";
import { ManageFamilyDialog } from "./tree-rename-dialog";
import { ContributorAccountDeletionDialog } from "./contributor-account-deletion-dialog";
import { DashboardHeader } from "./dashboard-header";
import { AuthenticityCard, BranchesCard } from "./dashboard-cards";
import { OwnershipTransferPrompt, OwnershipTransferStatus } from "./dashboard-components";
import { NeedsAttentionCard, RecentActivityCard } from "./dashboard-work-cards";

interface DashboardLoadedProps {
  tree: CurrentTree;
  statistics: DashboardResource<Statistics>;
  branches: DashboardResource<Branch[]>;
  activity: DashboardResource<ActivityItem[]>;
  invitations: DashboardResource<Invitation[]>;
  ownershipTransfer: DashboardResource<OwnershipTransfer | null>;
  insights: DashboardInsights;
  treeControls: DashboardTreeControls;
  transfer: OwnershipTransferController;
  accountDeletion: ContributorAccountDeletionController;
}

export function DashboardLoaded({
  tree,
  statistics,
  branches,
  activity,
  invitations,
  ownershipTransfer,
  insights,
  treeControls,
  transfer,
  accountDeletion,
}: DashboardLoadedProps) {
  const { lang } = useI18n();
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const transferData = ownershipTransfer.data;
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <DashboardHeader
        tree={tree}
        statistics={statistics}
        branchResource={branches}
        insights={insights}
        treeControls={treeControls}
        accountDeletion={accountDeletion}
        transfer={transfer}
        ownershipTransfer={transferData ?? null}
      />
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {tree.role === "contributor" &&
            transferData?.proposed_owner_user_id &&
            transferData.verified && (
              <div id="ownership-transfer" className="scroll-mt-20">
                <OwnershipTransferPrompt
                  transfer={transferData}
                  local={local}
                  action={transfer.action}
                  onAction={transfer.act}
                />
              </div>
            )}
          {tree.role === "owner" && transferData && (
            <div id="ownership-transfer" className="scroll-mt-20">
              <OwnershipTransferStatus
                transfer={transferData}
                controller={transfer}
                local={local}
              />
            </div>
          )}
          <NeedsAttentionCard
            tree={tree}
            statistics={statistics}
            branches={branches}
            invitations={invitations}
            ownershipTransfer={ownershipTransfer}
            insights={insights}
          />
          <BranchesCard
            tree={tree}
            branchResource={branches}
            statistics={statistics}
            insights={insights}
            local={local}
          />
        </div>
        <div className="space-y-5">
          <RecentActivityCard tree={tree} activity={activity} />
          <AuthenticityCard statistics={statistics} local={local} />
        </div>
      </section>
      <OwnershipTransferDialog
        controller={transfer}
        transfer={transferData ?? null}
        branches={(branches.data ?? []).filter(
          (branch) => branch.status === "active" && Boolean(branch.contributor_user_id),
        )}
        local={local}
      />
      <ManageFamilyDialog controller={treeControls} />
      <ContributorAccountDeletionDialog controller={accountDeletion} />
    </main>
  );
}
