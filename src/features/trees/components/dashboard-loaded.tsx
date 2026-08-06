import { useI18n } from "@/shared/i18n";
import type { DashboardData, DashboardInsights } from "../pages/dashboard-types";
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
  data: DashboardData;
  insights: DashboardInsights;
  treeControls: DashboardTreeControls;
  transfer: OwnershipTransferController;
  accountDeletion: ContributorAccountDeletionController;
}

export function DashboardLoaded({
  data,
  insights,
  treeControls,
  transfer,
  accountDeletion,
}: DashboardLoadedProps) {
  const { lang } = useI18n();
  const local = (en?: string | null, ar?: string | null) =>
    lang === "ar" ? ar || en || "" : en || ar || "";
  const ownershipTransfer = data.ownershipTransfer;
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <DashboardHeader
        tree={data.tree}
        stats={data.stats}
        branches={data.branches}
        insights={insights}
        treeControls={treeControls}
        accountDeletion={accountDeletion}
        transfer={transfer}
        ownershipTransfer={ownershipTransfer}
      />
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {data.tree.role === "contributor" &&
            ownershipTransfer?.proposed_owner_user_id &&
            ownershipTransfer.verified && (
              <div id="ownership-transfer" className="scroll-mt-20">
                <OwnershipTransferPrompt
                  transfer={ownershipTransfer}
                  local={local}
                  action={transfer.action}
                  onAction={transfer.act}
                />
              </div>
            )}
          {data.tree.role === "owner" && ownershipTransfer && (
            <div id="ownership-transfer" className="scroll-mt-20">
              <OwnershipTransferStatus
                transfer={ownershipTransfer}
                controller={transfer}
                local={local}
              />
            </div>
          )}
          <NeedsAttentionCard data={data} insights={insights} />
          <BranchesCard data={data} insights={insights} local={local} />
        </div>
        <div className="space-y-5">
          <RecentActivityCard data={data} />
          <AuthenticityCard data={data} local={local} />
        </div>
      </section>
      <OwnershipTransferDialog
        controller={transfer}
        transfer={ownershipTransfer}
        branches={data.branches.filter(
          (branch) => branch.status === "active" && Boolean(branch.contributor_user_id),
        )}
        local={local}
      />
      <ManageFamilyDialog controller={treeControls} />
      <ContributorAccountDeletionDialog controller={accountDeletion} />
    </main>
  );
}
